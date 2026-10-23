import pytest
from app.services.mastery_gate import evaluate_mastery_submission
from app.config import settings

def make_mock_questions_map(count=10):
    q_map = {}
    for i in range(1, count + 1):
        q_id = f"q_{i}"
        q_map[q_id] = {
            "question_text": f"Question {i}: What is concept {i}?",
            "correct_answer": f"Answer {i}",
            "explanation_text": f"Explanation for concept {i}",
            "source_page": i
        }
    return q_map

MOCK_BULLETS = [
    {"bullet_num": 1, "text": "Core takeaway 1"},
    {"bullet_num": 2, "text": "Core takeaway 2"}
]

# -------------------------------------------------------------------
# 1. Score 6 / 10 on Quiz Set A (Fail Path)
# -------------------------------------------------------------------
def test_mastery_gate_score_6_set_a_fails():
    q_map = make_mock_questions_map(10)
    answers = []
    # 6 correct on first try
    for i in range(1, 7):
        answers.append({
            "question_id": f"q_{i}",
            "selected_answer": f"Answer {i}",
            "is_first_try_correct": True
        })
    # 4 wrong
    for i in range(7, 11):
        answers.append({
            "question_id": f"q_{i}",
            "selected_answer": "Wrong Answer",
            "is_first_try_correct": False
        })

    result = evaluate_mastery_submission(
        quiz_set="quiz_a",
        answers=answers,
        questions_map=q_map,
        all_revision_bullets=MOCK_BULLETS
    )

    assert result["score_out_of_10"] == 6
    assert result["passed"] is False
    assert result["bonus_stars"] == 0
    assert result["topic_mastered"] is False
    assert result["next_topic_unlocked"] is False
    assert result["launch_quiz_b"] is True
    assert result["full_revision_module"] is not None
    assert len(result["full_revision_module"]["missed_breakdown"]) == 4
    assert len(result["full_revision_module"]["all_bullets"]) == 2

# -------------------------------------------------------------------
# 2. Score 7 / 10 on Quiz Set A (Pass Path)
# -------------------------------------------------------------------
def test_mastery_gate_score_7_set_a_passes():
    q_map = make_mock_questions_map(10)
    answers = []
    # 7 correct on first try
    for i in range(1, 8):
        answers.append({
            "question_id": f"q_{i}",
            "selected_answer": f"Answer {i}",
            "is_first_try_correct": True
        })
    # 3 wrong
    for i in range(8, 11):
        answers.append({
            "question_id": f"q_{i}",
            "selected_answer": "Wrong Answer",
            "is_first_try_correct": False
        })

    result = evaluate_mastery_submission(
        quiz_set="quiz_a",
        answers=answers,
        questions_map=q_map,
        all_revision_bullets=MOCK_BULLETS
    )

    assert result["score_out_of_10"] == 7
    assert result["passed"] is True
    assert result["bonus_stars"] == settings.STARS_MASTERY_BONUS  # 10 stars
    assert result["topic_mastered"] is True
    assert result["next_topic_unlocked"] is True
    assert result["launch_quiz_b"] is False
    assert result["full_revision_module"] is None
    assert len(result["corrections"]) == 3

# -------------------------------------------------------------------
# 3. Retest Quiz Set B Pass (Score >= 7)
# -------------------------------------------------------------------
def test_mastery_gate_set_b_pass():
    q_map = make_mock_questions_map(10)
    answers = []
    # 8 correct
    for i in range(1, 9):
        answers.append({
            "question_id": f"q_{i}",
            "selected_answer": f"Answer {i}",
            "is_first_try_correct": True
        })
    for i in range(9, 11):
        answers.append({
            "question_id": f"q_{i}",
            "selected_answer": "Wrong Answer",
            "is_first_try_correct": False
        })

    result = evaluate_mastery_submission(
        quiz_set="quiz_b",
        answers=answers,
        questions_map=q_map,
        all_revision_bullets=MOCK_BULLETS
    )

    assert result["score_out_of_10"] == 8
    assert result["passed"] is True
    assert result["bonus_stars"] == settings.STARS_MASTERY_BONUS
    assert result["topic_mastered"] is True
    assert result["next_topic_unlocked"] is True
    assert result["launch_quiz_b"] is False

# -------------------------------------------------------------------
# 4. Retest Quiz Set B Fail (Score < 7)
# -------------------------------------------------------------------
def test_mastery_gate_set_b_fail():
    q_map = make_mock_questions_map(10)
    answers = []
    # Only 5 correct
    for i in range(1, 6):
        answers.append({
            "question_id": f"q_{i}",
            "selected_answer": f"Answer {i}",
            "is_first_try_correct": True
        })
    for i in range(6, 11):
        answers.append({
            "question_id": f"q_{i}",
            "selected_answer": "Wrong Answer",
            "is_first_try_correct": False
        })

    result = evaluate_mastery_submission(
        quiz_set="quiz_b",
        answers=answers,
        questions_map=q_map,
        all_revision_bullets=MOCK_BULLETS
    )

    assert result["score_out_of_10"] == 5
    assert result["passed"] is False
    assert result["bonus_stars"] == 0
    assert result["topic_mastered"] is False
    assert result["next_topic_unlocked"] is False
    assert result["launch_quiz_b"] is False  # No more quiz sets
    assert len(result["corrections"]) == 5
