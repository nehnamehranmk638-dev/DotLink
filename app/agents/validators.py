import re
from typing import Dict, Any, List, Optional, Tuple, Union
from rapidfuzz import fuzz
from app.config import settings
from app.agents.tools import calculator, count_words
from app.models.schemas import QuizQuestion, InVideoQuestion

def get_question_field(question: Union[Dict[str, Any], QuizQuestion, InVideoQuestion], field_name: str, default: Any = None) -> Any:
    """Helper to extract field from either a Pydantic model or dict."""
    if isinstance(question, dict):
        # Look in top level or in nested question_data
        if field_name in question:
            return question[field_name]
        q_data = question.get("question_data", {})
        if isinstance(q_data, dict) and field_name in q_data:
            return q_data[field_name]
        return default
    elif hasattr(question, field_name):
        return getattr(question, field_name)
    return default

def validate_single_correct_option(question: Union[Dict[str, Any], QuizQuestion, InVideoQuestion]) -> Tuple[bool, Optional[str]]:
    """
    Validates that:
    1. Exactly one correct option exists in options list.
    2. The correct answer text appears in options exactly once.
    3. The answer index unambiguously points to it.
    """
    correct_answer = get_question_field(question, "correct_answer")
    options = get_question_field(question, "options", [])

    if not options or not isinstance(options, list):
        return False, "Options must be a non-empty list"

    if correct_answer is None or str(correct_answer).strip() == "":
        return False, "Question must have a non-empty correct_answer"

    target = str(correct_answer).strip().lower()
    matches = [i for i, opt in enumerate(options) if str(opt).strip().lower() == target]

    if len(matches) == 0:
        return False, f"Correct answer '{correct_answer}' does not appear in options: {options}"
    if len(matches) > 1:
        return False, f"Multiple options ({len(matches)}) match correct answer '{correct_answer}'"

    return True, None

def validate_option_count(
    question: Union[Dict[str, Any], QuizQuestion, InVideoQuestion],
    min_count: int = settings.CHOICE_COUNT_MIN,
    max_count: int = settings.CHOICE_COUNT_MAX
) -> Tuple[bool, Optional[str]]:
    """
    Validates that:
    1. Option count is within allowed range (CHOICE_COUNT_MIN to CHOICE_COUNT_MAX, default 3-4).
    2. No duplicate options exist in options list.
    """
    options = get_question_field(question, "options", [])
    if not isinstance(options, list):
        return False, "Options must be a list"

    opt_len = len(options)
    if opt_len < min_count or opt_len > max_count:
        return False, f"Option count {opt_len} outside allowed range ({min_count}-{max_count})"

    normalized = [str(o).strip().lower() for o in options]
    if len(set(normalized)) != opt_len:
        return False, f"Options contain duplicates: {options}"

    return True, None

def calculate_expected_question_count(
    word_count: int,
    min_q: int = settings.MIN_QUESTIONS_PER_TOPIC,
    max_q: int = settings.MAX_QUESTIONS_PER_TOPIC
) -> int:
    """Calculates question count scaled with topic size (~1 question per 200 words, bounded by min and max)."""
    return min(max_q, max(min_q, round(word_count / settings.WORDS_PER_QUESTION)))

def validate_question_count_for_topic(
    questions: List[Any],
    word_count: int,
    min_q: int = settings.MIN_QUESTIONS_PER_TOPIC,
    max_q: int = settings.MAX_QUESTIONS_PER_TOPIC
) -> Tuple[bool, Optional[str]]:
    """
    Validates that question count is within allowed bounds for topic size.
    """
    if not isinstance(questions, list):
        return False, "Questions must be a list"

    q_len = len(questions)
    if q_len < min_q or q_len > max_q:
        return False, f"Question count {q_len} outside allowed bounds ({min_q}-{max_q}) for topic of {word_count} words"

    return True, None

def validate_grounding_evidence(
    question: Union[Dict[str, Any], QuizQuestion, InVideoQuestion],
    pages_map: Dict[int, str],
    start_page: int,
    end_page: int,
    threshold: float = settings.GROUNDING_FUZZY_THRESHOLD
) -> Tuple[bool, Optional[str]]:
    """
    Validates that:
    1. source_page lies inside the topic's page range (start_page <= source_page <= end_page).
    2. Evidence quote (or question text) fuzzy-matches the topic's source page text.
    """
    source_page = get_question_field(question, "source_page")
    if source_page is None or not isinstance(source_page, int):
        return False, "source_page must be an integer"

    if source_page < start_page or source_page > end_page:
        return False, f"source_page {source_page} lies outside topic page range ({start_page}-{end_page})"

    page_text = pages_map.get(source_page, "")
    if not page_text or not page_text.strip():
        return False, f"No source page text found for page {source_page}"

    evidence_quote = get_question_field(question, "evidence_quote")
    q_text = get_question_field(question, "question_text", "")
    target_match_text = evidence_quote if evidence_quote else q_text

    if not target_match_text:
        return False, "Question must have an evidence quote or question text for grounding"

    score = fuzz.token_set_ratio(target_match_text, page_text)
    if score < threshold:
        return False, f"Evidence quote fuzzy match ({score:.1f}) is below threshold ({threshold}) on page {source_page}"

    return True, None

