import json
import uuid
import asyncio
import datetime
from typing import Dict, Any, Set, Optional
from app.config import settings

class SSEManager:
    """
    In-process asyncio Pub/Sub manager keyed by child_id.
    Accepts SSE connections and broadcasts live learning updates to parents.
    (Note: Works on a single server instance).
    """
    def __init__(self):
        self._listeners: Dict[str, Set[asyncio.Queue]] = {}

    def subscribe(self, child_id: str) -> asyncio.Queue:
        if child_id not in self._listeners:
            self._listeners[child_id] = set()
        queue = asyncio.Queue()
        self._listeners[child_id].add(queue)
        return queue

    def unsubscribe(self, child_id: str, queue: asyncio.Queue):
        if child_id in self._listeners:
            self._listeners[child_id].discard(queue)
            if not self._listeners[child_id]:
                del self._listeners[child_id]

    async def publish_event(self, child_id: str, event_type: str, data: Dict[str, Any]):
        if child_id in self._listeners:
            payload = {
                "event": event_type,
                "data": data,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
            # Put in all listening queues without blocking
            for q in list(self._listeners[child_id]):
                try:
                    q.put_nowait(payload)
                except asyncio.QueueFull:
                    pass

sse_manager = SSEManager()

async def record_idle_event(
    session_id: str,
    scene_or_question_id: Optional[str],
    responded: bool,
    db
) -> Dict[str, Any]:
    """
    Logs idle prompt responses.
    If responded=False (timeout after 30s):
    - Sets session status to 'paused'
    - Saves idle_events row with auto_paused_at
    - Publishes instant 'idle_alert' to parent's SSE stream
    """
    cursor = await db.execute("""
        SELECT s.*, t.name as topic_name, c.name as child_name, c.id as child_id
        FROM sessions s
        JOIN topics t ON s.topic_id = t.id
        JOIN children c ON s.child_id = c.id
        WHERE s.id = ?
    """, (session_id,))
    session = await cursor.fetchone()
    if not session:
        raise ValueError(f"Session {session_id} not found")

    child_id = session["child_id"]
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    event_id = str(uuid.uuid4())

    if not responded:
        # Auto-pause session on inactivity timeout
        await db.execute("""
            UPDATE sessions SET status = 'paused' WHERE id = ?
        """, (session_id,))

        await db.execute("""
            INSERT INTO idle_events (id, session_id, scene_or_question_id, prompted_at, responded, auto_paused_at)
            VALUES (?, ?, ?, ?, 0, ?)
        """, (event_id, session_id, scene_or_question_id, now_iso, now_iso))
        await db.commit()

        # Publish live SSE alert to parent
        await sse_manager.publish_event(
            child_id=child_id,
            event_type="idle_alert",
            data={
                "session_id": session_id,
                "child_id": child_id,
                "child_name": session["child_name"],
                "topic_name": session["topic_name"],
                "last_scene_index": session["last_scene_index"],
                "message": f"Inactivity Alert: {session['child_name']} did not respond to 'Are you still watching?'. Session automatically paused."
            }
        )

        return {"status": "paused", "responded": False, "auto_paused": True}
    else:
        # Child confirmed active
        await db.execute("""
            INSERT INTO idle_events (id, session_id, scene_or_question_id, prompted_at, responded, auto_paused_at)
            VALUES (?, ?, ?, ?, 1, NULL)
        """, (event_id, session_id, scene_or_question_id, now_iso))
        await db.commit()

        return {"status": "active", "responded": True, "auto_paused": False}

async def record_session_heartbeat(session_id: str, db) -> Dict[str, Any]:
    """
    Increments active_focus_seconds by 10s while session is actively engaged.
    Never counted while paused or completed.
    """
    cursor = await db.execute("""
        SELECT status, active_focus_seconds FROM sessions WHERE id = ?
    """, (session_id,))
    sess = await cursor.fetchone()
    if not sess:
        return {"status": "not_found", "active_focus_seconds": 0}

    if sess["status"] == "active":
        new_seconds = sess["active_focus_seconds"] + settings.HEARTBEAT_INTERVAL_SECONDS
        await db.execute("""
            UPDATE sessions SET active_focus_seconds = ? WHERE id = ?
        """, (new_seconds, session_id))
        await db.commit()
        return {"status": "active", "active_focus_seconds": new_seconds}

    return {"status": sess["status"], "active_focus_seconds": sess["active_focus_seconds"]}
