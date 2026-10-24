import json
import uuid
import traceback
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks
from app.db import get_db
from app.deps import get_current_parent, verify_topic_ownership, verify_textbook_ownership
from app.models.schemas import (
    TopicOut,
    TextbookOut,
    LessonBundleOut,
    QuestionOut,
    QuestionPatch,
    LessonBundlePatch,
    AgentStepOut,
    SourcePageOut
)
from app.agents.ncert_agent import run_ncert_fetch_and_chunk
from app.agents.chunking_agent import run_textbook_chunking_agent
from app.services.pdf_ncert import ingest_uploaded_textbook
from app.agents.lesson_revision_agent import run_lesson_and_revision_agent
from app.agents.quiz_agent import run_quiz_agent
from app.agents.loop import log_agent_step

router = APIRouter(tags=["curriculum"])

async def background_generate_lesson_and_quizzes(topic_id: str, previous_status: str):
    """Background task executing Agent 2 and Agent 3 sequentially."""
    db = await get_db()
    run_id = str(uuid.uuid4())
    try:
        # 1. Run Agent 2 (Lesson & Revision)
        await run_lesson_and_revision_agent(topic_id, run_id, db)
        
        # 2. Run Agent 3 (Quiz & Retest)
        await run_quiz_agent(topic_id, run_id, db)

        # On success: set status directly to 'approved' so no manual approval is required
        await db.execute("UPDATE topics SET status = 'approved' WHERE id = ?", (topic_id,))
        await db.commit()
    except Exception as e:
        # On failure: restore previous status and log error
        err_msg = f"Generation failed: {str(e)}\n{traceback.format_exc()}"
        await log_agent_step(db, run_id, topic_id, "generation_runner", 99, "generation_job", {}, err_msg)
        await db.execute("UPDATE topics SET status = ? WHERE id = ?", (previous_status, topic_id))
        await db.commit()
    finally:
        await db.close()

@router.post("/curriculum/upload-textbook")
async def upload_and_chunk_textbook(
    file: UploadFile = File(...),
    grade: Optional[int] = Form(None),
    subject_tag: str = Form(...),
    title: Optional[str] = Form(None),
    parent: dict = Depends(get_current_parent)
):
    """
    Parent directly uploads a digital textbook PDF.
    Extracts text per-page, validates selectable text, stores PDF,
    and invokes Agent 1 for intelligent hierarchical chunking (Chapters -> Sub-Topics).
    """
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A digital textbook PDF file is required."
        )

    pdf_bytes = await file.read()
    if len(pdf_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded PDF file is empty."
        )

    db = await get_db()
    try:
        if grade is None:
            c_cur = await db.execute("SELECT grade FROM children WHERE parent_id = ? ORDER BY created_at ASC LIMIT 1", (parent["id"],))
            c_row = await c_cur.fetchone()
            grade = c_row["grade"] if c_row else 4

        clean_title = (title or "").strip()
        if not clean_title:
            base_name = file.filename.rsplit(".", 1)[0]
            clean_title = base_name.replace("_", " ").replace("-", " ").title()
            if not clean_title:
                clean_title = f"{subject_tag} Grade {grade}"
        textbook_id, page_count, pages = await ingest_uploaded_textbook(
            parent_id=parent["id"],
            grade=grade,
            subject_tag=subject_tag,
            title=clean_title,
            filename=file.filename,
            pdf_bytes=pdf_bytes,
            db=db
        )

        result = await run_textbook_chunking_agent(
            textbook_id=textbook_id,
            grade=grade,
            subject_tag=subject_tag,
            db=db
        )
        return result
    except ValueError as ve:
        err_str = str(ve)
        if "no_selectable_text" in err_str:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="no_selectable_text: The uploaded PDF does not contain selectable text (may be scanned images). Please upload a digital textbook PDF with selectable text."
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_str)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Upload & Chunking error: {str(e)}"
        )
    finally:
        await db.close()

