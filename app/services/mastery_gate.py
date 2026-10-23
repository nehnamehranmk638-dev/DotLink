from typing import Dict, Any, List, Optional
from app.config import settings

def evaluate_mastery_submission(
    quiz_set: str,
    answers: List[Dict[str, Any]],
    questions_map: Dict[str, Dict[str, Any]],
    all_revision_bullets: List[Dict[str, Any]],
    first_attempt_only: bool = settings.QUIZ_SCORE_FIRST_ATTEMPT_ONLY,
    pass_threshold: int = settings.MASTERY_PASS_SCORE
) -> Dict[str, Any]:
    """
    Pure deterministic mastery gate evaluation:
    - Score out of 10 = number of questions answered correctly on the FIRST attempt.
    - Score >= 7 (Pass):
      - Returns corrections for missed items.
      - Awards +10 bonus stars.
      - Marks topic mastered and unlocks next topic.
    - Score < 7 (Fail):
      - For Set A: returns Full Revision Module + launches Retest Quiz Set B.
      - For Set B: surfaces corrections, keeps next topic locked.
    """
    score = 0
    missed_items = []

    for ans in answers:
        q_id = ans.get("question_id")
        q_info = questions_map.get(q_id, {})
        correct_answer = q_info.get("correct_answer", "")
        selected_answer = ans.get("selected_answer", "")
        is_first_try = ans.get("is_first_try_correct", False)

        is_correct = (selected_answer.strip().lower() == correct_answer.strip().lower())
        if first_attempt_only:
            if is_correct and is_first_try:
                score += 1
            else:
                missed_items.append({
                    "question_id": q_id,
                    "question_text": q_info.get("question_text", ""),
                    "selected_answer": selected_answer,
                    "correct_answer": correct_answer,
                    "explanation_text": q_info.get("explanation_text", ""),
                    "source_page": q_info.get("source_page", 1)
                })
        else:
            if is_correct:
                score += 1
            else:
                missed_items.append({
                    "question_id": q_id,
                    "question_text": q_info.get("question_text", ""),
                    "selected_answer": selected_answer,
                    "correct_answer": correct_answer,
                    "explanation_text": q_info.get("explanation_text", ""),
                    "source_page": q_info.get("source_page", 1)
                })

    passed = (score >= pass_threshold)

    if passed:
        return {
            "score_out_of_10": score,
            "passed": True,
            "quiz_set": quiz_set,
            "bonus_stars": settings.STARS_MASTERY_BONUS,
            "topic_mastered": True,
            "next_topic_unlocked": True,
            "corrections": missed_items,
            "full_revision_module": None,
            "launch_quiz_b": False
        }
    else:
        # Score < 7
        if quiz_set == "quiz_a":
            full_revision = {
                "all_bullets": all_revision_bullets,
                "missed_breakdown": missed_items
            }
            return {
                "score_out_of_10": score,
                "passed": False,
                "quiz_set": quiz_set,
                "bonus_stars": 0,
                "topic_mastered": False,
                "next_topic_unlocked": False,
                "corrections": missed_items,
                "full_revision_module": full_revision,
                "launch_quiz_b": True
            }
        else:
            # Retest Quiz Set B failed
            return {
                "score_out_of_10": score,
                "passed": False,
                "quiz_set": quiz_set,
                "bonus_stars": 0,
                "topic_mastered": False,
                "next_topic_unlocked": False,
                "corrections": missed_items,
                "full_revision_module": None,
                "launch_quiz_b": False
            }
