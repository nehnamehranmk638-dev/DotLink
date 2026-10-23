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