@router.post("/ncert/fetch-and-chunk")
async def fetch_and_chunk_ncert(
    grade: int = Form(...),
    subject: str = Form(...),
    chapter_num: int = Form(1),
    file: Optional[UploadFile] = File(None),
    parent: dict = Depends(get_current_parent)
):
    pdf_bytes = None
    if file:
        pdf_bytes = await file.read()

    try:
        result = await run_ncert_fetch_and_chunk(
            parent_id=parent["id"],
            grade=grade,
            subject=subject,
            chapter_num=chapter_num,
            uploaded_pdf_bytes=pdf_bytes
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"NCERT Fetch & Chunk error: {str(e)}"
        )

@router.get("/textbooks", response_model=List[TextbookOut])
async def list_textbooks(parent: dict = Depends(get_current_parent)):
    db = await get_db()
    try:
        cursor = await db.execute("""
            SELECT * FROM textbooks WHERE parent_id = ? ORDER BY created_at DESC
        """, (parent["id"],))
        rows = await cursor.fetchall()
        return [
            TextbookOut(
                id=r["id"],
                parent_id=r["parent_id"],
                grade=r["grade"],
                subject_tag=r["subject_tag"],
                title=r["title"],
                ncert_code=r["ncert_code"],
                storage_path=r["storage_path"],
                page_count=r["page_count"],
                created_at=str(r["created_at"])
            )
            for r in rows
        ]
    finally:
        await db.close()

@router.get("/textbooks/{id}/topics", response_model=List[TopicOut])
async def list_topics_for_textbook(id: str, parent: dict = Depends(get_current_parent)):
    db = await get_db()
    try:
        await verify_textbook_ownership(id, parent["id"], db)
        cursor = await db.execute("""
            SELECT * FROM topics
            WHERE textbook_id = ?
            ORDER BY chapter_number ASC, topic_number ASC, start_page ASC
        """, (id,))
        rows = await cursor.fetchall()
        return [
            TopicOut(
                id=r["id"],
                textbook_id=r["textbook_id"],
                chapter_number=r["chapter_number"] if "chapter_number" in r.keys() else 1,
                chapter_title=r["chapter_title"] if "chapter_title" in r.keys() and r["chapter_title"] else r["chapter_name"],
                chapter_name=r["chapter_name"],
                topic_number=r["topic_number"] if "topic_number" in r.keys() else 1,
                name=r["name"],
                description=r["description"] if "description" in r.keys() else None,
                subject_tag=r["subject_tag"],
                start_page=r["start_page"],
                end_page=r["end_page"],
                status=r["status"],
                created_at=str(r["created_at"])
            )
            for r in rows
        ]
    finally:
        await db.close()

@router.get("/topics/{id}", response_model=TopicOut)
async def get_topic(id: str, parent: dict = Depends(get_current_parent)):
    db = await get_db()
    try:
        topic = await verify_topic_ownership(id, parent["id"], db)
        return TopicOut(
            id=topic["id"],
            textbook_id=topic["textbook_id"],
            chapter_number=topic["chapter_number"] if "chapter_number" in topic.keys() else 1,
            chapter_title=topic["chapter_title"] if "chapter_title" in topic.keys() and topic["chapter_title"] else topic["chapter_name"],
            chapter_name=topic["chapter_name"],
            topic_number=topic["topic_number"] if "topic_number" in topic.keys() else 1,
            name=topic["name"],
            description=topic["description"] if "description" in topic.keys() else None,
            subject_tag=topic["subject_tag"],
            start_page=topic["start_page"],
            end_page=topic["end_page"],
            status=topic["status"],
            created_at=str(topic["created_at"])
        )
    finally:
        await db.close()

@router.post("/topics/{id}/generate")
async def trigger_generation(
    id: str,
    background_tasks: BackgroundTasks,
    parent: dict = Depends(get_current_parent)
):
    db = await get_db()
    try:
        topic = await verify_topic_ownership(id, parent["id"], db)
        prev_status = topic["status"]

        # Mark as generating
        await db.execute("UPDATE topics SET status = 'generating' WHERE id = ?", (id,))
        await db.commit()

        background_tasks.add_task(background_generate_lesson_and_quizzes, id, prev_status)
        return {"message": "Generation started in background", "topic_id": id, "status": "generating"}
    finally:
        await db.close()

