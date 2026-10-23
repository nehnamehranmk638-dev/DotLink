from typing import List, Dict, Any

def generate_session_insight(
    attempts: List[Dict[str, Any]],
    idle_events: List[Dict[str, Any]] = None,
    game_attempts: List[Dict[str, Any]] = None
) -> Dict[str, str]:
    """
    100% deterministic rule-based generator for parent observations.
    Zero LLM in this loop. Pure non-diagnostic language.
    """
    if idle_events is None: idle_events = []
    if game_attempts is None: game_attempts = []

    if not attempts:
        return {
            "headline": "Introductory Exploration",
            "detail": "Your learner explored the chapter and familiarized themselves with new concepts."
        }

    total = len(attempts)
    rushing = [
        a for a in attempts
        if a.get("adaptation_type") == "rushing_visual" or (a.get("time_taken", 0) < 1.5 and a.get("attempt_number") == 1)
    ]
    break_accepted = any(g.get("accepted") and g.get("choice") in ["game", "rest"] for g in game_attempts)
    break_offered = any(a.get("adaptation_type") == "brain_break" for a in attempts)
    reteach = any(a.get("adaptation_type") == "reteach" or a.get("attempt_number", 1) >= 3 for a in attempts)

    accuracies = [float(a.get("silent_accuracy", 0.0)) for a in attempts]
    avg_acc = sum(accuracies) / total if total > 0 else 0.0

    # Rule 1: Pacing & Rushing
    if len(rushing) >= 2 or any(a.get("adaptation_type") == "rushing_visual" for a in attempts):
        return {
            "headline": "Pacing Awareness Prompted",
            "detail": "Your learner answered several questions rapidly. Tactile pacing visuals helped encourage thoughtful deliberation before confirming answers."
        }

    # Rule 2: Sensory Break Self-Regulation
    if break_accepted or break_offered:
        return {
            "headline": "Healthy Rest Break Utilized",
            "detail": "Your learner accepted a gentle pause when fatigue cues were detected, returning with calm focus to finish the chapter."
        }

    # Rule 3: Conceptual Scaffolding
    if reteach:
        return {
            "headline": "Multi-Modal Support Utilized",
            "detail": "When encountering a challenging concept, Pip provided visual counting scaffolds and a step-by-step breakdown to reinforce understanding."
        }

    # Rule 4: High Retrieval Mastery
    if avg_acc >= 0.75 and total >= 4:
        return {
            "headline": "Strong Conceptual Mastery",
            "detail": f"Your child demonstrated strong first-attempt retrieval accuracy ({round(avg_acc * 100)}%) across core textbook objectives."
        }

    # Rule 5: Deliberation & Focus
    if len(idle_events) >= 2:
        return {
            "headline": "Deliberate and Reflective Thinking",
            "detail": "Your child took time to think through problems carefully without feeling rushed by timers."
        }

    # Rule 6: Steady Learning
    return {
        "headline": "Consistent Learning Momentum",
        "detail": "Your learner completed textbook practice with steady focus and positive engagement."
    }
