import os
from typing import Dict, Any, List

MAX_BREAK_OFFERS_PER_SESSION = 2
BREAK_DECLINE_COOLDOWN = 3
BREAK_IDLE_EVENTS = 2

def evaluate_break_offer(
    fatigue: bool,
    idle_events_count: int,
    break_offers_count: int,
    questions_since_decline: int = 99,
    games_enabled: bool = True,
    shadow_mode: bool = False
) -> Dict[str, Any]:
    """
    Pure Python deterministic brain break evaluation.
    """
    if shadow_mode or os.getenv("BREAK_SHADOW_MODE", "false").lower() == "true":
        return {"should_offer": False, "reason": "shadow_mode"}

    if not games_enabled:
        return {"should_offer": False, "reason": "games_disabled"}

    if break_offers_count >= MAX_BREAK_OFFERS_PER_SESSION:
        return {"should_offer": False, "reason": "max_offers_reached"}

    if questions_since_decline < BREAK_DECLINE_COOLDOWN:
        return {"should_offer": False, "reason": "cooldown_active"}

    if fatigue or idle_events_count >= BREAK_IDLE_EVENTS:
        return {"should_offer": True, "reason": "fatigue_or_idle_threshold"}

    return {"should_offer": False, "reason": "no_trigger"}