@router.get("/topics/{id}/agent-steps", response_model=List[AgentStepOut])
async def get_agent_steps(id: str, parent: dict = Depends(get_current_parent)):
    db = await get_db()
    try:
        await verify_topic_ownership(id, parent["id"], db)
        cursor = await db.execute("""
            SELECT * FROM agent_steps WHERE topic_id = ? ORDER BY created_at ASC, step_num ASC
        """, (id,))
        rows = await cursor.fetchall()
        result = []
        for r in rows:
            args_val = json.loads(r["args_json"]) if isinstance(r["args_json"], str) else r["args_json"]
            result.append(AgentStepOut(
                id=r["id"],
                run_id=r["run_id"],
                topic_id=r["topic_id"],
                agent_name=r["agent_name"],
                step_num=r["step_num"],
                tool_name=r["tool_name"],
                args_json=args_val or {},
                result_summary=r["result_summary"],
                created_at=str(r["created_at"])
            ))
        return result
    finally:
        await db.close()

@router.get("/topics/{id}/lesson-bundle")
async def get_lesson_bundle(id: str, parent: dict = Depends(get_current_parent)):
    db = await get_db()
    try:
        await verify_topic_ownership(id, parent["id"], db)
        cursor = await db.execute("SELECT * FROM lesson_bundles WHERE topic_id = ?", (id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Lesson bundle not generated yet")
        return {
            "id": row["id"],
            "topic_id": row["topic_id"],
            "scenes_json": json.loads(row["scenes_json"]),
            "revision_bullets_json": json.loads(row["revision_bullets_json"]),
            "mini_game_config": json.loads(row["mini_game_config"]),
            "status": row["status"]
        }
    finally:
        await db.close()

@router.patch("/topics/{id}/lesson-bundle")
async def update_lesson_bundle(
    id: str,
    patch: LessonBundlePatch,
    parent: dict = Depends(get_current_parent)
):
    db = await get_db()
    try:
        await verify_topic_ownership(id, parent["id"], db)
        cursor = await db.execute("SELECT * FROM lesson_bundles WHERE topic_id = ?", (id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Lesson bundle not found")

        scenes = json.dumps(patch.scenes_json) if patch.scenes_json is not None else row["scenes_json"]
        bullets = json.dumps(patch.revision_bullets_json) if patch.revision_bullets_json is not None else row["revision_bullets_json"]
        mini_game = json.dumps(patch.mini_game_config) if patch.mini_game_config is not None else row["mini_game_config"]

        await db.execute("""
            UPDATE lesson_bundles
            SET scenes_json = ?, revision_bullets_json = ?, mini_game_config = ?
            WHERE topic_id = ?
        """, (scenes, bullets, mini_game, id))
        await db.commit()
        return {"message": "Lesson bundle updated"}
    finally:
        await db.close()

@router.get("/topics/{id}/questions")
async def get_topic_questions(id: str, parent: dict = Depends(get_current_parent)):
    db = await get_db()
    try:
        await verify_topic_ownership(id, parent["id"], db)
        cursor = await db.execute("""
            SELECT * FROM questions WHERE topic_id = ? ORDER BY question_type ASC, created_at ASC
        """, (id,))
        rows = await cursor.fetchall()
        result = []
        for r in rows:
            q_data = json.loads(r["question_data"]) if isinstance(r["question_data"], str) else r["question_data"]
            result.append({
                "id": r["id"],
                "topic_id": r["topic_id"],
                "question_type": r["question_type"],
                "question_data": q_data,
                "correct_answer": r["correct_answer"],
                "hint_text": r["hint_text"],
                "explanation_text": r["explanation_text"],
                "source_page": r["source_page"],
                "status": r["status"],
                "flagged": bool(r["flagged"]),
                "flag_reason": r["flag_reason"]
            })
        return result
    finally:
        await db.close()

@router.patch("/questions/{id}")
async def patch_question(
    id: str,
    patch: QuestionPatch,
    parent: dict = Depends(get_current_parent)
):
    db = await get_db()
    try:
        cursor = await db.execute("""
            SELECT q.*, t.textbook_id FROM questions q
            JOIN topics t ON q.topic_id = t.id
            JOIN textbooks tb ON t.textbook_id = tb.id
            WHERE q.id = ? AND tb.parent_id = ?
        """, (id, parent["id"]))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Question not found")

        q_data = json.loads(row["question_data"])
        if patch.question_text is not None:
            q_data["question_text"] = patch.question_text
        if patch.options is not None:
            q_data["options"] = patch.options
        
        corr_ans = patch.correct_answer if patch.correct_answer is not None else row["correct_answer"]
        hint = patch.hint_text if patch.hint_text is not None else row["hint_text"]
        expl = patch.explanation_text if patch.explanation_text is not None else row["explanation_text"]
        src_page = patch.source_page if patch.source_page is not None else row["source_page"]

        # If edited, clear the flagged state
        await db.execute("""
            UPDATE questions
            SET question_data = ?, correct_answer = ?, hint_text = ?, explanation_text = ?, source_page = ?, flagged = 0, flag_reason = NULL
            WHERE id = ?
        """, (json.dumps(q_data), corr_ans, hint, expl, src_page, id))
        await db.commit()
        return {"message": "Question updated successfully"}
    finally:
        await db.close()

@router.delete("/questions/{id}")
async def delete_question(id: str, parent: dict = Depends(get_current_parent)):
    db = await get_db()
    try:
        cursor = await db.execute("""
            SELECT q.*, t.textbook_id FROM questions q
            JOIN topics t ON q.topic_id = t.id
            JOIN textbooks tb ON t.textbook_id = tb.id
            WHERE q.id = ? AND tb.parent_id = ?
        """, (id, parent["id"]))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Question not found")

        await db.execute("DELETE FROM questions WHERE id = ?", (id,))
        await db.commit()
        return {"message": "Question deleted"}
    finally:
        await db.close()

@router.get("/topics/{id}/source-pages", response_model=List[SourcePageOut])
async def get_topic_source_pages(id: str, parent: dict = Depends(get_current_parent)):
    """Parent-only endpoint for source text popovers during review."""
    db = await get_db()
    try:
        topic = await verify_topic_ownership(id, parent["id"], db)
        cursor = await db.execute("""
            SELECT * FROM source_pages
            WHERE textbook_id = ? AND page_number BETWEEN ? AND ?
            ORDER BY page_number ASC
        """, (topic["textbook_id"], topic["start_page"], topic["end_page"]))
        rows = await cursor.fetchall()
        return [
            SourcePageOut(
                id=r["id"],
                textbook_id=r["textbook_id"],
                topic_id=r["topic_id"],
                page_number=r["page_number"],
                text=r["text"]
            )
            for r in rows
        ]
    finally:
        await db.close()

@router.post("/topics/{id}/approve")
async def approve_topic(id: str, parent: dict = Depends(get_current_parent)):
    """
    Approves the topic so it appears on the Student Dashboard.
    Strictly enforces that Set A and Set B each have exactly 10 questions.
    """
    db = await get_db()
    try:
        await verify_topic_ownership(id, parent["id"], db)

        # Count Set A questions
        cursor_a = await db.execute(
            "SELECT COUNT(*) as count FROM questions WHERE topic_id = ? AND question_type = 'quiz_a'",
            (id,)
        )
        count_a = (await cursor_a.fetchone())["count"]

        # Count Set B questions
        cursor_b = await db.execute(
            "SELECT COUNT(*) as count FROM questions WHERE topic_id = ? AND question_type = 'quiz_b'",
            (id,)
        )
        count_b = (await cursor_b.fetchone())["count"]

        if count_a != 10 or count_b != 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot approve topic: Quiz Set A has {count_a}/10 questions, and Quiz Set B has {count_b}/10 questions. "
                    "Each set must contain exactly 10 questions. Please edit questions instead of deleting, or regenerate the lesson."
                )
            )

        # Update topic status to 'approved'
        await db.execute("UPDATE topics SET status = 'approved' WHERE id = ?", (id,))
        await db.commit()
        return {"message": "Topic approved successfully", "topic_id": id, "status": "approved"}
    finally:
        await db.close()
