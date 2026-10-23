import pytest
import uuid
import json
import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db import init_db
from app.services.idle_monitor import sse_manager

@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()

@pytest.mark.asyncio
async def test_idle_monitoring_and_parent_sse_alert():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Signup & create child
        email = f"parent_{uuid.uuid4().hex[:6]}@example.com"
        res = await client.post("/auth/signup", json={
            "name": "Devi Parent",
            "email": email,
            "password": "password123",
            "consent_given": True
        })
        token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        res = await client.post("/children", json={
            "name": "Kabir",
            "age": 9,
            "grade": 4,
            "mascot_name": "Astro the Penguin"
        }, headers=headers)
        child_id = res.json()["id"]

        # 2. Ingest NCERT chapter & approve topic
        res = await client.post("/ncert/fetch-and-chunk", data={"grade": 4, "subject": "Maths", "chapter_num": 1}, headers=headers)
        topic_id = res.json()["topics"][0]["id"]

        from app.routers.curriculum import background_generate_lesson_and_quizzes
        await background_generate_lesson_and_quizzes(topic_id, "chunked")

        await client.post(f"/topics/{topic_id}/approve", headers=headers)

        # 3. Start learning session
        res = await client.post("/sessions/start-or-resume", json={
            "child_id": child_id,
            "topic_id": topic_id
        }, headers=headers)
        session_id = res.json()["session_id"]

        # 4. Heartbeat test: pings while active increment active_focus_seconds
        res = await client.post(f"/api/sessions/{session_id}/heartbeat", headers=headers)
        assert res.status_code == 200
        assert res.json()["active_focus_seconds"] == 10

        # 5. Inactivity test (Child does NOT respond to "Are you still watching?" within 30s)
        # ACCEPTANCE CHECK: Leaving the child page idle produces a live alert on parent dashboard via SSE
        # Subscribe parent to SSE queue
        queue = sse_manager.subscribe(child_id)

        # POST /api/sessions/{id}/idle with responded=False
        res = await client.post(f"/api/sessions/{session_id}/idle", json={
            "scene_or_question_id": "scene_1",
            "responded": False
        }, headers=headers)
        assert res.status_code == 200
        idle_res = res.json()
        assert idle_res["status"] == "paused"
        assert idle_res["auto_paused"] is True

        # Verify live alert is broadcast to SSE stream
        sse_event = await asyncio.wait_for(queue.get(), timeout=2.0)
        assert sse_event["event"] == "idle_alert"
        assert "Inactivity Alert" in sse_event["data"]["message"]
        assert sse_event["data"]["child_id"] == child_id

        # Clean up queue
        sse_manager.unsubscribe(child_id, queue)

        # 6. Verify Analytics & Feedback Card endpoint
        res = await client.get(f"/api/analytics/{child_id}", headers=headers)
        assert res.status_code == 200
        dashboard_data = res.json()
        assert "analytics" in dashboard_data
        assert "feedback" in dashboard_data

        charts = dashboard_data["analytics"]["charts"]
        assert "accuracy" in charts
        assert "attention" in charts
        assert "time_focused" in charts
        assert "speed" in charts

        fb = dashboard_data["feedback"]
        assert "headline" in fb
        assert "completed_topics" in fb
        assert "needing_revision" in fb

        # 7. Responded=True test
        res = await client.post(f"/api/sessions/{session_id}/idle", json={
            "scene_or_question_id": "scene_2",
            "responded": True
        }, headers=headers)
        assert res.status_code == 200
        assert res.json()["responded"] is True
