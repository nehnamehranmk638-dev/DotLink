import pytest
import uuid
import json
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db import init_db

@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()

@pytest.mark.asyncio
async def test_full_mastery_gate_api_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Signup & create child
        email = f"parent_{uuid.uuid4().hex[:6]}@example.com"
        res = await client.post("/auth/signup", json={
            "name": "Maria Parent",
            "email": email,
            "password": "password123",
            "consent_given": True
        })
        token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        res = await client.post("/children", json={
            "name": "Arjun",
            "age": 10,
            "grade": 5,
            "mascot_name": "Sparky the Fox"
        }, headers=headers)
        child = res.json()
        child_id = child["id"]
        initial_stars = child["total_stars"]

        # 2. Fetch NCERT & generate lesson & dual quizzes
        res = await client.post("/ncert/fetch-and-chunk", data={"grade": 5, "subject": "Maths", "chapter_num": 1}, headers=headers)
        topics = res.json()["topics"]
        topic_1_id = topics[0]["id"]

        from app.routers.curriculum import background_generate_lesson_and_quizzes
        await background_generate_lesson_and_quizzes(topic_1_id, "chunked")

        # Approve Topic 1
        res = await client.post(f"/topics/{topic_1_id}/approve", headers=headers)
        assert res.status_code == 200

        # Start session on Topic 1
        res = await client.post("/sessions/start-or-resume", json={
            "child_id": child_id,
            "topic_id": topic_1_id
        }, headers=headers)
        session_id = res.json()["session_id"]

        # 3. Fetch Quiz Set A questions (10 questions)
        res = await client.get(f"/sessions/{session_id}/quiz-questions?quiz_set=quiz_a", headers=headers)
        assert res.status_code == 200
        set_a_questions = res.json()
        assert len(set_a_questions) == 10

        # 4. Submit Set A with 6 correct (Score 6 - Fail Path)
        answers_score_6 = []
        for i in range(6):
            q = set_a_questions[i]
            answers_score_6.append({
                "question_id": q["id"],
                "selected_answer": q["correct_answer"],
                "is_first_try_correct": True
            })
        for i in range(6, 10):
            q = set_a_questions[i]
            answers_score_6.append({
                "question_id": q["id"],
                "selected_answer": "Wrong Answer",
                "is_first_try_correct": False
            })

        res = await client.post(f"/api/sessions/{session_id}/quiz-submit", json={
            "quiz_set": "quiz_a",
            "answers": answers_score_6
        }, headers=headers)
        assert res.status_code == 200
        result_a = res.json()
        assert result_a["score_out_of_10"] == 6
        assert result_a["passed"] is False
        assert result_a["launch_quiz_b"] is True
        assert result_a["full_revision_module"] is not None
        assert len(result_a["full_revision_module"]["missed_breakdown"]) == 4

        # Verify child stars unchanged after failed Set A
        res = await client.get(f"/play/topics/{child_id}", headers=headers)
        assert res.json()["child"]["total_stars"] == initial_stars
        # Verify topic is not yet mastered
        top1_status = [t for t in res.json()["topics"] if t["id"] == topic_1_id][0]
        assert top1_status["is_mastered"] is False

        # 5. Fetch Quiz Set B questions (10 questions)
        res = await client.get(f"/sessions/{session_id}/quiz-questions?quiz_set=quiz_b", headers=headers)
        assert res.status_code == 200
        set_b_questions = res.json()
        assert len(set_b_questions) == 10

        # 6. Submit Set B with 8 correct (Score 8 - Pass Path)
        answers_score_8 = []
        for i in range(8):
            q = set_b_questions[i]
            answers_score_8.append({
                "question_id": q["id"],
                "selected_answer": q["correct_answer"],
                "is_first_try_correct": True
            })
        for i in range(8, 10):
            q = set_b_questions[i]
            answers_score_8.append({
                "question_id": q["id"],
                "selected_answer": "Wrong Answer",
                "is_first_try_correct": False
            })

        res = await client.post(f"/api/sessions/{session_id}/quiz-submit", json={
            "quiz_set": "quiz_b",
            "answers": answers_score_8
        }, headers=headers)
        assert res.status_code == 200
        result_b = res.json()
        assert result_b["score_out_of_10"] == 8
        assert result_b["passed"] is True
        assert result_b["bonus_stars"] == 10
        assert result_b["topic_mastered"] is True

        # Verify +10 bonus stars awarded
        res = await client.get(f"/play/topics/{child_id}", headers=headers)
        assert res.json()["child"]["total_stars"] == initial_stars + 10

        # Verify Topic 1 is now marked mastered
        topics_after = res.json()["topics"]
        top1_after = [t for t in topics_after if t["id"] == topic_1_id][0]
        assert top1_after["is_mastered"] is True

        # Verify that subsequent topic is now unlocked!
        if len(topics_after) > 1:
            top2_after = topics_after[1]
            assert top2_after["is_unlocked"] is True
