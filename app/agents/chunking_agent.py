import json
import uuid
from typing import Dict, Any, List, Optional
from app.config import settings
from app.db import get_db
from app.models.schemas import (
    CurriculumHierarchySubmission,
    ChapterChunk,
    SubTopicChunk
)
from app.agents.loop import run_agent_loop

CHUNKING_AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_textbook_overview",
            "description": "Returns total page count and preview (first 200 characters and leading lines) of each page to see macro structure and chapter boundaries.",
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
                    "query": {"type": "string", "description": "Search keyword or phrase, e.g. 'Chapter 1' or 'Introduction'"}
                },
                "required": ["query"]
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

async def run_textbook_chunking_agent(
    textbook_id: str,
    grade: int,
    subject_tag: str,
    db
) -> Dict[str, Any]:
    """
    Executes Agent 1 (Textbook Chunking Agent):
    Scans the extracted textbook pages and chunks into:
    - Level 1: Chapters (Chapter Number, Chapter Title, Start Page, End Page)
    - Level 2: Sub-Topics under each Chapter (Topic Number, Title, Summary, Start Page, End Page)
    Uses light task weight (openai/gpt-oss-20b).
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

    async def tool_executor(name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        if name == "get_textbook_overview":
            overview = []
            for p in pages_rows:
                lines = [line.strip() for line in p["text"].splitlines() if line.strip()]
                preview = p["text"][:200]
                overview.append({
                    "page_number": p["page_number"],
                    "leading_lines": lines[:3],
                    "preview": preview
                })
            return {"page_count": page_count, "pages": overview}

        elif name == "read_page_range":
            sp = max(1, args.get("start_page", 1))
            ep = max(sp, args.get("end_page", sp))
            ep = min(ep, sp + 4, page_count)  # capped at 5 pages
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
                    # extract 120-char snippet
                    idx = p["text"].lower().find(query)
                    start = max(0, idx - 40)
                    end = min(len(p["text"]), idx + len(query) + 80)
                    matches.append({
                        "page_number": p["page_number"],
                        "snippet": p["text"][start:end].replace("\n", " ")
                    })
                    if len(matches) >= 8:
                        break
            return {"results": matches}

        return {"error": f"Unknown tool: {name}"}

    system_prompt = (
        f"You are Agent 1 (Textbook Chunking Agent). You analyze textbook pages for Grade {grade} {subject_tag} "
        f"('{textbook_title}', {page_count} pages total).\n"
        f"Your goal is hierarchical curriculum organization:\n"
        f"1. Level 1: Divide the textbook into Chapters (chapter_number, chapter_title, start_page, end_page).\n"
        f"   - If this is a single-chapter PDF, create 1 Chapter matching the topic.\n"
        f"   - If this is a multi-chapter textbook, identify each chapter boundary.\n"
        f"2. Level 2: Subdivide each Chapter into 2 to 4 bite-sized, playable Sub-Topics (topic_number, name, summary, start_page, end_page).\n"
        f"   - Each sub-topic must have start_page <= end_page.\n"
        f"Always inspect pages with get_textbook_overview or read_page_range first, and conclude by calling submit_curriculum_hierarchy."
    )

    initial_user_msg = f"Please chunk '{textbook_title}' ({page_count} pages) for Grade {grade} {subject_tag} into chapters and sub-topics."
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": initial_user_msg}
    ]

    # Offline / Heuristic fallback if LLM is unavailable
    if not settings.GROQ_API_KEY and not settings.GEMINI_API_KEY:
        if page_count <= 4:
            mid = max(1, page_count // 2)
            hierarchy_result = CurriculumHierarchySubmission(
                subject_tag=subject_tag,
                chapters=[
                    ChapterChunk(
                        chapter_number=1,
                        chapter_title=textbook_title,
                        start_page=1,
                        end_page=page_count,
                        topics=[
                            SubTopicChunk(
                                topic_number=1,
                                name=f"Introduction to {subject_tag}",
                                summary=f"Foundational concepts and examples in {subject_tag}.",
                                start_page=1,
                                end_page=mid
                            ),
                            SubTopicChunk(
                                topic_number=2,
                                name=f"Core Applications & Exercises",
                                summary=f"Practice problems and key takeaways.",
                                start_page=mid + 1 if page_count > 1 else 1,
                                end_page=page_count
                            )
                        ]
                    )
                ]
            )
        else:
            mid_book = page_count // 2
            mid_c1 = max(1, mid_book // 2)
            mid_c2 = mid_book + max(1, (page_count - mid_book) // 2)
            hierarchy_result = CurriculumHierarchySubmission(
                subject_tag=subject_tag,
                chapters=[
                    ChapterChunk(
                        chapter_number=1,
                        chapter_title=f"{textbook_title}: Part I",
                        start_page=1,
                        end_page=mid_book,
                        topics=[
                            SubTopicChunk(
                                topic_number=1,
                                name="Core Fundamentals",
                                summary="Key definitions, visual patterns, and basic principles.",
                                start_page=1,
                                end_page=mid_c1
                            ),
                            SubTopicChunk(
                                topic_number=2,
                                name="Intermediate Concepts",
                                summary="Detailed explorations and practical step-by-step examples.",
                                start_page=mid_c1 + 1,
                                end_page=mid_book
                            )
                        ]
                    ),
                    ChapterChunk(
                        chapter_number=2,
                        chapter_title=f"{textbook_title}: Part II",
                        start_page=mid_book + 1,
                        end_page=page_count,
                        topics=[
                            SubTopicChunk(
                                topic_number=1,
                                name="Advanced Exploration",
                                summary="Deeper investigations and real-world connections.",
                                start_page=mid_book + 1,
                                end_page=mid_c2
                            ),
                            SubTopicChunk(
                                topic_number=2,
                                name="Mastery & Synthesis",
                                summary="Comprehensive review, word problems, and summary questions.",
                                start_page=mid_c2 + 1,
                                end_page=page_count
                            )
                        ]
                    )
                ]
            )
    else:
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

    # Persist topics hierarchically to topics table with status 'chunked'
    created_topics = []
    for chapter in hierarchy_result.chapters:
        for topic_item in chapter.topics:
            top_id = str(uuid.uuid4())
            await db.execute("""
                INSERT INTO topics (
                    id, textbook_id, chapter_number, chapter_title, chapter_name,
                    topic_number, name, description, subject_tag, start_page, end_page, status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'chunked')
            """, (
                top_id, textbook_id, chapter.chapter_number, chapter.chapter_title, chapter.chapter_title,
                topic_item.topic_number, topic_item.name, topic_item.summary, hierarchy_result.subject_tag,
                topic_item.start_page, topic_item.end_page
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
                "status": "chunked"
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
