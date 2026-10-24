import json
import re
import uuid
from typing import Dict, Any, List, Optional
from app.config import settings
from app.db import get_db
from app.models.schemas import (
    CurriculumHierarchySubmission,
    ChapterChunk,
    SubTopicChunk
)
from app.agents.loop import run_agent_loop, log_agent_step
from app.agents.tools import split_sections

CHUNKING_AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_textbook_overview",
            "description": "Returns total page count and preview of each page to see macro structure and chapter boundaries.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "read_page_range",
            "description": "Reads the full text of specific pages (capped at 5 pages per call) to inspect chapter boundaries and sub-topic details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_page": {"type": "integer", "description": "Starting page number (1-indexed)"},
                    "end_page": {"type": "integer", "description": "Ending page number (inclusive, max 5 pages)"}
                },
                "required": ["start_page", "end_page"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_textbook",
            "description": "Searches across textbook source pages for chapter headings, section titles, numbers, or keywords.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search keyword or phrase, e.g. 'Chapter 1' or 'Big Numbers'"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "split_sections",
            "description": "Measures chapter pages and splits into topics according to chunking policy (small chapter = 1 topic, large chapter = ~1200 word topics).",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_page": {"type": "integer"},
                    "end_page": {"type": "integer"}
                },
                "required": ["start_page", "end_page"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "submit_curriculum_hierarchy",
            "description": "Submits the final hierarchical curriculum structure: Level 1 Chapters and Level 2 Sub-Topics with verified page ranges.",
            "parameters": {
                "type": "object",
                "properties": {
                    "subject_tag": {"type": "string", "description": "Subject tag, e.g. Maths, English, Science, EVS, Hindi, Social Studies"},
                    "chapters": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "chapter_number": {"type": "integer"},
                                "chapter_title": {"type": "string"},
                                "start_page": {"type": "integer"},
                                "end_page": {"type": "integer"},
                                "topics": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "topic_number": {"type": "integer"},
                                            "name": {"type": "string", "description": "Clear, child-friendly sub-topic title"},
                                            "summary": {"type": "string", "description": "1-sentence overview of what this sub-topic covers"},
                                            "start_page": {"type": "integer"},
                                            "end_page": {"type": "integer"}
                                        },
                                        "required": ["topic_number", "name", "summary", "start_page", "end_page"]
                                    }
                                }
                            },
                            "required": ["chapter_number", "chapter_title", "start_page", "end_page", "topics"]
                        }
                    }
                },
                "required": ["subject_tag", "chapters"]
            }
        }
    }
]

def is_toc_page(text: str) -> bool:
    """Detects if a page is a Table of Contents / Index page."""
    lines = [l.strip().lower() for l in text.splitlines() if l.strip()]
    for line in lines[:5]:
        if line in ["contents", "table of contents", "index", "syllabus"]:
            return True
        if re.match(r'^(contents|table of contents)\b', line):
            return True
    return False

def clean_page_lines(page_text: str) -> List[str]:
    """Filters out running headers, footers, and page numbers."""
    lines = [l.strip() for l in page_text.splitlines() if l.strip()]
    cleaned = []
    for l in lines:
        if re.search(r'^(maths magic|science discoveries|dotlink demo|back to contents|page \d+|\d+)$', l, re.IGNORECASE):
            continue
        if re.search(r'^(maths magic\s*\|\s*grade\s*\d+)$', l, re.IGNORECASE):
            continue
        cleaned.append(l)
    return cleaned

def extract_summary_from_lines(lines: List[str], heading_idx: int) -> str:
    """Extracts the first informative sentence under a topic heading."""
    for line in lines[heading_idx+1:heading_idx+6]:
        clean = line.strip()
        if not clean or len(clean) < 15:
            continue
        if re.search(r'^(chapter|topic|\d+\.\d+|worked example|try it|key points)', clean, re.IGNORECASE):
            continue
        s = re.split(r'(?<=[.!?])\s+', clean)[0]
        if len(s) >= 15:
            return s[:180].strip()
    return ""

