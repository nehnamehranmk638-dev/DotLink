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
    if 2 <= len(words) <= 9 and all(w[0].isupper() or w.lower() in {'a', 'an', 'the', 'of', 'and', 'in', 'with', 'to', 'for'} for w in words) and not clean.endswith('?'):
        if re.search(r'^(page \d+|\d+|table of contents|contents|index|syllabus)$', clean, re.IGNORECASE):
            return False
        return True
    return False

def _partition_blocks(blocks):
    """Choose book-order boundaries globally, without a too-small tail."""
    n = len(blocks)
    best = {n: (0, [])}
    for start in range(n - 1, -1, -1):
        words = 0
        for end in range(start + 1, n + 1):
            words += blocks[end - 1]["words"]
            if words > settings.TOPIC_MAX_WORDS:
                break
            if words >= settings.TOPIC_MIN_WORDS and end in best:
                score = (words - settings.TOPIC_TARGET_WORDS) ** 2 + best[end][0]
                if start not in best or score < best[start][0]:
                    best[start] = (score, [blocks[start:end]] + best[end][1])
    if 0 not in best:
        raise ValueError("Heading/example boundaries cannot meet topic size limits; flag_for_parent: review source structure")
    return best[0][1]


def split_sections(pages, chapter_title="", chapter_number=1):
    """Partition whole chapters and atomic book headings; retain exact page fragments."""
    if not pages:
        return []
    title = clean_child_friendly_title(chapter_title) if chapter_title else "Chapter Overview"
    total = sum(count_words(p["text"]) for p in pages)
    small = len(pages) <= settings.SMALL_CHAPTER_MAX_PAGES or total <= settings.SMALL_CHAPTER_MAX_WORDS
    blocks = []
    heading = title
    paragraphs = []
    example = False

    def flush_block():
        nonlocal paragraphs
        if paragraphs:
            blocks.append({"heading": heading, "paragraphs": paragraphs,
                           "words": sum(count_words(p["text"]) for p in paragraphs)})
            paragraphs = []

    if not small:
        for page in pages:
            lines = []
            def flush_paragraph():
                nonlocal lines
                if lines:
                    text = "\n".join(lines)
                    fragment = {"page_number": page["page_number"], "text": text}
                    # Worked examples remain atomic across paragraphs and page turns.
                    if example and paragraphs and paragraphs[-1].get("example"):
                        paragraphs[-1]["fragments"].append(fragment)
                        paragraphs[-1]["text"] += "\n\n" + text
                        paragraphs[-1]["words"] = count_words(paragraphs[-1]["text"])
                    else:
                        paragraphs.append({**fragment, "fragments": [fragment], "example": example,
                                           "words": count_words(text)})
                    lines = []
            for raw in page["text"].splitlines():
                line = raw.strip()
                if not line:
                    flush_paragraph()
                elif is_example_or_worked_problem(line):
                    flush_paragraph()
                    example = False
                    # A new example starts a new atomic item.
                    paragraphs.append({"page_number": page["page_number"], "text": line,
                                       "fragments": [{"page_number": page["page_number"], "text": line}],
                                       "example": True, "words": count_words(line)})
                    example = True
                elif is_heading_line(line):
                    flush_paragraph()
                    flush_block()
                    heading = clean_child_friendly_title(line)
                    example = False
                    lines.append(line)
                else:
                    lines.append(line)
            flush_paragraph()
        flush_block()
        normalized = []
        for block in blocks:
            if block["words"] <= settings.TOPIC_MAX_WORDS:
                normalized.append(block)
                continue
            parts = _partition_blocks(block["paragraphs"])
            for i, part in enumerate(parts):
                normalized.append({"heading": f"{block['heading']}, part {i + 1}/{len(parts)}",
                                   "paragraphs": part, "words": sum(p["words"] for p in part)})
        groups = _partition_blocks(normalized) if normalized else []
    else:
        groups = [[{"heading": title, "paragraphs": [
            {"fragments": [dict(p)], "text": p["text"], "words": count_words(p["text"])} for p in pages
        ]}]]

    trace = "Chapter is short, kept as one topic" if small else f"Chapter is long, split into {len(groups)} topics"
    topics = []
    for i, group in enumerate(groups):
        fragments = [f for b in group for p in b["paragraphs"] for f in p["fragments"]]
        page_text = {}
        for f in fragments:
            page_text.setdefault(f["page_number"], []).append(f["text"])
        source = [{"page_number": num, "text": "\n\n".join(texts)} for num, texts in page_text.items()]
        text = "\n\n".join(p["text"] for p in source)
        topic_heading = max(group, key=lambda block: sum(p["words"] for p in block["paragraphs"]))["heading"]
        topics.append({"topic_number": i + 1, "chapter_number": chapter_number,
                       "chapter_title": title, "name": topic_heading,
                       "start_page": source[0]["page_number"], "end_page": source[-1]["page_number"],
                       "text": text, "word_count": count_words(text), "source_pages": source,
                       "summary": f"Explore {topic_heading} with examples and practice.", "decision_trace": trace})
    return topics
