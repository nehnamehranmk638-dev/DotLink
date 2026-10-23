import pytest
from app.services.breaks import evaluate_break_offer

def test_shadow_mode_suppresses_offer():
    res = evaluate_break_offer(fatigue=True, idle_events_count=3, break_offers_count=0, shadow_mode=True)
    assert res["should_offer"] is False
    assert res["reason"] == "shadow_mode"

def test_games_disabled_suppresses_offer():
    res = evaluate_break_offer(fatigue=True, idle_events_count=3, break_offers_count=0, games_enabled=False)
    assert res["should_offer"] is False
    assert res["reason"] == "games_disabled"

def test_max_offers_reached():
    res = evaluate_break_offer(fatigue=True, idle_events_count=2, break_offers_count=2)
    assert res["should_offer"] is False
    assert res["reason"] == "max_offers_reached"

def test_cooldown_active():
    res = evaluate_break_offer(fatigue=True, idle_events_count=2, break_offers_count=1, questions_since_decline=1)
    assert res["should_offer"] is False
    assert res["reason"] == "cooldown_active"

def test_valid_break_trigger():
    res = evaluate_break_offer(fatigue=True, idle_events_count=0, break_offers_count=0, questions_since_decline=5)
    assert res["should_offer"] is True
    assert res["reason"] == "fatigue_or_idle_threshold"
