from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.services.llm import llm_service
from app.deps import get_supabase_admin

COACH_AGENT_SYSTEM = """You are DotLink's Parent Coach Agent.
Your mission is to provide non-diagnostic, encouraging, and clear updates to parents about their child's study sessions.
STRICT NON-DIAGNOSTIC POLICY:
- NEVER state that the child has ADHD or diagnose any condition.
- NEVER use diagnostic phrases like "your child has a learning disability", "clinically proven", or "ADHD symptoms".
- Focus on retrieval practice, deliberation time without timers, and self-regulated tactile breaks.
"""

class CoachOutput(BaseModel):
    reply: str
    headline: Optional[str] = "Weekly Progress Update"
    suggested_step: Optional[str] = "Review next chapter or continue calm practice."

async def ask_parent_coach(
    child_id: str,
    user_query: str
) -> CoachOutput:
    """
    Answers parent questions about child progress, strictly grounded in database metrics.
    """
    admin = get_supabase_admin()

    # Fetch child context
    child_res = admin.table("children").select("*").eq("id", child_id).single().execute()
    child_data = child_res.data or {"name": "Your child", "grade": 3}

    # Fetch recent attempts and progress
    sessions_res = admin.table("sessions").select("id").eq("child_id", child_id).execute()
    session_ids = [s["id"] for s in (sessions_res.data or [])]

    total_attempts = 0
    correct_count = 0
    if session_ids:
        att_res = admin.table("attempts").select("is_correct, silent_accuracy, time_taken, adaptation_type").in_("session_id", session_ids).execute()
        attempts = att_res.data or []
        total_attempts = len(attempts)
        correct_count = sum(1 for a in attempts if a.get("is_correct"))

    progress_res = admin.table("topic_progress").select("status, silent_accuracy_avg, stars_total, topics(name)").eq("child_id", child_id).execute()
    progress_data = progress_res.data or []

    prompt = (
        f"Parent Query: {user_query}\n\n"
        f"Learner: {child_data['name']} (Grade {child_data['grade']})\n"
        f"Session metrics: {total_attempts} questions attempted, {correct_count} correct.\n"
        f"Topic progress records: {progress_data}\n\n"
        f"Provide a warm, supportive, non-diagnostic response. Include a brief headline and practical next step."
    )

    try:
        result = await llm_service.json_call(
            prompt=f"{COACH_AGENT_SYSTEM}\n\n{prompt}",
            response_model=CoachOutput,
            tier="main"
        )
        return result
    except Exception as e:
        return CoachOutput(
            reply=f"{child_data['name']} has been making steady progress with {total_attempts} questions completed. Practice sessions remain calm and self-paced.",
            headline="Steady Study Momentum",
            suggested_step="Keep sessions short and encouraging."
        )
