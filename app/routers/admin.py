from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from app.deps import get_current_parent, get_supabase_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])

@router.post("/reset-demo-data")
async def reset_demo_data(parent: dict = Depends(get_current_parent)):
    """
    Seeds ~2 weeks of realistic mock history for the authenticated parent.
    Provides immediate rich data for parent progress charts and judges demonstration.
    """
    admin = get_supabase_admin()
    parent_id = parent["id"]

    # 1. Fetch or create child
    child_res = admin.table("children").select("id, name").eq("parent_id", parent_id).limit(1).execute()
    if child_res.data:
        child = child_res.data[0]
    else:
        new_child = admin.table("children").insert({
            "parent_id": parent_id,
            "name": "Alex",
            "age": 8,
            "grade": 3,
            "mascot_name": "Pip the Fox",
            "games_enabled": True
        }).execute()
        child = new_child.data[0]

    child_id = child["id"]

    # 2. Fetch or create demo textbook
    tb_res = admin.table("textbooks").select("id").eq("parent_id", parent_id).limit(1).execute()
    if tb_res.data:
        textbook = tb_res.data[0]
    else:
        new_tb = admin.table("textbooks").insert({
            "parent_id": parent_id,
            "title": "Science Grade 3: Living Things",
            "storage_path": f"{parent_id}/demo_science_g3.pdf",
            "page_count": 38
        }).execute()
        textbook = new_tb.data[0]

    textbook_id = textbook["id"]

    # 3. Clean previous demo rows for this child
    old_sessions = admin.table("sessions").select("id").eq("child_id", child_id).execute()
    old_session_ids = [s["id"] for s in (old_sessions.data or [])]
    if old_session_ids:
        admin.table("attempts").delete().in_("session_id", old_session_ids).execute()
        admin.table("idle_events").delete().in_("session_id", old_session_ids).execute()
        admin.table("game_attempts").delete().in_("session_id", old_session_ids).execute()
        admin.table("sessions").delete().in_("id", old_session_ids).execute()

    admin.table("insights").delete().eq("child_id", child_id).execute()
    admin.table("topic_progress").delete().eq("child_id", child_id).execute()

    # 4. Insert 3 demo topics
    topics_to_insert = [
        {"textbook_id": textbook_id, "subject": "Science", "name": "Plant Structures & Roots", "chapter_tag": "Chapter 1", "start_page": 4, "end_page": 11, "status": "approved"},
        {"textbook_id": textbook_id, "subject": "Science", "name": "Photosynthesis & Solar Energy", "chapter_tag": "Chapter 2", "start_page": 12, "end_page": 19, "status": "approved"},
        {"textbook_id": textbook_id, "subject": "Science", "name": "Ecosystems & Food Webs", "chapter_tag": "Chapter 3", "start_page": 20, "end_page": 27, "status": "approved"},
    ]
    ins_top = admin.table("topics").insert(topics_to_insert).execute()
    top_rows = ins_top.data or []
    t1 = top_rows[0]
    t2 = top_rows[1]
    t3 = top_rows[2]

    # 5. Insert questions for topic 1 so child quiz can play immediately
    admin.table("questions").insert([
        {
            "topic_id": t1["id"],
            "question_data": {"question_text": "Which part of a plant absorbs water and minerals from the soil?", "type": "multiple_choice", "options": ["Roots", "Leaves", "Flowers", "Stem"]},
            "correct_answer": "Roots",
            "difficulty": "easy",
            "source_page": 5,
            "status": "approved"
        },
        {
            "topic_id": t1["id"],
            "question_data": {"question_text": "What do leaves use to capture energy from sunlight?", "type": "multiple_choice", "options": ["Chlorophyll", "Bark", "Pollen", "Seeds"]},
            "correct_answer": "Chlorophyll",
            "difficulty": "medium",
            "source_page": 7,
            "status": "approved"
        },
        {
            "topic_id": t1["id"],
            "question_data": {"question_text": "Which plant structure acts like a highway to transport nutrients?", "type": "multiple_choice", "options": ["Stem", "Petals", "Roots", "Buds"]},
            "correct_answer": "Stem",
            "difficulty": "easy",
            "source_page": 8,
            "status": "approved"
        }
    ]).execute()

    # 6. Insert 3 Sessions across last 14 days
    now = datetime.utcnow()
    date1 = (now - timedelta(days=10)).isoformat()
    date2 = (now - timedelta(days=5)).isoformat()
    date3 = (now - timedelta(days=1)).isoformat()

    s1 = admin.table("sessions").insert({"child_id": child_id, "topic_id": t1["id"], "started_at": date1, "ended_at": (now - timedelta(days=10, minutes=-12)).isoformat(), "status": "ended"}).execute().data[0]
    s2 = admin.table("sessions").insert({"child_id": child_id, "topic_id": t2["id"], "started_at": date2, "ended_at": (now - timedelta(days=5, minutes=-15)).isoformat(), "status": "ended"}).execute().data[0]
    s3 = admin.table("sessions").insert({"child_id": child_id, "topic_id": t3["id"], "started_at": date3, "ended_at": (now - timedelta(days=1, minutes=-14)).isoformat(), "status": "ended"}).execute().data[0]

    # Attempts Session 1
    admin.table("attempts").insert([
        {"session_id": s1["id"], "question_id": "00000000-0000-0000-0000-000000000001", "is_correct": True, "time_taken": 4.2, "attempt_number": 1, "stars_earned": 3, "silent_accuracy": 1.0, "adaptation_type": "none"},
        {"session_id": s1["id"], "question_id": "00000000-0000-0000-0000-000000000002", "is_correct": True, "time_taken": 5.1, "attempt_number": 1, "stars_earned": 3, "silent_accuracy": 1.0, "adaptation_type": "none"},
        {"session_id": s1["id"], "question_id": "00000000-0000-0000-0000-000000000003", "is_correct": True, "time_taken": 6.0, "attempt_number": 1, "stars_earned": 3, "silent_accuracy": 1.0, "adaptation_type": "none"},
    ]).execute()

    # Attempts Session 2 (Break trigger)
    admin.table("attempts").insert([
        {"session_id": s2["id"], "question_id": "00000000-0000-0000-0000-000000000004", "is_correct": True, "time_taken": 8.5, "attempt_number": 1, "stars_earned": 3, "silent_accuracy": 1.0, "adaptation_type": "none"},
        {"session_id": s2["id"], "question_id": "00000000-0000-0000-0000-000000000005", "is_correct": False, "time_taken": 14.0, "attempt_number": 2, "stars_earned": 0, "silent_accuracy": 0.0, "adaptation_type": "brain_break"},
        {"session_id": s2["id"], "question_id": "00000000-0000-0000-0000-000000000006", "is_correct": True, "time_taken": 5.5, "attempt_number": 1, "stars_earned": 3, "silent_accuracy": 1.0, "adaptation_type": "none"},
    ]).execute()

    # Attempts Session 3 (Rushing visual)
    admin.table("attempts").insert([
        {"session_id": s3["id"], "question_id": "00000000-0000-0000-0000-000000000007", "is_correct": False, "time_taken": 1.1, "attempt_number": 1, "stars_earned": 0, "silent_accuracy": 0.0, "adaptation_type": "rushing_visual"},
        {"session_id": s3["id"], "question_id": "00000000-0000-0000-0000-000000000008", "is_correct": True, "time_taken": 4.5, "attempt_number": 2, "stars_earned": 1, "silent_accuracy": 0.5, "adaptation_type": "none"},
        {"session_id": s3["id"], "question_id": "00000000-0000-0000-0000-000000000009", "is_correct": True, "time_taken": 5.0, "attempt_number": 1, "stars_earned": 3, "silent_accuracy": 1.0, "adaptation_type": "none"},
    ]).execute()

    # Game attempts
    admin.table("game_attempts").insert([
        {"session_id": s2["id"], "trigger": "break_offer", "choice": "game", "reason_codes": ["slow_vs_baseline"], "accepted": True, "completed": True, "resumed_lesson": True, "duration": 45},
        {"session_id": s1["id"], "trigger": "break_offer", "choice": "continue", "reason_codes": ["long_since_break"], "accepted": False, "completed": False, "resumed_lesson": True, "duration": 0},
    ]).execute()

    # Topic progress
    admin.table("topic_progress").upsert([
        {"child_id": child_id, "topic_id": t1["id"], "status": "mastered", "silent_accuracy_avg": 0.88, "stars_total": 24},
        {"child_id": child_id, "topic_id": t2["id"], "status": "needs_practice", "silent_accuracy_avg": 0.65, "stars_total": 18},
        {"child_id": child_id, "topic_id": t3["id"], "status": "mastered", "silent_accuracy_avg": 0.80, "stars_total": 22},
    ], on_conflict="child_id, topic_id").execute()

    # Insights
    admin.table("insights").insert([
        {"child_id": child_id, "session_id": s1["id"], "headline": "Strong Conceptual Mastery", "detail": "Alex demonstrated confident first-attempt retrieval accuracy (88%) on Plant Structures.", "created_at": date1},
        {"child_id": child_id, "session_id": s2["id"], "headline": "Healthy Rest Break Utilized", "detail": "Alex accepted a tactile mini-break when fatigue cues appeared, returning with renewed focus.", "created_at": date2},
        {"child_id": child_id, "session_id": s3["id"], "headline": "Pacing Awareness Prompted", "detail": "Tactile counting visuals helped Alex pause and review multi-step questions before tapping answers.", "created_at": date3},
    ]).execute()

    return {
        "success": True,
        "message": f"Demo history populated for {child['name']}!",
        "child_id": child_id,
        "topics_seeded": 3,
        "sessions_seeded": 3
    }
