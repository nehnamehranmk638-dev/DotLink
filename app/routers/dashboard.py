import json
import asyncio
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from app.db import get_db
from app.deps import get_current_parent, decode_access_token, verify_child_ownership
from app.models.schemas import IdleEventRequest
from app.services.idle_monitor import sse_manager, record_idle_event, record_session_heartbeat
from app.services.analytics_engine import calculate_parent_analytics
from app.services.insights_rules import generate_feedback_card
from app.config import settings

router = APIRouter(tags=["dashboard"])

@router.get("/api/analytics/{child_id}")
async def get_child_analytics(child_id: str, parent: dict = Depends(get_current_parent)):
    """Computes Chart.js daily/weekly series and rule-based Feedback Card for the parent."""
    db = await get_db()
    try:
        await verify_child_ownership(child_id, parent["id"], db)
        analytics = await calculate_parent_analytics(child_id, db)
        feedback = await generate_feedback_card(child_id, db)
        return {
            "child_id": child_id,
            "analytics": analytics,
            "feedback": feedback
        }
    finally:
        await db.close()

@router.post("/api/sessions/{id}/idle")
async def post_idle_event(
    id: str,
    req: IdleEventRequest,
    parent: dict = Depends(get_current_parent)
):
    """
    Logs 'Are you still watching?' prompt outcome.
    If responded=False, auto-pauses session and pushes real-time SSE alert to parent.
    """
    db = await get_db()
    try:
        result = await record_idle_event(
            session_id=id,
            scene_or_question_id=req.scene_or_question_id,
            responded=req.responded,
            db=db
        )
        return result
    finally:
        await db.close()

@router.post("/api/sessions/{id}/heartbeat")
async def post_heartbeat(id: str, parent: dict = Depends(get_current_parent)):
    """Pings every 10s while active to increment active_focus_seconds."""
    db = await get_db()
    try:
        result = await record_session_heartbeat(session_id=id, db=db)
        return result
    finally:
        await db.close()

@router.get("/api/live/{child_id}")
async def live_parent_stream(
    child_id: str,
    token: Optional[str] = Query(None)
):
    """
    Server-Sent Events (SSE) stream for live parent status updates.
    Accepts JWT as ?token= query parameter because browser EventSource cannot send headers.
    Pushes: session_started, session_paused, idle_alert, session_completed + comment heartbeat.
    """
    if not token:
        raise HTTPException(status_code=401, detail="Token query parameter required for SSE")

    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    db = await get_db()
    try:
        await verify_child_ownership(child_id, user_id, db)
    finally:
        await db.close()

    async def event_generator():
        queue = sse_manager.subscribe(child_id)
        try:
            # Initial connection event
            yield f"event: connected\ndata: {json.dumps({'status': 'listening', 'child_id': child_id})}\n\n"

            while True:
                try:
                    # Wait for next event or heartbeat timeout
                    item = await asyncio.wait_for(queue.get(), timeout=settings.SSE_HEARTBEAT_INTERVAL_SECONDS)
                    event_type = item.get("event", "message")
                    data_str = json.dumps(item.get("data", {}))
                    yield f"event: {event_type}\ndata: {data_str}\n\n"
                except asyncio.TimeoutError:
                    # Periodic SSE comment heartbeat every 15s to keep connection alive
                    yield ": heartbeat\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            sse_manager.unsubscribe(child_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
