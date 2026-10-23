import pytest
from app.services.adaptive_engine import (
    calculate_expected_time,
    validate_response_time,
    evaluate_low_engagement,
    evaluate_answer_ladder
)
from app.config import settings

# -------------------------------------------------------------------
# 1. Response Time Validation & Button Lock Checks
# -------------------------------------------------------------------
def test_validate_response_time_valid():
    assert validate_response_time(2.5) == 2.5
    assert validate_response_time(10.0) == 10.0
    assert validate_response_time(0.0) == 0.0

def test_validate_response_time_negative_fails():
    with pytest.raises(ValueError) as exc:
        validate_response_time(-1.5)
    assert "cannot be negative" in str(exc.value)

def test_validate_response_time_absurdly_large_fails():
    with pytest.raises(ValueError) as exc:
        validate_response_time(301.0)
    assert "exceeds sanity limit" in str(exc.value)

def test_calculate_expected_time():
    q_text = "What is the capital of France?"  # 6 words
    opts = ["Paris", "London", "Berlin", "Rome"]  # 4 words
    # total words = 10 -> expected = 4.0 + 0.35 * 10 = 7.5s
    exp = calculate_expected_time(q_text, opts)
    assert exp == 7.5

# -------------------------------------------------------------------
# 2. Answer Ladder Tests (All Branches)
# -------------------------------------------------------------------
def test_answer_ladder_correct_first_try():
    res = evaluate_answer_ladder(
        selected_answer="Paris",
        correct_answer="Paris",
        attempt_number=1,
        hint_text="Look at the Eiffel Tower",
        explanation_text="Paris is the capital of France"
    )
    assert res["is_correct"] is True
    assert res["stars_awarded"] == settings.STARS_CORRECT_FIRST_TRY  # 3 stars
    assert res["hint_shown"] is False
    assert res["explanation_shown"] is False
    assert res["can_retry"] is False
    assert res["continue_lesson"] is True
    assert res["silent_accuracy"] is True

def test_answer_ladder_first_wrong():
    res = evaluate_answer_ladder(
        selected_answer="London",
        correct_answer="Paris",
        attempt_number=1,
        hint_text="Look at the Eiffel Tower",
        explanation_text="Paris is the capital of France"
    )
    assert res["is_correct"] is False
    assert res["stars_awarded"] == 0
    assert res["hint_shown"] is True
    assert res["hint_text"] == "Look at the Eiffel Tower"
    assert res["explanation_shown"] is False
    assert res["explanation_text"] is None
    assert res["can_retry"] is True
    assert res["continue_lesson"] is False
    assert res["silent_accuracy"] is False

def test_answer_ladder_second_wrong():
    res = evaluate_answer_ladder(
        selected_answer="Berlin",
        correct_answer="Paris",
        attempt_number=2,
        hint_text="Look at the Eiffel Tower",
        explanation_text="Paris is the capital of France"
    )
    assert res["is_correct"] is False
    assert res["stars_awarded"] == settings.STARS_PARTICIPATION_SECOND_WRONG  # 1 star
    assert res["hint_shown"] is True
    assert res["explanation_shown"] is True
    assert res["explanation_text"] == "Paris is the capital of France"
    assert res["can_retry"] is False
    assert res["continue_lesson"] is True
    assert res["silent_accuracy"] is False

def test_answer_ladder_correct_on_retry():
    res = evaluate_answer_ladder(
        selected_answer="Paris",
        correct_answer="Paris",
        attempt_number=2,
        hint_text="Look at the Eiffel Tower",
        explanation_text="Paris is the capital of France"
    )
    assert res["is_correct"] is True
    assert res["stars_awarded"] == 0  # Only first try gets 3 stars
    assert res["can_retry"] is False
    assert res["continue_lesson"] is True
    assert res["silent_accuracy"] is False

# -------------------------------------------------------------------
# 3. Low Engagement & Rapid Guessing Trigger Tests
# -------------------------------------------------------------------
def test_low_engagement_time_ratio_greater_than_1_5():
    # expected_time = 10s, time_taken = 16s -> ratio = 1.6 > 1.5
    trigger, reason = evaluate_low_engagement(
        time_taken=16.0,
        expected_time=10.0,
        attempt_number=1,
        is_correct=True,
        recent_rapid_guesses=0,
        last_mini_game_timestamp=None,
        current_timestamp=1000.0
    )
    assert trigger is True
    assert "ratio" in reason

def test_normal_engagement_no_trigger():
    # expected_time = 10s, time_taken = 8s -> ratio = 0.8 <= 1.5
    trigger, reason = evaluate_low_engagement(
        time_taken=8.0,
        expected_time=10.0,
        attempt_number=1,
        is_correct=True,
        recent_rapid_guesses=0,
        last_mini_game_timestamp=None,
        current_timestamp=1000.0
    )
    assert trigger is False

def test_two_consecutive_rapid_wrong_guesses_triggers_game():
    # Consecutive rapid guess (recent_rapid_guesses >= 1, wrong, time <= 1.5s)
    trigger, reason = evaluate_low_engagement(
        time_taken=1.1,
        expected_time=10.0,
        attempt_number=1,
        is_correct=False,
        recent_rapid_guesses=1,
        last_mini_game_timestamp=None,
        current_timestamp=1000.0
    )
    assert trigger is True
    assert "rapid wrong guesses" in reason

def test_mini_game_cooldown_enforced():
    # Last game triggered at t = 1000. Current t = 1100 (< 300s cooldown)
    trigger, reason = evaluate_low_engagement(
        time_taken=20.0,  # ratio 2.0 > 1.5
        expected_time=10.0,
        attempt_number=1,
        is_correct=False,
        recent_rapid_guesses=0,
        last_mini_game_timestamp=1000.0,
        current_timestamp=1100.0
    )
    assert trigger is False
    assert "Cooldown active" in reason

    # After cooldown expires (current t = 1350 > 1000 + 300)
    trigger, reason = evaluate_low_engagement(
        time_taken=20.0,
        expected_time=10.0,
        attempt_number=1,
        is_correct=False,
        recent_rapid_guesses=0,
        last_mini_game_timestamp=1000.0,
        current_timestamp=1350.0
    )
    assert trigger is True
