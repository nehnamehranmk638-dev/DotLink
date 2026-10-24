import re
import math
from typing import Dict, Any, List, Optional
from rapidfuzz import fuzz
from app.config import settings

def count_syllables(word: str) -> int:
    word = word.lower().strip(".,!?:;\"'")
    if not word:
        return 1
    # Count vowel groups
    count = len(re.findall(r'[aeiouy]+', word))
    if word.endswith('e') and not word.endswith('le') and len(word) > 2:
        count -= 1
    return max(1, count)

def check_reading_level(text: str, target_grade: int) -> Dict[str, Any]:
    """
    Deterministic Flesch-Kincaid readability calculation.
    Ensures sentence length and vocabulary match the child's grade level.
    """
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    if not sentences:
        return {"grade_level": target_grade, "suitable": True, "details": "Empty text"}

    words = [w for w in re.findall(r'\b\w+\b', text) if w]
    num_words = len(words)
    num_sentences = len(sentences)
    if num_words == 0:
        return {"grade_level": target_grade, "suitable": True, "details": "No words"}

    total_syllables = sum(count_syllables(w) for w in words)
    
    # Flesch-Kincaid Grade Level formula
    asl = num_words / max(1, num_sentences)
    asw = total_syllables / max(1, num_words)
    fk_grade = round(0.39 * asl + 11.8 * asw - 15.59, 1)
    fk_grade = max(1.0, min(12.0, fk_grade))

    diff = abs(fk_grade - target_grade)
    suitable = diff <= 2.5
    return {
        "calculated_grade": fk_grade,
        "target_grade": target_grade,
        "suitable": suitable,
        "avg_sentence_length": round(asl, 1),
        "avg_syllables_per_word": round(asw, 2),
        "feedback": "Matches grade level" if suitable else f"Complexity is grade {fk_grade}, target is {target_grade}"
    }

def calculator(a: float, op: str, b: float) -> Dict[str, Any]:
    """Verifies math and numerical arithmetic strictly."""
    op = op.strip()
    try:
        if op in ("+", "add"):
            res = a + b
        elif op in ("-", "sub", "subtract"):
            res = a - b
        elif op in ("*", "x", "mul", "multiply"):
            res = a * b
        elif op in ("/", "div", "divide"):
            if b == 0:
                return {"error": "Division by zero", "success": False}
            res = a / b
        elif op in ("^", "**", "pow", "power"):
            res = a ** b
        elif op in ("%", "mod", "modulo"):
            res = a % b
        else:
            return {"error": f"Unsupported operator '{op}'", "success": False}
        return {"result": round(res, 4), "success": True}
    except Exception as e:
        return {"error": str(e), "success": False}

def check_grounding(question_text: str, page_text: str) -> Dict[str, Any]:
    """
    Rapidfuzz token_set_ratio match of question against NCERT source page text.
    """
    if not question_text or not page_text:
        return {"grounded": False, "score": 0.0, "threshold": settings.GROUNDING_FUZZY_THRESHOLD}

    score = fuzz.token_set_ratio(question_text, page_text)
    is_grounded = score >= settings.GROUNDING_FUZZY_THRESHOLD
    return {
        "grounded": is_grounded,
        "score": round(score, 1),
        "threshold": settings.GROUNDING_FUZZY_THRESHOLD
    }

def count_words(text: str) -> int:
    """Counts words using word boundary regex."""
    if not text:
        return 0
    return len(re.findall(r'\b\w+\b', text))

def clean_child_friendly_title(raw_title: str) -> str:
    """Produces a clean child-friendly title taken from the book's heading."""
    if not raw_title:
        return "Topic Overview"
    title = raw_title.strip()
    # Remove leading chapter/topic markers like 'Chapter 1: ', 'Topic 1.1 - ', 'Unit 3: '
    title = re.sub(r'^(?:Chapter|Unit|Lesson|Topic|Section)\s*[\d\.\-:]+\s*', '', title, flags=re.IGNORECASE).strip()
    title = re.sub(r'^\d+\.\d+\s*[-:]?\s*', '', title).strip()
    title = re.sub(r'^[#*_\-\s]+', '', title).strip()
    title = re.sub(r'[:\s#*_\-]+$', '', title).strip()
    return title if title else "Topic Overview"

