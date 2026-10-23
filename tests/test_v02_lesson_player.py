import pytest
import uuid
import json
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db import init_db, get_db

@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()

@pytest.mark.asyncio
async def test_lesson_player_and_resume_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Parent signup & Child creation
        email = f"parent_{uuid.uuid4().hex[:6]}@example.com"
        res = await client.post("/auth/signup", json={
            "name": "Alex Parent",
            "email": email,
            "password": "mypassword123",
            "consent_given": True
        })
        assert res.status_code == 200
        token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        res = await client.post("/children", json={
            "name": "Maya",
            "age": 9,
            "grade": 4,
            "mascot_name": "Luna the Owl"
        }, headers=headers)
        assert res.status_code == 200
        child_id = res.json()["id"]

        # 2. Ingest NCERT chapter & generate lesson
        res = await client.post("/ncert/fetch-and-chunk", data={"grade": 4, "subject": "Maths", "chapter_num": 1}, headers=headers)
        assert res.status_code == 200
        topics = res.json()["topics"]
        topic_id = topics[0]["id"]

        from app.routers.curriculum import background_generate_lesson_and_quizzes
        await background_generate_lesson_and_quizzes(topic_id, "chunked")

        # Approve topic so it appears on Student Dashboard
        res = await client.post(f"/topics/{topic_id}/approve", headers=headers)
        assert res.status_code == 200

        # 3. Verify Student Topics list with lock states
        res = await client.get(f"/play/topics/{child_id}", headers=headers)
        assert res.status_code == 200
        data = res.json()
        assert len(data["topics"]) >= 1
        assert data["topics"][0]["is_unlocked"] is True

        # 4. Fresh Session Start: begins at scene 0, unlocked_bullets is empty
        res = await client.post("/sessions/start-or-resume", json={
            "child_id": child_id,
            "topic_id": topic_id
        }, headers=headers)
        assert res.status_code == 200
        session_data = res.json()
        session_id = session_data["session_id"]
        assert session_data["is_resume"] is False
        assert session_data["last_scene_index"] == 0
        assert session_data["unlocked_bullets"] == []

        # 5. Check 1: Click Highlighted Word -> unlocks revision bullet 1 in order
        res = await client.post("/api/adaptive/interact", json={
            "session_id": session_id,
            "interaction_type": "highlight_click",
            "word": "Pattern",
            "scene_num": 1
        }, headers=headers)
        assert res.status_code == 200
        click_res = res.json()
        assert click_res["unlocked_bullet"] is not None
        first_bullet_text = click_res["unlocked_bullet"]["text"]

        # Click second highlighted word -> unlocks revision bullet 2 in order
        res = await client.post("/api/adaptive/interact", json={
            "session_id": session_id,
            "interaction_type": "highlight_click",
            "word": "Rule",
            "scene_num": 2
        }, headers=headers)
        assert res.status_code == 200
        assert res.json()["unlocked_bullet"] is not None
        second_bullet_text = res.json()["unlocked_bullet"]["text"]
        assert second_bullet_text != first_bullet_text

        # 6. Advance to scene 2 and pause the session
        res = await client.post(f"/sessions/{session_id}/pause", json={"scene_index": 2}, headers=headers)
        assert res.status_code == 200
        assert res.json()["status"] == "paused"

        # 7. ACCEPTANCE CRITERIA: Resuming after pause shows the unlocked bullets FIRST before continuing at last_scene_index
        res = await client.post("/sessions/start-or-resume", json={
            "child_id": child_id,
            "topic_id": topic_id
        }, headers=headers)
        assert res.status_code == 200
        resumed_data = res.json()
        assert resumed_data["session_id"] == session_id
        assert resumed_data["is_resume"] is True
        assert resumed_data["last_scene_index"] == 2
        # Verify that all bullet points unlocked so far are returned first
        assert len(resumed_data["unlocked_bullets"]) == 2
        assert resumed_data["unlocked_bullets"][0]["text"] == first_bullet_text
        assert resumed_data["unlocked_bullets"][1]["text"] == second_bullet_text

        # Verify session details endpoint
        res = await client.get(f"/sessions/{session_id}/details", headers=headers)
        assert res.status_code == 200
        details = res.json()
        assert details["is_resume"] is True
        assert details["last_scene_index"] == 2
        assert len(details["unlocked_bullets"]) == 2
