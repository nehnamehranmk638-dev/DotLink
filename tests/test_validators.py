import pytest
from app.agents.tools import tool_calculator, tool_check_grounding, tool_check_reading_level
from app.services.insights_rules import generate_session_insight

def test_calculator_arithmetic():
    assert tool_calculator(5, "+", 3)["result"] == 8
    assert tool_calculator(10, "*", 4)["result"] == 40
    assert tool_calculator(20, "/", 4)["result"] == 5
    assert "division by zero" in tool_calculator(5, "/", 0)["result"]

def test_grounding_overlap():
    page = "Photosynthesis is the process green plants use to synthesize nutrients from carbon dioxide and water."
    q1 = "What gas do plants absorb from the air during photosynthesis?"
    res1 = tool_check_grounding(q1, page)
    assert res1["is_grounded"] is True

    q2 = "How fast does an airplane travel across the ocean?"
    res2 = tool_check_grounding(q2, page)
    assert res2["is_grounded"] is False

def test_reading_level():
    simple_text = "Plants need water and sunlight to grow strong."
    res = tool_check_reading_level(simple_text, grade=3)
    assert res["fits_grade"] is True

def test_deterministic_insights():
    attempts = [
        {"silent_accuracy": 1.0, "time_taken": 4.0, "is_correct": True, "attempt_number": 1, "adaptation_type": "none"},
        {"silent_accuracy": 1.0, "time_taken": 5.0, "is_correct": True, "attempt_number": 1, "adaptation_type": "none"},
        {"silent_accuracy": 1.0, "time_taken": 4.5, "is_correct": True, "attempt_number": 1, "adaptation_type": "none"},
        {"silent_accuracy": 1.0, "time_taken": 5.2, "is_correct": True, "attempt_number": 1, "adaptation_type": "none"}
    ]
    ins = generate_session_insight(attempts)
    assert "Mastery" in ins["headline"]