def is_example_or_worked_problem(line: str) -> bool:
    """Detects start of an example or worked problem that must never be split."""
    return bool(re.search(r'^(?:Worked Example|Example|Problem|Try This|Activity|Let us Solve)\b', line.strip(), re.IGNORECASE))

def is_heading_line(line: str) -> bool:
    """Detects whether a line represents a heading or sub-heading."""
    clean = line.strip()
    if not clean or len(clean) > 75 or clean.endswith('.'):
        return False
    # Explicit heading patterns
    if re.search(r'^(?:Chapter|Unit|Lesson|Topic|Section)\s*\d+', clean, re.IGNORECASE):
        return True
    if re.search(r'^\d+\.\d+\s+[A-Za-z]', clean):
        return True
    if re.search(r'^[A-Z][A-Za-z0-9\s,\-\'"]{2,55}:$', clean):
        return True
    if clean.startswith('#'):
        return True
    # Clean standalone title-case lines
    words = clean.split()
    if 2 <= len(words) <= 9 and words[0][0].isupper() and not clean.endswith('?'):
        if re.search(r'^(page \d+|\d+|table of contents|contents|index|syllabus)$', clean, re.IGNORECASE):
            return False
        return True
    return False

def split_sections(
    pages: List[Dict[str, Any]],
    chapter_title: str = "",
    chapter_number: int = 1
) -> List[Dict[str, Any]]:
    """
    Implements the DotLink Chunking Policy:
    1. Measure the chapter: page count and word count of the chapter text.
    2. SMALL chapter: if it has at most SMALL_CHAPTER_MAX_PAGES (default 6) pages
       or at most SMALL_CHAPTER_MAX_WORDS (default 2500) words, make the WHOLE chapter
       ONE topic. Do not split it at all.
       Trace: "Chapter is short, kept as one topic"
    3. LARGE chapter: split into topics along the chapter's own headings and sub-headings,
       then merge neighbours so each topic has about TOPIC_TARGET_WORDS (default 1200) words,
       at least TOPIC_MIN_WORDS (default 800), at most TOPIC_MAX_WORDS (default 1800).
       Rules:
       - Never split in the middle of a heading's block, an example or a worked problem.
       - Merge a too-short heading block into the previous or next topic.
       - If one heading block is above TOPIC_MAX_WORDS, split it at paragraph boundaries into sub-topics
         and name them "Topic name, part 1/2".
       - Keep topics in book order and give each a clear child-friendly title taken from the book's own heading.
       - No topic is below TOPIC_MIN_WORDS except a single-topic chapter.
       Trace: "Chapter is long, split into {N} topics"
    4. Each topic stores its page range and the text it was built from.
    """
    if not pages:
        return []

    # 1. Measure chapter
    page_count = len(pages)
    combined_pages = []
    total_words = 0
    for p in pages:
        p_num = p.get("page_number", 1) if isinstance(p, dict) else p["page_number"]
        txt = p.get("text", "") if isinstance(p, dict) else p["text"]
        w_cnt = count_words(txt)
        total_words += w_cnt
        combined_pages.append({"page_number": p_num, "text": txt, "words": w_cnt})

    start_p = combined_pages[0]["page_number"]
    end_p = combined_pages[-1]["page_number"]
    full_text = "\n\n".join(cp["text"] for cp in combined_pages if cp["text"].strip())
    clean_chap_title = clean_child_friendly_title(chapter_title) if chapter_title else "Chapter Overview"

    # 2. SMALL chapter check
    is_small = (page_count <= settings.SMALL_CHAPTER_MAX_PAGES) or (total_words <= settings.SMALL_CHAPTER_MAX_WORDS)
    if is_small:
        decision_trace = "Chapter is short, kept as one topic"
        return [{
            "topic_number": 1,
            "chapter_number": chapter_number,
            "chapter_title": clean_chap_title,
            "name": clean_chap_title,
            "start_page": start_p,
            "end_page": end_p,
            "word_count": total_words,
            "text": full_text,
            "summary": f"Complete exploration and interactive exercises for {clean_chap_title}.",
            "decision_trace": decision_trace
        }]

    # 3. LARGE chapter chunking
    # Parse pages into atomic paragraphs and group into Heading Blocks
    # Each paragraph keeps its page number, text, and whether it's an example/worked problem
    heading_blocks = []
    current_heading = clean_chap_title
    current_paragraphs = []
    current_start_page = start_p

    for cp in combined_pages:
        p_num = cp["page_number"]
        page_text = cp["text"]
        # Split page into raw paragraphs (by double newline or heading lines)
        lines = page_text.splitlines()
        para_lines = []
        in_example = False

        for line in lines:
            stripped = line.strip()
            if not stripped:
                if para_lines:
                    p_text = "\n".join(para_lines).strip()
                    if p_text:
                        current_paragraphs.append({
                            "page_number": p_num,
                            "text": p_text,
                            "words": count_words(p_text),
                            "is_example": in_example
                        })
                    para_lines = []
                    in_example = False
                continue

            if is_example_or_worked_problem(stripped):
                # An example starts: keep previous paragraph separate
                if para_lines and not in_example:
                    p_text = "\n".join(para_lines).strip()
                    if p_text:
                        current_paragraphs.append({
                            "page_number": p_num,
                            "text": p_text,
                            "words": count_words(p_text),
                            "is_example": False
                        })
                    para_lines = []
                in_example = True
                para_lines.append(stripped)
                continue

            if is_heading_line(stripped) and not in_example:
                # Heading line found: finalize current paragraph and current heading block
                if para_lines:
                    p_text = "\n".join(para_lines).strip()
                    if p_text:
                        current_paragraphs.append({
                            "page_number": p_num,
                            "text": p_text,
                            "words": count_words(p_text),
                            "is_example": in_example
                        })
                    para_lines = []
                    in_example = False

                if current_paragraphs:
                    heading_blocks.append({
                        "heading": current_heading,
                        "start_page": current_paragraphs[0]["page_number"],
                        "end_page": current_paragraphs[-1]["page_number"],
                        "paragraphs": current_paragraphs,
                        "words": sum(p["words"] for p in current_paragraphs)
                    })
                    current_paragraphs = []

                current_heading = clean_child_friendly_title(stripped)
                current_start_page = p_num
            else:
                para_lines.append(stripped)

        if para_lines:
            p_text = "\n".join(para_lines).strip()
            if p_text:
                current_paragraphs.append({
                    "page_number": p_num,
                    "text": p_text,
                    "words": count_words(p_text),
                    "is_example": in_example
                })

    if current_paragraphs:
        heading_blocks.append({
            "heading": current_heading,
            "start_page": current_paragraphs[0]["page_number"],
            "end_page": current_paragraphs[-1]["page_number"],
            "paragraphs": current_paragraphs,
            "words": sum(p["words"] for p in current_paragraphs)
        })

    if not heading_blocks:
        # Fallback if no distinct paragraphs
        decision_trace = "Chapter is short, kept as one topic"
        return [{
            "topic_number": 1,
            "chapter_number": chapter_number,
            "chapter_title": clean_chap_title,
            "name": clean_chap_title,
            "start_page": start_p,
            "end_page": end_p,
            "word_count": total_words,
            "text": full_text,
            "summary": f"Complete guide to {clean_chap_title}.",
            "decision_trace": decision_trace
        }]

    # 4. Check for oversized heading blocks (> TOPIC_MAX_WORDS)
    # "If one heading block is above TOPIC_MAX_WORDS, split it at paragraph boundaries into sub-topics and name them 'Topic name, part 1/2'."
    # "Never split in the middle of a heading's block, an example or a worked problem."
    normalized_blocks = []
    for b in heading_blocks:
        if b["words"] <= settings.TOPIC_MAX_WORDS:
            normalized_blocks.append(b)
        else:
            # Must split into sub-topics at paragraph boundaries
            # Calculate target part count
            target_part_count = max(2, round(b["words"] / settings.TOPIC_TARGET_WORDS))
            ideal_words_per_part = b["words"] / target_part_count

            parts = []
            curr_part_paras = []
            curr_part_words = 0

            for para in b["paragraphs"]:
                # If adding para exceeds max words and we already have paras, finalize part
                if curr_part_paras and (curr_part_words + para["words"] > settings.TOPIC_MAX_WORDS or (curr_part_words >= settings.TOPIC_MIN_WORDS and curr_part_words >= ideal_words_per_part)):
                    parts.append(curr_part_paras)
                    curr_part_paras = [para]
                    curr_part_words = para["words"]
                else:
                    curr_part_paras.append(para)
                    curr_part_words += para["words"]

            if curr_part_paras:
                # If last part is too small (< TOPIC_MIN_WORDS) and we have previous parts, merge into previous
                if parts and curr_part_words < settings.TOPIC_MIN_WORDS:
                    parts[-1].extend(curr_part_paras)
                else:
                    parts.append(curr_part_paras)

            total_parts = len(parts)
            for idx, part_paras in enumerate(parts):
                part_title = f"{b['heading']}, part {idx+1}/{total_parts}" if total_parts > 1 else b["heading"]
                normalized_blocks.append({
                    "heading": part_title,
                    "start_page": part_paras[0]["page_number"],
                    "end_page": part_paras[-1]["page_number"],
                    "paragraphs": part_paras,
                    "words": sum(p["words"] for p in part_paras)
                })

    # 5. Merge neighbouring blocks so each topic has ~TOPIC_TARGET_WORDS (1200),
    # at least TOPIC_MIN_WORDS (800), at most TOPIC_MAX_WORDS (1800).
    # "Merge a too-short heading block into the previous or next topic."
    # "no topic is below TOPIC_MIN_WORDS except a single-topic chapter"
    merged_groups = []
    current_group = []
    current_words = 0

    for b in normalized_blocks:
        if not current_group:
            current_group = [b]
            current_words = b["words"]
        else:
            # If current group is below minimum, we MUST merge the next block
            if current_words < settings.TOPIC_MIN_WORDS:
                current_group.append(b)
                current_words += b["words"]
            # If current group + next block is within MAX_WORDS and brings closer to TARGET_WORDS
            elif current_words + b["words"] <= settings.TOPIC_MAX_WORDS and current_words < settings.TOPIC_TARGET_WORDS:
                current_group.append(b)
                current_words += b["words"]
            else:
                # Finalize current group as a topic and start new group
                merged_groups.append(current_group)
                current_group = [b]
                current_words = b["words"]

    if current_group:
        # Check if the final group is below TOPIC_MIN_WORDS
        if current_words < settings.TOPIC_MIN_WORDS and merged_groups:
            # Merge into the previous group so no topic is below TOPIC_MIN_WORDS
            merged_groups[-1].extend(current_group)
        else:
            merged_groups.append(current_group)

    # 6. Build final topics
    topic_count = len(merged_groups)
    decision_trace = f"Chapter is long, split into {topic_count} topics" if topic_count > 1 else "Chapter is short, kept as one topic"

    final_topics = []
    for t_idx, group in enumerate(merged_groups):
        t_num = t_idx + 1
        t_title = group[0]["heading"]
        t_start = group[0]["start_page"]
        t_end = group[-1]["end_page"]
        all_t_paras = []
        for blk in group:
            all_t_paras.extend(blk["paragraphs"])
        
        t_text = "\n\n".join(p["text"] for p in all_t_paras)
        t_words = sum(p["words"] for p in all_t_paras)
        summary = f"Comprehensive guide to {t_title} with foundational concepts and exercises."

        final_topics.append({
            "topic_number": t_num,
            "chapter_number": chapter_number,
            "chapter_title": clean_chap_title,
            "name": t_title,
            "start_page": t_start,
            "end_page": t_end,
            "word_count": t_words,
            "text": t_text,
            "summary": summary,
            "decision_trace": decision_trace
        })

    return final_topics
