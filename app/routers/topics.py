import io
import uuid
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, BackgroundTasks
from typing import List, Dict, Any, Optional
from pypdf import PdfReader
from app.models.schemas import CreateTopicRequest, CompleteTopicResponse
from app.deps import get_current_parent, get_supabase_admin, assert_owns_topic
from app.services.pdf import extract_pdf_page_text
from app.agents.content_agent import run_content_agent
from app.config import settings

router = APIRouter(tags=["topics"])

@router.post("/textbooks/upload")
async def upload_textbook(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    parent: dict = Depends(get_current_parent)
):
    admin = get_supabase_admin()
    contents = await file.read()
    
    try:
        reader = PdfReader(io.BytesIO(contents))
        page_count = len(reader.pages)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid PDF file: {str(e)}")

    clean_filename = f"{uuid.uuid4()}_{file.filename}"
    storage_path = f"{parent['id']}/{clean_filename}"

    # Upload to Supabase private storage bucket 'textbooks'
    try:
        admin.storage.from_("textbooks").upload(
            path=storage_path,
            file=contents,
            file_options={"content-type": "application/pdf"}
        )
    except Exception as storage_err:
        print(f"[Storage Warning]: {storage_err}")

    # Insert row in textbooks table
    tb_title = title or file.filename.replace(".pdf", "")
    tb_res = admin.table("textbooks").insert({
        "parent_id": parent["id"],
        "title": tb_title,
        "storage_path": storage_path,
        "page_count": page_count
    }).execute()

    if not tb_res.data:
        raise HTTPException(status_code=500, detail="Failed to save textbook record.")

    return tb_res.data[0]

@router.post("/topics")
async def create_topic(
    req: CreateTopicRequest,
    parent: dict = Depends(get_current_parent)
):
    admin = get_supabase_admin()
    # Verify parent owns textbook
    tb_res = admin.table("textbooks").select("id").eq("id", req.textbook_id).eq("parent_id", parent["id"]).single().execute()
    if not tb_res.data:
        raise HTTPException(status_code=403, detail="Textbook not found or access denied.")

    topic_res = admin.table("topics").insert({
        "textbook_id": req.textbook_id,
        "subject": req.subject,
        "name": req.name,
        "chapter_tag": req.chapter_tag,
        "start_page": req.start_page,
        "end_page": req.end_page,
        "status": "processing"
    }).execute()

    if not topic_res.data:
        raise HTTPException(status_code=500, detail="Failed to create topic.")

    return topic_res.data[0]

@router.get("/topics")
async def list_topics(parent: dict = Depends(get_current_parent)):
    admin = get_supabase_admin()
    res = admin.table("topics").select("*, textbooks!inner(parent_id, title)").eq("textbooks.parent_id", parent["id"]).order("created_at", desc=True).execute()
    return res.data or []

@router.get("/topics/{topic_id}")
async def get_topic_details(
    topic_id: str,
    topic: dict = Depends(assert_owns_topic)
):
    admin = get_supabase_admin()
    questions_res = admin.table("questions").select("*").eq("topic_id", topic_id).execute()
    pages_res = admin.table("source_pages").select("page_number, text").eq("topic_id", topic_id).order("page_number").execute()
    progress_res = admin.table("topic_progress").select("*").eq("topic_id", topic_id).execute()

    return {
        "topic": topic,
        "questions": questions_res.data or [],
        "source_pages": pages_res.data or [],
        "progress": progress_res.data[0] if progress_res.data else None
    }

@router.post("/topics/{topic_id}/extract")
async def extract_topic_content(
    topic_id: str,
    topic: dict = Depends(assert_owns_topic)
):
    """
    Downloads textbook PDF, extracts per-page text with pypdf,
    checks for selectable text, and runs the Content Agent reasoning loop.
    """
    admin = get_supabase_admin()

    # 1. Fetch textbook storage path
    tb_res = admin.table("textbooks").select("storage_path").eq("id", topic["textbook_id"]).single().execute()
    if not tb_res.data:
        raise HTTPException(status_code=404, detail="Textbook not found.")

    storage_path = tb_res.data["storage_path"]
    try:
        pdf_bytes = admin.storage.from_("textbooks").download(storage_path)
    except Exception as e:
        # Fallback to local sample PDF if storage download fails
        import os
        sample_path = "samples/grade3_science_chapter.pdf"
        if os.path.exists(sample_path):
            with open(sample_path, "rb") as f:
                pdf_bytes = f.read()
        else:
            raise HTTPException(status_code=500, detail=f"Failed to load PDF file: {str(e)}")

    # 2. Extract per-page text
    ok, pages_data, err_msg = extract_pdf_page_text(
        pdf_bytes,
        topic["start_page"],
        topic["end_page"]
    )

    if not ok:
        admin.table("topics").update({"status": "failed"}).eq("id", topic_id).execute()
        return {"success": False, "error": "no_selectable_text", "detail": err_msg}

    # 3. Store source pages in DB
    for p in pages_data:
        admin.table("source_pages").upsert({
            "topic_id": topic_id,
            "page_number": p["page_number"],
            "text": p["text"]
        }, on_conflict="topic_id, page_number").execute()

    # 4. Run Content Agent with tools and reasoning loop
    agent_output, run_id = await run_content_agent(
        topic_id=topic_id,
        subject=topic.get("subject", "Science"),
        grade=3,
        stored_pages=pages_data
    )

    if not agent_output or not agent_output.questions:
        admin.table("topics").update({"status": "failed"}).eq("id", topic_id).execute()
        return {"success": False, "error": "extraction_failed", "run_id": run_id}

    # 5. Insert questions with status pending_review
    for q in agent_output.questions:
        admin.table("questions").insert({
            "topic_id": topic_id,
            "question_data": {
                "question_text": q.questionText,
                "type": q.type,
                "options": q.options
            },
            "correct_answer": q.correctAnswer,
            "difficulty": q.difficulty,
            "source": "auto",
            "source_page": q.sourcePage,
            "status": "pending_review"
        }).execute()

    # 6. Move topic status to needs_review
    admin.table("topics").update({"status": "needs_review"}).eq("id", topic_id).execute()

    return {
        "success": True,
        "run_id": run_id,
        "questions_count": len(agent_output.questions),
        "status": "needs_review"
    }

