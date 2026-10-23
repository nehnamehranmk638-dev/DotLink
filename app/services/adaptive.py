from typing import List, Dict, Any, Optional
from app.config import settings
from app.models.schemas import AdaptiveDecisionResult

def compute_ratios(
    current_time: float,
    prior_attempts: List[Dict[str, Any]]
) -> tuple[float, float]:
    """
    Computes (timeRatio, accuracyRatio) from prior resolved attempts in this session.
    Idle time is already excluded from time_taken.
    """
    if not prior_attempts:
        return 1.0, 1.0

    # Pacing baseline: average time taken on prior attempts
    valid_times = [a["time_taken"] for a in prior_attempts if a.get("time_taken", 0) > 0]
    avg_time = sum(valid_times) / len(valid_times) if valid_times else current_time
    time_ratio = current_time / avg_time if avg_time > 0 else 1.0

    # Rolling accuracy: last 2-3 attempts
    recent = prior_attempts[-3:] if len(prior_attempts) >= 3 else prior_attempts
    correct_count = sum(1 for a in recent if a.get("is_correct", False))
    accuracy_ratio = correct_count / len(recent) if recent else 1.0

    return time_ratio, accuracy_ratio

def decide(
    is_correct: bool,
    attempt_number: int,
    time_taken: float,
    prior_attempts: List[Dict[str, Any]],
    concept_failures: int = 0
) -> AdaptiveDecisionResult:
    """
    Pure Python, 100% deterministic adaptive decision engine.
    ZERO AI in the child's live loop.
    """
    # 1. 3rd failure on the same concept -> Stop topic, flag parent
    if not is_correct and (attempt_number >= 3 or concept_failures >= 2):
        return AdaptiveDecisionResult(
            is_correct=False,
            next_action="stop_topic",
            mascot_state="calm",
            stars_earned=0,
            silent_accuracy=0.0,
            adaptation_type="reteach"
        )

    # 2. Correct answer branches
    if is_correct:
        if attempt_number == 1:
            return AdaptiveDecisionResult(
                is_correct=True,
                next_action="next_question",
                mascot_state="happy",
                stars_earned=3,
                silent_accuracy=1.0,
                adaptation_type="none"
            )
        elif attempt_number == 2:
            return AdaptiveDecisionResult(
                is_correct=True,
                next_action="next_question",
                mascot_state="happy",
                stars_earned=2,
                silent_accuracy=0.5,
                adaptation_type="none"
            )
        else:
            return AdaptiveDecisionResult(
                is_correct=True,
                next_action="next_question",
                mascot_state="encouraging",
                stars_earned=1,
                silent_accuracy=0.0,
                adaptation_type="none"
            )

    # 3. Wrong on 1st try -> Gentle retry, same question
    if attempt_number == 1:
        return AdaptiveDecisionResult(
            is_correct=False,
            next_action="retry_same",
            mascot_state="encouraging",
            stars_earned=0,
            silent_accuracy=0.0,
            adaptation_type="none"
        )

    # 4. Wrong on 2nd try -> Determine sensory branch
    time_ratio, accuracy_ratio = compute_ratios(time_taken, prior_attempts)

    # Fatigue / hesitation: timeRatio > 1.5 AND accuracyRatio < 0.7
    if time_ratio > settings.TIME_RATIO_SLOW and accuracy_ratio < settings.ACCURACY_LOW:
        return AdaptiveDecisionResult(
            is_correct=False,
            next_action="break_offer",
            mascot_state="calm",
            stars_earned=0,
            silent_accuracy=0.0,
            adaptation_type="brain_break"
        )

    # Rushing: timeRatio < 0.6 AND answer under 1.5s
    if time_ratio < settings.TIME_RATIO_FAST and time_taken < settings.FAST_ANSWER_SECONDS:
        return AdaptiveDecisionResult(
            is_correct=False,
            next_action="rushing_visual",
            mascot_state="thinking",
            stars_earned=0,
            silent_accuracy=0.0,
            adaptation_type="rushing_visual"
        )

    # Otherwise confusion: re-teach simpler example
    return AdaptiveDecisionResult(
        is_correct=False,
        next_action="reteach",
        mascot_state="calm",
        stars_earned=0,
        silent_accuracy=0.0,
        adaptation_type="reteach"
    )
