import pytest
from app.services.adaptive import decide, compute_ratios

def test_correct_first_attempt():
    res = decide(is_correct=True, attempt_number=1, time_taken=4.0, prior_attempts=[])
    assert res.is_correct is True
    assert res.next_action == "next_question"
    assert res.stars_earned == 3
    assert res.silent_accuracy == 1.0
    assert res.adaptation_type == "none"

def test_correct_second_attempt():
    res = decide(is_correct=True, attempt_number=2, time_taken=5.0, prior_attempts=[])
    assert res.is_correct is True
    assert res.next_action == "next_question"
    assert res.stars_earned == 2
    assert res.silent_accuracy == 0.5
    assert res.adaptation_type == "none"

def test_wrong_first_attempt():
    res = decide(is_correct=False, attempt_number=1, time_taken=3.0, prior_attempts=[])
    assert res.is_correct is False
    assert res.next_action == "retry_same"
    assert res.stars_earned == 0
    assert res.silent_accuracy == 0.0

def test_wrong_second_attempt_rushing():
    # Answering in < 1.5s with timeRatio < 0.6 indicates rushing
    prior = [
        {"time_taken": 6.0, "is_correct": True},
        {"time_taken": 5.0, "is_correct": False}
    ]
    res = decide(is_correct=False, attempt_number=2, time_taken=1.1, prior_attempts=prior)
    assert res.is_correct is False
    assert res.next_action == "rushing_visual"
    assert res.adaptation_type == "rushing_visual"

def test_wrong_second_attempt_fatigue_break_offer():
    # Answering much slower (timeRatio > 1.5) with low accuracy (< 0.7) triggers break offer
    prior = [
        {"time_taken": 4.0, "is_correct": False},
        {"time_taken": 4.0, "is_correct": False}
    ]
    res = decide(is_correct=False, attempt_number=2, time_taken=12.0, prior_attempts=prior)
    assert res.is_correct is False
    assert res.next_action == "break_offer"
    assert res.adaptation_type == "brain_break"

def test_wrong_second_attempt_confusion_reteach():
    # Normal pace, wrong on second try -> confusion reteach
    prior = [
        {"time_taken": 5.0, "is_correct": True},
        {"time_taken": 5.0, "is_correct": True}
    ]
    res = decide(is_correct=False, attempt_number=2, time_taken=5.0, prior_attempts=prior)
    assert res.is_correct is False
    assert res.next_action == "reteach"
    assert res.adaptation_type == "reteach"

def test_third_failure_stops_topic():
    res = decide(is_correct=False, attempt_number=3, time_taken=6.0, prior_attempts=[])
    assert res.is_correct is False
    assert res.next_action == "stop_topic"
