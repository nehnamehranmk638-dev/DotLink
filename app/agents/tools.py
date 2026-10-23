import re
from typing import Dict, Any, List

def tool_calculator(a: float, op: str, b: float) -> Dict[str, Any]:
    """Calculates arithmetic operations safely."""
    try:
        if op == "+": val = a + b
        elif op == "-": val = a - b
        elif op == "*": val = a * b
        elif op == "/": val = a / b if b != 0 else "Error: division by zero"
        else: val = f"Unsupported op {op}"
        return {"result": val}
    except Exception as e:
        return {"error": str(e)}

def tool_check_grounding(question_text: str, page_text: str) -> Dict[str, Any]:
    """
    Checks if key terms from the question appear in the cited page text.
    Computes token overlap ratio.
    """
    stop_words = {"what", "which", "how", "many", "is", "are", "the", "a", "an", "of", "in", "to", "for", "with", "from", "during", "does", "do"}
    q_words = set(re.findall(r"\b[a-zA-Z]{3,}\b", question_text.lower())) - stop_words
    if not q_words:
        return {"is_grounded": True, "overlap_ratio": 1.0}

    page_words = set(re.findall(r"\b[a-zA-Z]{3,}\b", page_text.lower()))
    common = q_words.intersection(page_words)
    ratio = len(common) / len(q_words)
    return {
        "is_grounded": ratio >= 0.25,
        "overlap_ratio": round(ratio, 2),
        "matching_terms": list(common)
    }

def tool_check_reading_level(text: str, grade: int) -> Dict[str, Any]:
    """
    Checks word length and sentence structure for elementary grade learners.
    """
    words = re.findall(r"\b\w+\b", text)
    sentences = re.split(r"[.!?]+", text)
    valid_sentences = [s for s in sentences if s.strip()]

    avg_sentence_len = len(words) / len(valid_sentences) if valid_sentences else len(words)
    long_words = [w for w in words if len(w) > 8]

    # For Grade 1-4, sentences should be under 15 words
    target_sentence_len = 10 if grade <= 2 else 16
    fits_grade = avg_sentence_len <= target_sentence_len and len(long_words) <= 3

    return {
        "fits_grade": fits_grade,
        "avg_sentence_length": round(avg_sentence_len, 1),
        "long_words_count": len(long_words),
        "recommended_max_length": target_sentence_len
    }