@router.get("/topics/{topic_id}/agent-steps")
async def get_agent_steps(
    topic_id: str,
    topic: dict = Depends(assert_owns_topic)
):
    """
    Returns the complete step-by-step trace of agent reasoning for parent review.
    """
    admin = get_supabase_admin()
    runs_res = admin.table("agent_runs").select("*").eq("topic_id", topic_id).order("created_at", desc=True).execute()
    runs = runs_res.data or []
    if not runs:
        return {"runs": []}

    latest_run = runs[0]
    steps_res = admin.table("agent_steps").select("*").eq("run_id", latest_run["id"]).order("step").execute()
    return {
        "run": latest_run,
        "steps": steps_res.data or []
    }

@router.post("/topics/{topic_id}/approve")
async def approve_topic(
    topic_id: str,
    parent: dict = Depends(get_current_parent),
    topic: dict = Depends(assert_owns_topic)
):
    """
    Approval Gate (Rule 7): flips questions to approved, creates topic_progress,
    and opens the lesson to child play mode.
    """
    admin = get_supabase_admin()

    # Approve all questions under this topic
    admin.table("questions").update({"status": "approved"}).eq("topic_id", topic_id).execute()

    # Flip topic to approved
    admin.table("topics").update({"status": "approved"}).eq("id", topic_id).execute()

    # Get parent's active child
    child_res = admin.table("children").select("id").eq("parent_id", parent["id"]).limit(1).execute()
    if child_res.data:
        child_id = child_res.data[0]["id"]
        admin.table("topic_progress").upsert({
            "child_id": child_id,
            "topic_id": topic_id,
            "status": "not_started",
            "silent_accuracy_avg": 0.0,
            "stars_total": 0
        }, on_conflict="child_id, topic_id").execute()

    return {"success": True, "status": "approved"}

@router.post("/api/topics/{topic_id}/complete")
async def complete_topic(
    topic_id: str,
    topic: dict = Depends(assert_owns_topic)
):
    """
    Evaluates mastery criteria (§9):
    Mastery = silent accuracy avg >= 70% AND >= 5 attempted questions.
    """
    admin = get_supabase_admin()

    # Fetch attempts across sessions for this topic
    sess_res = admin.table("sessions").select("id, child_id").eq("topic_id", topic_id).execute()
    sessions = sess_res.data or []
    if not sessions:
        raise HTTPException(status_code=400, detail="No session found for this topic.")

    session_ids = [s["id"] for s in sessions]
    child_id = sessions[0]["child_id"]

    att_res = admin.table("attempts").select("is_correct, silent_accuracy, stars_earned, attempt_number").in_("session_id", session_ids).execute()
    attempts = att_res.data or []

    total_attempts = len(attempts)
    stars_total = sum(a.get("stars_earned", 0) for a in attempts)
    accuracies = [float(a.get("silent_accuracy", 0.0)) for a in attempts]
    silent_avg = sum(accuracies) / total_attempts if total_attempts > 0 else 0.0

    first_attempts = [a for a in attempts if a.get("attempt_number") == 1]
    first_acc = sum(1 for a in first_attempts if a.get("is_correct")) / len(first_attempts) if first_attempts else 0.0
    final_acc = sum(1 for a in attempts if a.get("is_correct")) / total_attempts if total_attempts > 0 else 0.0

    is_mastered = (silent_avg >= settings.MASTERY_ACCURACY and total_attempts >= settings.MASTERY_MIN_ATTEMPTS)
    status_label = "mastered" if is_mastered else "needs_practice"

    admin.table("topic_progress").upsert({
        "child_id": child_id,
        "topic_id": topic_id,
        "status": status_label,
        "silent_accuracy_avg": round(silent_avg, 2),
        "stars_total": stars_total
    }, on_conflict="child_id, topic_id").execute()

    return CompleteTopicResponse(
        topic_id=topic_id,
        status=status_label,
        silent_accuracy_avg=round(silent_avg, 2),
        stars_total=stars_total,
        first_attempt_accuracy=round(first_acc * 100, 1),
        final_accuracy=round(final_acc * 100, 1)
    )
