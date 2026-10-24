import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db import init_db

@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()

@pytest.mark.asyncio
async def test_full_v01_curriculum_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Signup without consent must fail
        signup_no_consent = {
            "name": "Test Parent",
            "email": f"parent_{uuid.uuid4().hex[:6]}@example.com",
            "password": "securepassword123",
            "consent_given": False
        }
        res = await client.post("/auth/signup", json=signup_no_consent)
        assert res.status_code == 422 or res.status_code == 400

        # 2. Signup with consent succeeds
        parent_email = f"parent_{uuid.uuid4().hex[:6]}@example.com"
        signup_data = {
            "name": "Jane Parent",
            "email": parent_email,
            "password": "securepassword123",
            "consent_given": True
        }
        res = await client.post("/auth/signup", json=signup_data)
        assert res.status_code == 200
        auth_data = res.json()
        token = auth_data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 3. Create Child Profile
        child_payload = {
            "name": "Leo",
            "age": 9,
            "grade": 4,
            "mascot_name": "Leo the Lion"
        }
        res = await client.post("/children", json=child_payload, headers=headers)
        assert res.status_code == 200
        child = res.json()
        assert child["name"] == "Leo"
        assert child["mascot_name"] == "Leo the Lion"

        # 4. Fetch & Chunk NCERT Chapter (Agent 1)
        res = await client.post(
            "/ncert/fetch-and-chunk",
            data={"grade": 4, "subject": "Maths", "chapter_num": 1},
            headers=headers
        )
        assert res.status_code == 200
        ingest_res = res.json()
        assert "textbook_id" in ingest_res
        assert len(ingest_res["topics"]) >= 1

        topic_id = ingest_res["topics"][0]["id"]

        # 5. Background Generation (Agents 2 & 3)
        res = await client.post(f"/topics/{topic_id}/generate", headers=headers)
        assert res.status_code == 200
        assert res.json()["status"] == "generating"

        # Wait / run background tasks directly (in test with background_generate_lesson_and_quizzes)
        from app.routers.curriculum import background_generate_lesson_and_quizzes
        await background_generate_lesson_and_quizzes(topic_id, "chunked")

        # Verify topic status updated
        res = await client.get(f"/topics/{topic_id}", headers=headers)
        assert res.status_code == 200
        topic_info = res.json()
        assert topic_info["status"] in ("needs_review", "approved")

        # 6. Verify Lesson Bundle & Questions
        res = await client.get(f"/topics/{topic_id}/lesson-bundle", headers=headers)
        assert res.status_code == 200
        bundle = res.json()
        assert len(bundle["scenes_json"]) >= 4
        assert len(bundle["revision_bullets_json"]) >= 1
        assert len(bundle["mini_game_config"]["pairs"]) >= 6

        res = await client.get(f"/topics/{topic_id}/questions", headers=headers)
        assert res.status_code == 200
        questions = res.json()
        set_a = [q for q in questions if q["question_type"] == "quiz_a"]
        set_b = [q for q in questions if q["question_type"] == "quiz_b"]
        assert len(set_a) == 10
        assert len(set_b) == 10

        # Verify source pages popover endpoint
        res = await client.get(f"/topics/{topic_id}/source-pages", headers=headers)
        assert res.status_code == 200
        assert len(res.json()) >= 1

        # 7. Test Approval Gate blocking if fewer than 10 questions
        # Delete one question from Set A
        q_to_delete = set_a[0]["id"]
        res = await client.delete(f"/questions/{q_to_delete}", headers=headers)
        assert res.status_code == 200

        # Attempt approval - must fail because Set A has 9 questions
        res = await client.post(f"/topics/{topic_id}/approve", headers=headers)
        assert res.status_code == 400
        assert "Each set must contain exactly 10 questions" in res.json()["detail"]

        # Restore question back by re-running quiz agent or inserting replacement
        from app.agents.quiz_agent import run_quiz_agent
        from app.db import get_db
        db = await get_db()
        await run_quiz_agent(topic_id, str(uuid.uuid4()), db)
        await db.close()

        # Approve topic - must now succeed
        res = await client.post(f"/topics/{topic_id}/approve", headers=headers)
        assert res.status_code == 200
        assert res.json()["status"] == "approved"
