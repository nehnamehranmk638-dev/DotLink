import re
import time
from typing import Dict, Any, List, Optional, Tuple
from app.config import settings

def calculate_expected_time(question_text: str, options: List[str]) -> float:
    """
    Computes expected read/think time in seconds:
    expected_time = EXPECTED_TIME_BASE + EXPECTED_TIME_PER_WORD * word_count
    """
    full_text = question_text + " " + " ".join(options)
    words = [w for w in re.findall(r'\b\w+\b', full_text) if w]
    word_count = len(words)
    return round(settings.EXPECTED_TIME_BASE + settings.EXPECTED_TIME_PER_WORD * word_count, 2)

def validate_response_time(time_taken: float) -> float:
    """
    Rejects impossible values (negative or absurdly large).
    Raises ValueError on invalid times.
    """
    if time_taken is None:
        raise ValueError("time_taken is required")
    if time_taken < 0:
        raise ValueError(f"Impossible time_taken: {time_taken}s (cannot be negative)")
    if time_taken > settings.MAX_VALID_TIME_TAKEN:
        raise ValueError(f"Impossible time_taken: {time_taken}s (exceeds sanity limit {settings.MAX_VALID_TIME_TAKEN}s)")
    return round(float(time_taken), 2)

def evaluate_low_engagement(
    time_taken: float,
    expected_time: float,
    attempt_number: int,
    is_correct: bool,
    recent_rapid_guesses: int,
    last_mini_game_timestamp: Optional[float],
    current_timestamp: Optional[float] = None
) -> Tuple[bool, str]:
    """
    Evaluates whether to trigger the 60-second Topic Mini-Game:
    1. time_ratio = time_taken / expected_time > 1.5 (drags significantly)
    2. OR two consecutive wrong answers within 1.5s post-lock (rapid guessing)
    Cooldown: at most once every 5 minutes (300 seconds).
    """
    now = current_timestamp if current_timestamp is not None else time.time()

    # Cooldown check
    if last_mini_game_timestamp is not None:
        if (now - last_mini_game_timestamp) < settings.MINI_GAME_COOLDOWN_SECONDS:
            return False, "Cooldown active"

    # 1. Dragging engagement check
    time_ratio = time_taken / max(0.1, expected_time)
    if time_ratio > settings.TIME_RATIO_LOW_ENGAGEMENT:
        return True, f"Response time dragged (ratio: {round(time_ratio, 2)} > {settings.TIME_RATIO_LOW_ENGAGEMENT})"

    # 2. Rapid guessing check
    is_rapid = (not is_correct) and (time_taken <= settings.RAPID_GUESS_THRESHOLD_SECONDS)
    if is_rapid and recent_rapid_guesses >= 1:
        return True, "Two consecutive rapid wrong guesses detected"

    return False, "Engagement normal"

def evaluate_answer_ladder(
    selected_answer: str,
    correct_answer: str,
    attempt_number: int,
    hint_text: str,
    explanation_text: str,
    is_in_video: bool = True
) -> Dict[str, Any]:
    """
    Deterministic hint/explanation answer ladder:
    - 1st try correct: +3 stars, unlock linked revision bullet (for in-video), continue.
    - 1st wrong: return hint_text, hint_shown=True, allow retry after 2s lock.
    - 2nd wrong: return explanation_text, explanation_shown=True, +1 participation star, continue.
    """
    is_correct = (selected_answer.strip().lower() == correct_answer.strip().lower())

    if is_correct:
        stars = settings.STARS_CORRECT_FIRST_TRY if attempt_number == 1 else 0
        return {
            "is_correct": True,
            "stars_awarded": stars,
            "hint_text": None,
            "explanation_text": None,
            "hint_shown": False,
            "explanation_shown": False,
            "can_retry": False,
            "continue_lesson": True,
            "silent_accuracy": (attempt_number == 1)
        }
    else:
        if attempt_number == 1:
            return {
                "is_correct": False,
                "stars_awarded": 0,
                "hint_text": hint_text,
                "explanation_text": None,
                "hint_shown": True,
                "explanation_shown": False,
                "can_retry": True,
                "continue_lesson": False,
                "silent_accuracy": False
            }
        else:
            return {
                "is_correct": False,
                "stars_awarded": settings.STARS_PARTICIPATION_SECOND_WRONG,
                "hint_text": hint_text,
                "explanation_text": explanation_text,
                "hint_shown": True,
                "explanation_shown": True,
                "can_retry": False,
                "continue_lesson": True,
                "silent_accuracy": False
            }
