import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from app.deps import get_current_parent, assert_owns_child, get_supabase_admin

router = APIRouter(prefix="/api/live", tags=["live"])

def fetch_child_live_status(child_id: str) -> dict:
    admin = get_supabase_admin()

    # Find active or paused session
    sess_res = admin.table("sessions").select("*, topics(name)").eq("child_id", child_id).in_("status", ["active", "paused"]).order("started_at", desc=True).limit(1).execute()
    active_session = sess_res.data[0] if sess_res.data else None

    # Check for recent unresolved idle event
    idle_banner = None
    if active_session:
        idle_res = admin.table("idle_events").select("*").eq("session_id", active_session["id"]).eq("resolved", False).order("created_at", desc=True).limit(1).execute()
        if idle_res.data:
            idle_banner = {
                "duration": idle_res.data[0]["duration"],
                "created_at": idle_res.data[0]["created_at"]
            }

    return {
        "has_active_session": active_session is not None,
        "session": active_session,
        "idle_banner": idle_banner,
        "child_id": child_id
    }

@router.get("/{child_id}/status")
async def get_live_status(
    child_id: str,
    child: dict = Depends(assert_owns_child)
):
    """Polling endpoint for parent live status (3-second polling)."""
    return fetch_child_live_status(child_id)

@router.get("/{child_id}")
async def stream_live_status(
    child_id: str,
    request: Request,
    child: dict = Depends(assert_owns_child)
):
    """Server-Sent Events (SSE) stream for realtime parent live observer."""
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break

            status_data = fetch_child_live_status(child_id)
            yield f"data: {json.dumps(status_data)}\n\n"
            await asyncio.sleep(3.0)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
