from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
from app.deps import get_current_parent, get_supabase_admin, assert_owns_session
from app.models.schemas import IdleEventRequest
from app.services.insights_rules import generate_session_insight

router = APIRouter(tags=["sessions"])

@router.post("/sessions")
async def start_session(
    child_id: str,
    topic_id: str,
    parent: dict = Depends(get_current_parent)
):
    """
    Starts child study session.
    RULE 7 SAFETY GATE: Rejects session creation if topic is NOT 'approved'.
    """
    admin = get_supabase_admin()

    # 1. Verify child belongs to parent
    child_res = admin.table("children").select("id").eq("id", child_id).eq("parent_id", parent["id"]).single().execute()
    if not child_res.data:
        raise HTTPException(status_code=403, detail="Child profile not found or access denied.")

    # 2. Verify topic is approved
    topic_res = admin.table("topics").select("id, status, name").eq("id", topic_id).single().execute()
    if not topic_res.data:
        raise HTTPException(status_code=404, detail="Topic not found.")

    if topic_res.data["status"] != "approved":
        raise HTTPException(
            status_code=403,
            detail="Rule 7 Approval Gate: Lesson cannot be started until approved by the parent."
        )

    # 3. Create session
    sess_res = admin.table("sessions").insert({
        "child_id": child_id,
        "topic_id": topic_id,
        "status": "active",
        "last_position": {"step": 0, "hint_shown": False}
    }).execute()

    if not sess_res.data:
        raise HTTPException(status_code=500, detail="Failed to initialize session.")

    return sess_res.data[0]

@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    session: dict = Depends(assert_owns_session)
):
    admin = get_supabase_admin()
    topic_id = session["topic_id"]

    # Load approved questions for child player
    questions_res = admin.table("questions").select("id, question_data, correct_answer, difficulty, source_page").eq("topic_id", topic_id).eq("status", "approved").execute()

    # Load attempts made so far
    att_res = admin.table("attempts").select("*").eq("session_id", session_id).order("created_at").execute()

    return {
        "session": session,
        "questions": questions_res.data or [],
        "attempts": att_res.data or []
    }

@router.post("/api/sessions/{session_id}/idle")
async def log_idle_event(
    session_id: str,
    req: IdleEventRequest,
    session: dict = Depends(assert_owns_session)
):
    """
    Logs idle ladder event. If child remains idle past ~2.5min (150s),
    pauses session and records resolved=false.
    """
    admin = get_supabase_admin()

    event_res = admin.table("idle_events").insert({
        "session_id": session_id,
        "question_id": req.question_id,
        "duration": req.duration,
        "resolved": req.resolved
    }).execute()

    # If duration >= 150s, pause the session
    if req.duration >= 150:
        admin.table("sessions").update({"status": "paused"}).eq("id", session_id).execute()

    return {"success": True, "event_id": event_res.data[0]["id"] if event_res.data else None}

@router.post("/api/sessions/{session_id}/insight")
async def generate_insight(
    session_id: str,
    session: dict = Depends(assert_owns_session)
):
    """
    Generates non-diagnostic parent insight using deterministic rule engine.
    """
    admin = get_supabase_admin()

    att_res = admin.table("attempts").select("*").eq("session_id", session_id).execute()
    idle_res = admin.table("idle_events").select("*").eq("session_id", session_id).execute()
    game_res = admin.table("game_attempts").select("*").eq("session_id", session_id).execute()

    insight = generate_session_insight(
        attempts=att_res.data or [],
        idle_events=idle_res.data or [],
        game_attempts=game_res.data or []
    )

    ins_res = admin.table("insights").insert({
        "child_id": session["child_id"],
        "session_id": session_id,
        "headline": insight["headline"],
        "detail": insight["detail"]
    }).execute()

    return {"success": True, "insight": ins_res.data[0] if ins_res.data else insight}