def recompute_arithmetic_in_options(
    question: Union[Dict[str, Any], QuizQuestion, InVideoQuestion]
) -> Tuple[bool, Optional[str]]:
    """
    Recomputes simple arithmetic in question or options as built:
    Checks if question contains basic math operations like 'a + b', 'a - b', 'a * b', 'a / b'
    and verifies that the designated correct_answer matches the calculated value.
    """
    q_text = str(get_question_field(question, "question_text", ""))
    correct_ans = str(get_question_field(question, "correct_answer", "")).strip()

    # Look for math patterns like 'What is 12 + 15?', 'Calculate 10 * 5', '4 + 5 = ?', '20 / 4'
    math_match = re.search(r'\b(\d+(?:\.\d+)?)\s*([\+\-\*xX/])\s*(\d+(?:\.\d+)?)\b', q_text)
    if math_match:
        a = float(math_match.group(1))
        op = math_match.group(2)
        b = float(math_match.group(3))
        res_calc = calculator(a, op, b)
        if res_calc.get("success"):
            expected = res_calc["result"]
            # Convert float to int if integer
            expected_str = str(int(expected)) if expected == int(expected) else str(expected)
            # If the correct answer contains a number, check that it matches expected
            num_in_ans = re.findall(r'-?\d+(?:\.\d+)?', correct_ans)
            if num_in_ans:
                ans_val = float(num_in_ans[0])
                if abs(ans_val - expected) > 1e-4:
                    return False, f"Arithmetic mismatch in options: calculated {a} {op} {b} = {expected_str}, but correct answer is '{correct_ans}'"

    return True, None

def validate_topic_chunk_policy(
    topics: List[Dict[str, Any]],
    chapter_pages_count: int,
    chapter_word_count: int
) -> Tuple[bool, Optional[str]]:
    """
    Validates that:
    1. Small chapter produces exactly one topic.
    2. In a multi-topic chapter, no topic is below TOPIC_MIN_WORDS.
    """
    if not topics:
        return False, "Topics list is empty"

    is_small = (chapter_pages_count <= settings.SMALL_CHAPTER_MAX_PAGES) or (chapter_word_count <= settings.SMALL_CHAPTER_MAX_WORDS)
    if is_small:
        if len(topics) != 1:
            return False, f"Small chapter ({chapter_pages_count} pages, {chapter_word_count} words) must produce exactly 1 topic, got {len(topics)}"
        return True, None

    # Multi-topic chapter
    for idx, t in enumerate(topics):
        w_cnt = t.get("word_count", 0)
        t_name = t.get("name", f"Topic {idx+1}")
        if w_cnt < settings.TOPIC_MIN_WORDS:
            return False, f"Topic {idx+1} ('{t_name}') has {w_cnt} words, which is below TOPIC_MIN_WORDS ({settings.TOPIC_MIN_WORDS})"

    return True, None

def validate_question_with_retry_and_flag(
    question: Union[Dict[str, Any], QuizQuestion, InVideoQuestion],
    pages_map: Dict[int, str],
    start_page: int,
    end_page: int,
    retry_count: int = 0
) -> Dict[str, Any]:
    """
    Full validation pipeline for a question:
    - Exactly one correct option
    - Option count within allowed range, no duplicate options
    - Evidence quote fuzzy matches topic text and source_page is in topic page range
    - Recompute arithmetic in options
    - Retries up to QUESTION_RETRY_CAP (2), then flags for parent review
    """
    reasons = []

    # 1. Single correct option check
    ok_single, err_single = validate_single_correct_option(question)
    if not ok_single:
        reasons.append(err_single)

    # 2. Option count and duplicates check
    ok_opt, err_opt = validate_option_count(question)
    if not ok_opt:
        reasons.append(err_opt)

    # 3. Grounding & evidence quote check
    ok_ground, err_ground = validate_grounding_evidence(question, pages_map, start_page, end_page)
    if not ok_ground:
        reasons.append(err_ground)

    # 4. Arithmetic check
    ok_arith, err_arith = recompute_arithmetic_in_options(question)
    if not ok_arith:
        reasons.append(err_arith)

    is_valid = len(reasons) == 0
    if is_valid:
        return {
            "valid": True,
            "retry_needed": False,
            "flagged": False,
            "flag_reason": None
        }

    # If invalid, check if we should retry or flag for parent
    should_retry = retry_count < settings.QUESTION_RETRY_CAP
    return {
        "valid": False,
        "retry_needed": should_retry,
        "flagged": not should_retry,
        "flag_reason": "; ".join(reasons)
    }