def extract_curriculum_structure(
    pages_rows: List[Dict[str, Any]],
    textbook_title: str,
    subject_tag: str
) -> CurriculumHierarchySubmission:
    """
    Deterministically parses document pages to extract authentic chapters and sub-topics.
    Handles explicit chapter headers ('Chapter 1: ...'), section codes ('1.1 ...'),
    colon headings ('Looking at Brick Patterns:'), and single-chapter textbooks.
    """
    chap_re = re.compile(r'^(?:Chapter|Unit|Lesson)\s*(\d+)[:\s\.\-]+([^\n\r]+)', re.IGNORECASE)
    topic_re = re.compile(r'^(?:(?:Topic\s*)?(\d+\.\d+)[:\s\-]+([^\n\r]+))', re.IGNORECASE)
    colon_heading_re = re.compile(r'^([A-Z][A-Za-z0-9\s,\-]{2,45}):\s*([A-Z].*)?$')

    content_pages = [p for p in pages_rows if not is_toc_page(p['text'])]
    if not content_pages:
        content_pages = pages_rows

    detected_chapters = []
    current_chap = None

    for p in content_pages:
        p_num = p['page_number']
        lines = clean_page_lines(p['text'])

        # Check if page introduces a Chapter
        chap_match = None
        for idx, line in enumerate(lines[:6]):
            m = chap_re.search(line)
            if m:
                chap_match = (m, idx)
                break

        if chap_match:
            m, c_idx = chap_match
            c_num = int(m.group(1))
            c_title = m.group(2).strip()
            c_title = re.sub(r'[\.\s\d]+$', '', c_title).strip()

            if current_chap and current_chap['chapter_number'] == c_num and current_chap['chapter_title'].lower() == c_title.lower():
                # Repeated chapter header on subsequent page of same chapter
                pass
            else:
                if current_chap:
                    current_chap['end_page'] = p_num - 1
                current_chap = {
                    'chapter_number': c_num,
                    'chapter_title': c_title,
                    'start_page': p_num,
                    'end_page': p_num,
                    'topics': []
                }
                detected_chapters.append(current_chap)

        # Check for sub-topics on this page
        for idx, line in enumerate(lines):
            if chap_re.search(line):
                continue

            tm = topic_re.search(line)
            if tm:
                top_code = tm.group(1).strip()
                top_title = tm.group(2).strip()
                top_title = re.sub(r'[\.\s\d]+$', '', top_title).strip()
                parts = top_code.split('.')
                t_num = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else (len(current_chap['topics']) + 1 if current_chap else 1)

                if current_chap:
                    if not any(t['name'].lower() == top_title.lower() for t in current_chap['topics']):
                        summ = extract_summary_from_lines(lines, idx)
                        if not summ:
                            summ = f"Explores foundational concepts and practical problems in {top_title}."
                        current_chap['topics'].append({
                            'topic_number': t_num,
                            'name': top_title,
                            'summary': summ,
                            'start_page': p_num,
                            'end_page': p_num
                        })
            else:
                # Check colon heading (e.g. "Looking at Brick Patterns: ...")
                cm = colon_heading_re.match(line)
                if cm and current_chap:
                    top_title = cm.group(1).strip()
                    if not any(t['name'].lower() == top_title.lower() for t in current_chap['topics']):
                        inline_text = cm.group(2).strip() if cm.group(2) else ""
                        summ = inline_text if len(inline_text) >= 15 else extract_summary_from_lines(lines, idx)
                        if not summ:
                            summ = f"Key definitions and visual exercises for {top_title}."
                        current_chap['topics'].append({
                            'topic_number': len(current_chap['topics']) + 1,
                            'name': top_title,
                            'summary': summ,
                            'start_page': p_num,
                            'end_page': p_num
                        })

    # If no chapters detected, treat as single chapter
    if not detected_chapters:
        start_p = content_pages[0]['page_number']
        end_p = content_pages[-1]['page_number']
        detected_chapters = [{
            'chapter_number': 1,
            'chapter_title': textbook_title,
            'start_page': start_p,
            'end_page': end_p,
            'topics': []
        }]

    # Adjust end pages for chapters and topics (exclude trailing Answer Key / Appendix from last topic)
    last_page = pages_rows[-1]['page_number']
    for p in reversed(pages_rows):
        if re.search(r'\b(answer key|answers|solutions|glossary)\b', p['text'], re.IGNORECASE):
            last_page = max(1, p['page_number'] - 1)
            break
    detected_chapters[-1]['end_page'] = max(detected_chapters[-1]['start_page'], last_page)

    for c in detected_chapters:
        c_pages = [p for p in content_pages if c['start_page'] <= p['page_number'] <= c['end_page']]
        section_topics = split_sections(c_pages, chapter_title=c['chapter_title'], chapter_number=c['chapter_number'])
        c['topics'] = [
            {
                'topic_number': st['topic_number'],
                'name': st['name'],
                'summary': st.get('summary', f"Exploration of {st['name']}."),
                'start_page': st['start_page'],
                'end_page': st['end_page'],
                'decision_trace': st.get('decision_trace', '')
            }
            for st in section_topics
        ]

    final_chapters = []
    for c in detected_chapters:
        sub_topics = [SubTopicChunk(**t) for t in c['topics']]
        final_chapters.append(ChapterChunk(
            chapter_number=c['chapter_number'],
            chapter_title=c['chapter_title'],
            start_page=c['start_page'],
            end_page=c['end_page'],
            topics=sub_topics
        ))

    return CurriculumHierarchySubmission(
        subject_tag=subject_tag,
        chapters=final_chapters
    )

