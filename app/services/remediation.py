"""Presentation configuration only; answer ladder and rewards stay in their engine."""
import re


def build_remediation(question, question_data):
    text = question_data.get("question_text", "")
    match = re.search(r"\b(\d+)\s*([+-])\s*(\d+)\b", text)
    problem = {"a": int(match[1]), "b": int(match[3]), "op": match[2]} if match else {"a": 0, "b": 0, "op": "+"}
    arithmetic = bool(match) and max(problem["a"], problem["b"]) <= 20 and (problem["op"] == "+" or problem["a"] >= problem["b"])
    if arithmetic:
        labels = (["Count the first group", "Count the second group", "Count them all together"]
                  if problem["op"] == "+" else ["Start with all", "Take some away", "Count what is left"])
    else:
        labels = ["Read the question", "Find the clue in our lesson", "Choose the answer that fits"]
    return {
        "gameType": "order_steps", "theme": "dinosaurs",
        "companion": {"key": "luna", "name": "Luna"}, "problem": problem,
        "concept": None if arithmetic else question["explanation_text"],
        "objectKey": "dino_egg",
        "steps": [{"id": f"step-{i}", "label": label, "iconKey": "dino_egg", "animation": "pop"} for i, label in enumerate(labels)],
        "voiceLines": {"intro": "Let's discover the secret steps together!", "hint": "Almost. Let's try this one.",
                       "assist": "I'll help with this step. You've got this.", "success": "Nice! Now let's use those steps."},
    }
