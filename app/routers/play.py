import json
import uuid
import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from app.db import get_db
from app.deps import get_current_parent, verify_child_ownership, verify_topic_ownership
from app.models.schemas import SessionStartResumeRequest, QuizSubmitRequest, QuizSubmitResponse
from app.services.mastery_gate import evaluate_mastery_submission

router = APIRouter(tags=["play"])

async def get_child_topics_with_lock_state(child_id: str, db, parent_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Derives lock and mastery status deterministically:
    - Strictly filters by parent_id to prevent cross-parent data leak.
    - Includes both 'approved' and 'needs_review' generated lessons so they can be played.
    - First topic in a textbook is always unlocked.
    - Subsequent topics in chapter/topic order unlock when the previous topic has a passed quiz_submission.
    """
    if not parent_id:
        c_cur = await db.execute("SELECT parent_id FROM children WHERE id = ?", (child_id,))
        c_row = await c_cur.fetchone()
        if c_row:
            parent_id = c_row["parent_id"]

    if parent_id:
        cursor = await db.execute("""
            SELECT t.*, tb.title as textbook_title, tb.grade, tb.parent_id
            FROM topics t
            JOIN textbooks tb ON t.textbook_id = tb.id
            WHERE tb.parent_id = ? AND t.status IN ('approved', 'needs_review')
            ORDER BY t.textbook_id ASC, t.chapter_number ASC, t.topic_number ASC, t.start_page ASC
        """, (parent_id,))
    else:
        cursor = await db.execute("""
            SELECT t.*, tb.title as textbook_title, tb.grade, tb.parent_id
            FROM topics t
            JOIN textbooks tb ON t.textbook_id = tb.id
            WHERE t.status IN ('approved', 'needs_review')
            ORDER BY t.textbook_id ASC, t.chapter_number ASC, t.topic_number ASC, t.start_page ASC
        """)
    all_topics = await cursor.fetchall()

    passed_cursor = await db.execute("""
        SELECT DISTINCT s.topic_id
        FROM quiz_submissions qs
        JOIN sessions s ON qs.session_id = s.id
        WHERE s.child_id = ? AND qs.passed = 1
    """, (child_id,))
    passed_rows = await passed_cursor.fetchall()
    mastered_topic_ids = {r["topic_id"] for r in passed_rows}

    textbook_map = {}
    for t in all_topics:
        tb_id = t["textbook_id"]
        if tb_id not in textbook_map:
            textbook_map[tb_id] = []
        textbook_map[tb_id].append(dict(t))

    result = []
    for tb_id, topics in textbook_map.items():
        prev_mastered = True
        for idx, top in enumerate(topics):
            is_mastered = top["id"] in mastered_topic_ids
            is_unlocked = prev_mastered or idx == 0

            sess_cursor = await db.execute("""
                SELECT id, status, last_scene_index, unlocked_bullets_count
                FROM sessions
                WHERE child_id = ? AND topic_id = ? AND status IN ('active', 'paused')
                ORDER BY started_at DESC LIMIT 1
            """, (child_id, top["id"]))
            active_sess = await sess_cursor.fetchone()

            ch_num = top["chapter_number"] if "chapter_number" in top.keys() and top["chapter_number"] else 1
            ch_title = top["chapter_title"] if "chapter_title" in top.keys() and top["chapter_title"] else (top.get("chapter_name") or f"Chapter {ch_num}")
            top_num = top["topic_number"] if "topic_number" in top.keys() and top["topic_number"] else (idx + 1)
            desc = top["description"] if "description" in top.keys() else None

            result.append({
                "id": top["id"],
                "textbook_id": top["textbook_id"],
                "textbook_title": top["textbook_title"],
                "chapter_name": top["chapter_name"],
                "chapter_number": ch_num,
                "chapter_title": ch_title,
                "topic_number": top_num,
                "name": top["name"],
                "description": desc,
                "status": top["status"],
                "subject_tag": top["subject_tag"],
                "start_page": top["start_page"],
                "end_page": top["end_page"],
                "grade": top["grade"],
                "is_unlocked": is_unlocked,
                "is_mastered": is_mastered,
                "has_active_session": bool(active_sess),
                "active_session_id": active_sess["id"] if active_sess else None,
                "last_scene_index": active_sess["last_scene_index"] if active_sess else 0
            })
            prev_mastered = is_mastered

    return result

@router.get("/play/topics/{child_id}")
async def get_play_topics(child_id: str, parent: dict = Depends(get_current_parent)):
    """Fetches all approved/ready topics for a child with calculated lock and mastery status."""
    db = await get_db()
    try:
        child = await verify_child_ownership(child_id, parent["id"], db)
        topics = await get_child_topics_with_lock_state(child_id, db, parent_id=parent["id"])
        return {
            "child": child,
            "topics": topics
        }
    finally:
        await db.close()

@router.post("/sessions/start-or-resume")
async def start_or_resume_session(
    req: SessionStartResumeRequest,
    parent: dict = Depends(get_current_parent)
):
    """
    Starts a fresh session (starts at scene 0) OR resumes a paused session.
    When resuming, returns all bullet points unlocked so far and the last_scene_index.
    """
    db = await get_db()
    try:
        await verify_child_ownership(req.child_id, parent["id"], db)

        cursor = await db.execute("""
            SELECT t.*, tb.parent_id
            FROM topics t
            JOIN textbooks tb ON t.textbook_id = tb.id
            WHERE t.id = ?
        """, (req.topic_id,))
        topic = await cursor.fetchone()
        if not topic or topic["parent_id"] != parent["id"]:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Topic not found or does not belong to parent."
            )
        if topic["status"] not in ("approved", "needs_review"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Topic is not ready for learning."
            )

        cursor = await db.execute("SELECT * FROM lesson_bundles WHERE topic_id = ?", (req.topic_id,))
        bundle_row = await cursor.fetchone()
        if not bundle_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson bundle not found for this topic."
            )

        scenes = json.loads(bundle_row["scenes_json"])
        all_bullets = json.loads(bundle_row["revision_bullets_json"])
        mini_game = json.loads(bundle_row["mini_game_config"])

        cursor = await db.execute("""
            SELECT id, question_data, correct_answer, hint_text, explanation_text, source_page
            FROM questions
            WHERE topic_id = ? AND question_type = 'in_video'
            ORDER BY created_at ASC
        """, (req.topic_id,))
        q_rows = await cursor.fetchall()
        in_video_questions = []
        for r in q_rows:
            q_data = json.loads(r["question_data"])
            in_video_questions.append({
                "id": r["id"],
                "scene_num": q_data.get("scene_num", 1),
                "question_text": q_data.get("question_text", ""),
                "options": q_data.get("options", []),
                "correct_answer": r["correct_answer"],
                "hint_text": r["hint_text"],
                "explanation_text": r["explanation_text"],
                "source_page": r["source_page"]
            })

        cursor = await db.execute("""
            SELECT * FROM sessions
            WHERE child_id = ? AND topic_id = ? AND status IN ('active', 'paused')
            ORDER BY started_at DESC LIMIT 1
        """, (req.child_id, req.topic_id))
        existing_sess = await cursor.fetchone()

        if existing_sess:
            sess_id = existing_sess["id"]
            last_idx = existing_sess["last_scene_index"]
            unlocked_count = existing_sess["unlocked_bullets_count"]
            is_resume = (last_idx > 0 or unlocked_count > 0 or existing_sess["status"] == "paused")

            await db.execute("UPDATE sessions SET status = 'active' WHERE id = ?", (sess_id,))
            await db.commit()

            unlocked_bullets = all_bullets[:unlocked_count]
            return {
                "session_id": sess_id,
                "status": "active",
                "is_resume": is_resume,
                "last_scene_index": last_idx,
                "unlocked_bullets_count": unlocked_count,
                "unlocked_bullets": unlocked_bullets,
                "lesson_bundle": {
                    "scenes": scenes,
                    "revision_bullets": all_bullets,
                    "mini_game_config": mini_game
                },
                "in_video_questions": in_video_questions
            }
        else:
            sess_id = str(uuid.uuid4())
            await db.execute("""
                INSERT INTO sessions (id, child_id, topic_id, status, last_scene_index, unlocked_bullets_count, active_focus_seconds)
                VALUES (?, ?, ?, 'active', 0, 0, 0)
            """, (sess_id, req.child_id, req.topic_id))
            await db.commit()

            return {
                "session_id": sess_id,
                "status": "active",
                "is_resume": False,
                "last_scene_index": 0,
                "unlocked_bullets_count": 0,
                "unlocked_bullets": [],
                "lesson_bundle": {
                    "scenes": scenes,
                    "revision_bullets": all_bullets,
                    "mini_game_config": mini_game
                },
                "in_video_questions": in_video_questions
            }
    finally:
        await db.close()

@router.get("/sessions/{id}/details")
async def get_session_details(id: str, parent: dict = Depends(get_current_parent)):
    """Fetches full lesson bundle, progress, and unlocked bullets for a session."""
    db = await get_db()
    try:
        cursor = await db.execute("""
            SELECT s.*, c.parent_id, c.name as child_name, c.mascot_name
            FROM sessions s
            JOIN children c ON s.child_id = c.id
            WHERE s.id = ?
        """, (id,))
        session = await cursor.fetchone()
        if not session or session["parent_id"] != parent["id"]:
            raise HTTPException(status_code=404, detail="Session not found")

        cursor = await db.execute("SELECT * FROM lesson_bundles WHERE topic_id = ?", (session["topic_id"],))
        bundle = await cursor.fetchone()
        scenes = json.loads(bundle["scenes_json"]) if bundle else []
        bullets = json.loads(bundle["revision_bullets_json"]) if bundle else []
        mini_game = json.loads(bundle["mini_game_config"]) if bundle else {}

        cursor = await db.execute("""
            SELECT id, question_data, correct_answer, hint_text, explanation_text, source_page
            FROM questions
            WHERE topic_id = ? AND question_type = 'in_video'
            ORDER BY created_at ASC
        """, (session["topic_id"],))
        q_rows = await cursor.fetchall()
        in_video_questions = []
        for r in q_rows:
            q_data = json.loads(r["question_data"])
            in_video_questions.append({
                "id": r["id"],
                "scene_num": q_data.get("scene_num", 1),
                "question_text": q_data.get("question_text", ""),
                "options": q_data.get("options", []),
                "correct_answer": r["correct_answer"],
                "hint_text": r["hint_text"],
                "explanation_text": r["explanation_text"],
                "source_page": r["source_page"]
            })

        highlighted_words = []
        for s in scenes:
            title = s.get("title", "")
            words = title.split()
            if words:
                highlighted_words.append({
                    "word": words[-1],
                    "key_point": f"Important concept from {title}",
                    "scene_num": s.get("scene_num", 1)
                })

        unlocked_count = session["unlocked_bullets_count"]
        unlocked_bullets = bullets[:unlocked_count]
        is_resume = (session["last_scene_index"] > 0 or unlocked_count > 0 or session["status"] == "paused")

        return {
            "session_id": session["id"],
            "child_id": session["child_id"],
            "topic_id": session["topic_id"],
            "status": session["status"],
            "is_resume": is_resume,
            "last_scene_index": session["last_scene_index"],
            "unlocked_bullets_count": unlocked_count,
            "unlocked_bullets": unlocked_bullets,
            "scenes": scenes,
            "revision_bullets": bullets,
            "highlighted_words": highlighted_words,
            "in_video_questions": in_video_questions,
            "mini_game_config": mini_game
        }
    finally:
        await db.close()

@router.get("/sessions/{id}/quiz-questions")
async def get_quiz_questions(
    id: str,
    quiz_set: str = "quiz_a",
    parent: dict = Depends(get_current_parent)
):
    """Fetches the 10 multiple-choice questions for Quiz Set A or Set B."""
    db = await get_db()
    try:
        cursor = await db.execute("""
            SELECT s.*, c.parent_id FROM sessions s
            JOIN children c ON s.child_id = c.id
            WHERE s.id = ?
        """, (id,))
        session = await cursor.fetchone()
        if not session or session["parent_id"] != parent["id"]:
            raise HTTPException(status_code=404, detail="Session not found")

        cursor = await db.execute("""
            SELECT id, question_data, correct_answer, hint_text, explanation_text, source_page
            FROM questions
            WHERE topic_id = ? AND question_type = ?
            ORDER BY created_at ASC
        """, (session["topic_id"], quiz_set))
        rows = await cursor.fetchall()

        result = []
        for r in rows:
            q_data = json.loads(r["question_data"])
            result.append({
                "id": r["id"],
                "question_text": q_data.get("question_text", ""),
                "options": q_data.get("options", []),
                "correct_answer": r["correct_answer"],
                "hint_text": r["hint_text"],
                "explanation_text": r["explanation_text"],
                "source_page": r["source_page"]
            })
        return result
    finally:
        await db.close()

@router.post("/api/sessions/{id}/quiz-submit", response_model=QuizSubmitResponse)
async def submit_quiz(
    id: str,
    req: QuizSubmitRequest,
    parent: dict = Depends(get_current_parent)
):
    """
    Submits and grades Quiz Set A or Quiz Set B with the deterministic 7/10 Mastery Gate.
    """
    db = await get_db()
    try:
        cursor = await db.execute("""
            SELECT s.*, c.parent_id, c.id as child_id, c.total_stars
            FROM sessions s
            JOIN children c ON s.child_id = c.id
            WHERE s.id = ?
        """, (id,))
        session = await cursor.fetchone()
        if not session or session["parent_id"] != parent["id"]:
            raise HTTPException(status_code=404, detail="Session not found")

        # Load questions for this topic and quiz set
        cursor = await db.execute("""
            SELECT id, question_data, correct_answer, hint_text, explanation_text, source_page
            FROM questions
            WHERE topic_id = ? AND question_type = ?
        """, (session["topic_id"], req.quiz_set))
        q_rows = await cursor.fetchall()
        questions_map = {}
        for r in q_rows:
            q_data = json.loads(r["question_data"])
            questions_map[r["id"]] = {
                "question_text": q_data.get("question_text", ""),
                "options": q_data.get("options", []),
                "correct_answer": r["correct_answer"],
                "hint_text": r["hint_text"],
                "explanation_text": r["explanation_text"],
                "source_page": r["source_page"]
            }

        # Load revision bullets
        cursor = await db.execute("SELECT revision_bullets_json FROM lesson_bundles WHERE topic_id = ?", (session["topic_id"],))
        b_row = await cursor.fetchone()
        all_bullets = json.loads(b_row["revision_bullets_json"]) if b_row else []

        eval_result = evaluate_mastery_submission(
            quiz_set=req.quiz_set,
            answers=req.answers,
            questions_map=questions_map,
            all_revision_bullets=all_bullets
        )

        # Record quiz submission
        sub_id = str(uuid.uuid4())
        await db.execute("""
            INSERT INTO quiz_submissions (id, session_id, quiz_set, score_out_of_10, passed)
            VALUES (?, ?, ?, ?, ?)
        """, (sub_id, id, req.quiz_set, eval_result["score_out_of_10"], 1 if eval_result["passed"] else 0))

        if eval_result["passed"]:
            # Award mastery bonus stars
            await db.execute("""
                UPDATE children SET total_stars = total_stars + ? WHERE id = ?
            """, (eval_result["bonus_stars"], session["child_id"]))
            # Mark session completed
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            await db.execute("""
                UPDATE sessions SET status = 'completed', ended_at = ? WHERE id = ?
            """, (now_iso, id))
        elif req.quiz_set == "quiz_b":
            # Retest Set B failed -> Mark session completed (leaves topic unmastered)
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            await db.execute("""
                UPDATE sessions SET status = 'completed', ended_at = ? WHERE id = ?
            """, (now_iso, id))

        await db.commit()
        return QuizSubmitResponse(**eval_result)
    finally:
        await db.close()

@router.post("/sessions/{id}/update-scene")
async def update_session_scene(
    id: str,
    payload: Dict[str, Any],
    parent: dict = Depends(get_current_parent)
):
    """Saves the current scene playback position."""
    scene_index = payload.get("scene_index", 0)
    db = await get_db()
    try:
        await db.execute("""
            UPDATE sessions SET last_scene_index = ? WHERE id = ?
        """, (scene_index, id))
        await db.commit()
        return {"status": "ok", "last_scene_index": scene_index}
    finally:
        await db.close()

@router.post("/sessions/{id}/pause")
async def pause_session(
    id: str,
    payload: Dict[str, Any] = None,
    parent: dict = Depends(get_current_parent)
):
    """Explicitly pauses a session and preserves current scene position."""
    db = await get_db()
    scene_index = (payload or {}).get("scene_index")
    try:
        if scene_index is not None:
            await db.execute("""
                UPDATE sessions SET status = 'paused', last_scene_index = ? WHERE id = ?
            """, (scene_index, id))
        else:
            await db.execute("UPDATE sessions SET status = 'paused' WHERE id = ?", (id,))
        await db.commit()
        return {"status": "paused"}
    finally:
        await db.close()