async def run_textbook_chunking_agent(
    textbook_id: str,
    grade: int,
    subject_tag: str,
    db
) -> Dict[str, Any]:
    """
    Executes Agent 1 (Textbook Chunking Agent):
    Analyzes textbook pages and organizes into:
    - Level 1: Chapters (Chapter Number, Chapter Title, Start Page, End Page)
    - Level 2: Sub-Topics under each Chapter (Topic Number, Title, Summary, Start Page, End Page)
    Combines agentic multi-tool loop with authentic document structure detection.
    """
    run_id = str(uuid.uuid4())

    # Fetch textbook page count and pages
    cursor = await db.execute("""
        SELECT page_number, text FROM source_pages
        WHERE textbook_id = ?
        ORDER BY page_number ASC
    """, (textbook_id,))
    pages_rows = await cursor.fetchall()
    page_count = len(pages_rows)
    pages_map = {r["page_number"]: r["text"] for r in pages_rows}

    # Fetch textbook title
    tb_cursor = await db.execute("SELECT title FROM textbooks WHERE id = ?", (textbook_id,))
    tb_row = await tb_cursor.fetchone()
    textbook_title = tb_row["title"] if tb_row else f"{subject_tag} Grade {grade}"

    # Extract authentic baseline structure directly from document text
    detected_hierarchy = extract_curriculum_structure(pages_rows, textbook_title, subject_tag)

    async def tool_executor(name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        if name == "get_textbook_overview":
            overview = []
            for p in pages_rows:
                lines = clean_page_lines(p["text"])
                preview = p["text"][:250].replace("\n", " ")
                overview.append({
                    "page_number": p["page_number"],
                    "leading_lines": lines[:3],
                    "preview": preview
                })
            return {"page_count": page_count, "pages": overview}

        elif name == "read_page_range":
            sp = max(1, args.get("start_page", 1))
            ep = max(sp, args.get("end_page", sp))
            ep = min(ep, sp + 4, page_count)
            results = []
            for p_num in range(sp, ep + 1):
                results.append({
                    "page_number": p_num,
                    "text": pages_map.get(p_num, "")
                })
            return {"pages": results}

        elif name == "search_textbook":
            query = args.get("query", "").strip().lower()
            if not query:
                return {"results": []}
            matches = []
            for p in pages_rows:
                if query in p["text"].lower():
                    idx = p["text"].lower().find(query)
                    start = max(0, idx - 40)
                    end = min(len(p["text"]), idx + len(query) + 80)
                    matches.append({
                        "page_number": p["page_number"],
                        "snippet": p["text"][start:end].replace("\n", " ")
                    })
                    if len(matches) >= 8:
                        break
        elif name == "split_sections":
            sp = max(1, args.get("start_page", 1))
            ep = max(sp, args.get("end_page", page_count))
            subset_pages = [p for p in pages_rows if sp <= p["page_number"] <= ep]
            return {"topics": split_sections(subset_pages, textbook_title)}

        return {"error": f"Unknown tool: {name}"}

    # Format detected structure for agent prompt
    outline_lines = []
    for c in detected_hierarchy.chapters:
        outline_lines.append(f"Chapter {c.chapter_number}: {c.chapter_title} (Pages {c.start_page} to {c.end_page})")
        for t in c.topics:
            outline_lines.append(f"  - Topic {c.chapter_number}.{t.topic_number}: {t.name} (Pages {t.start_page} to {t.end_page}) - {t.summary}")
    detected_outline_str = "\n".join(outline_lines)

    system_prompt = (
        f"You are Agent 1 (Textbook Chunking Agent). You analyze textbook pages for Grade {grade} {subject_tag} "
        f"('{textbook_title}', {page_count} pages total).\n"
        f"Your mission is hierarchical curriculum organization:\n"
        f"1. Level 1: Divide into Chapters (chapter_number, chapter_title, start_page, end_page).\n"
        f"2. Level 2: Subdivide each Chapter into 2 to 4 bite-sized, playable Sub-Topics (topic_number, name, summary, start_page, end_page).\n\n"
        f"The document structural analyzer has identified the following authentic outline from the textbook pages:\n"
        f"{detected_outline_str}\n\n"
        f"Instructions:\n"
        f"- Review and refine this hierarchy. Ensure each sub-topic has an engaging 1-sentence summary and verified page bounds.\n"
        f"- You can inspect pages using read_page_range if needed.\n"
        f"- Immediately call submit_curriculum_hierarchy to finalize the curriculum."
    )

    initial_user_msg = (
        f"Textbook: '{textbook_title}' ({page_count} pages, Grade {grade} {subject_tag}).\n\n"
        f"Authentic Document Outline:\n{detected_outline_str}\n\n"
        f"Please verify and call submit_curriculum_hierarchy."
    )
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": initial_user_msg}
    ]

    hierarchy_result = None

    if settings.GROQ_API_KEY or settings.GEMINI_API_KEY:
        try:
            hierarchy_result = await run_agent_loop(
                agent_name="chunking_agent",
                run_id=run_id,
                topic_id=None,
                task_weight="light",
                messages=messages,
                tool_definitions=CHUNKING_AGENT_TOOLS,
                tool_executor=tool_executor,
                submit_tool_name="submit_curriculum_hierarchy",
                submit_validator=CurriculumHierarchySubmission,
                db=db
            )
        except Exception as e:
            try:
                await log_agent_step(
                    db, run_id, None, "chunking_agent", 99, "fallback_chunker",
                    {}, f"Agent notice: {str(e)[:160]}. Used verified document structure."
                )
            except Exception:
                pass
            hierarchy_result = detected_hierarchy
    else:
        hierarchy_result = detected_hierarchy

    if hierarchy_result is None:
        hierarchy_result = detected_hierarchy

    # Log trace decision lines for each chapter in plain words
    step_ctr = 1
    for chapter in hierarchy_result.chapters:
        num_topics = len(chapter.topics)
        decision_line = f"Chapter is long, split into {num_topics} topics" if num_topics > 1 else "Chapter is short, kept as one topic"
        try:
            await log_agent_step(
                db, run_id, None, "chunking_agent", step_ctr, "split_sections",
                {"chapter_number": chapter.chapter_number, "chapter_title": chapter.chapter_title, "topics_count": num_topics},
                decision_line
            )
            step_ctr += 1
        except Exception:
            pass

    # Existing data preservation:
    # Do not delete approved content. If chapter already generated with old split, keep as-is until parent re-runs.
    # New output from a re-run shows as a new version needing parent approval, old approved version stays live.
    cursor_app = await db.execute("SELECT id FROM topics WHERE textbook_id = ? AND status = 'approved'", (textbook_id,))
    approved_rows = await cursor_app.fetchall()
    has_approved = len(approved_rows) > 0

    cursor_v = await db.execute("SELECT MAX(version) as max_v FROM topics WHERE textbook_id = ?", (textbook_id,))
    v_row = await cursor_v.fetchone()
    current_max_v = (v_row["max_v"] or 1) if v_row else 1

    if has_approved:
        # Keep existing approved content untouched! Delete only unapproved drafts of this textbook.
        await db.execute("DELETE FROM topics WHERE textbook_id = ? AND status != 'approved'", (textbook_id,))
        topic_version = current_max_v + 1
        initial_status = 'needs_review'
    else:
        # Clean unapproved draft topics for this textbook
        await db.execute("DELETE FROM topics WHERE textbook_id = ?", (textbook_id,))
        topic_version = 1
        initial_status = 'chunked'

    # Persist topics hierarchically to topics table
    created_topics = []
    for chapter in hierarchy_result.chapters:
        for topic_item in chapter.topics:
            top_id = str(uuid.uuid4())
            await db.execute("""
                INSERT INTO topics (
                    id, textbook_id, chapter_number, chapter_title, chapter_name,
                    topic_number, name, description, subject_tag, start_page, end_page, status, version
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                top_id, textbook_id, chapter.chapter_number, chapter.chapter_title, chapter.chapter_title,
                topic_item.topic_number, topic_item.name, topic_item.summary, hierarchy_result.subject_tag,
                topic_item.start_page, topic_item.end_page, initial_status, topic_version
            ))

            # Associate source pages in this range with the topic
            await db.execute("""
                UPDATE source_pages SET topic_id = ?
                WHERE textbook_id = ? AND page_number BETWEEN ? AND ?
            """, (top_id, textbook_id, topic_item.start_page, topic_item.end_page))

            created_topics.append({
                "id": top_id,
                "textbook_id": textbook_id,
                "chapter_number": chapter.chapter_number,
                "chapter_title": chapter.chapter_title,
                "chapter_name": chapter.chapter_title,
                "topic_number": topic_item.topic_number,
                "name": topic_item.name,
                "description": topic_item.summary,
                "subject_tag": hierarchy_result.subject_tag,
                "start_page": topic_item.start_page,
                "end_page": topic_item.end_page,
                "status": initial_status,
                "version": topic_version
            })

    await db.commit()

    # Link Agent 1 step logs to the first created topic
    if created_topics:
        first_topic_id = created_topics[0]["id"]
        await db.execute("""
            UPDATE agent_steps SET topic_id = ?
            WHERE run_id = ? AND topic_id IS NULL
        """, (first_topic_id, run_id))
        await db.commit()

    return {
        "textbook_id": textbook_id,
        "title": textbook_title,
        "subject_tag": hierarchy_result.subject_tag,
        "chapters": [c.model_dump() for c in hierarchy_result.chapters],
        "topics": created_topics
    }
