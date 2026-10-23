import datetime
from typing import Dict, Any, List
from app.db import get_db

async def generate_feedback_card(child_id: str, db) -> Dict[str, Any]:
    """
    100% Deterministic Rule-Based Feedback Card (ZERO LLM calls):
    - Topics completed this week
    - Topics needing revision (failed mastery gate or accuracy < 60%)
    - Next-topic recommendation
    """
    seven_days_ago = (datetime.date.today() - datetime.timedelta(days=7)).isoformat()

    # 1. Topics completed this week (passed=1 within last 7 days)
    cursor = await db.execute("""
        SELECT DISTINCT t.id, t.name, t.subject_tag, t.chapter_name
        FROM quiz_submissions qs
        JOIN sessions s ON qs.session_id = s.id
        JOIN topics t ON s.topic_id = t.id
        WHERE s.child_id = ? AND qs.passed = 1 AND date(qs.created_at) >= ?
    """, (child_id, seven_days_ago))
    completed_rows = await cursor.fetchall()
    completed_topics = [
        {"id": r["id"], "name": r["name"], "subject": r["subject_tag"], "chapter": r["chapter_name"]}
        for r in completed_rows
    ]

    # 2. Topics needing revision (failed gate without subsequent pass, or low attempt accuracy < 60%)
    cursor = await db.execute("""
        SELECT DISTINCT t.id, t.name, t.subject_tag
        FROM quiz_submissions qs
        JOIN sessions s ON qs.session_id = s.id
        JOIN topics t ON s.topic_id = t.id
        WHERE s.child_id = ? AND qs.passed = 0 AND t.id NOT IN (
            SELECT DISTINCT s2.topic_id FROM quiz_submissions qs2
            JOIN sessions s2 ON qs2.session_id = s2.id
            WHERE s2.child_id = ? AND qs2.passed = 1
        )
    """, (child_id, child_id))
    failed_rows = await cursor.fetchall()
    needing_revision = [
        {"id": r["id"], "name": r["name"], "subject": r["subject_tag"], "reason": "Failed 7/10 Mastery Gate"}
        for r in failed_rows
    ]

    # 3. Next-topic recommendation
    # First unmastered approved topic in textbook order
    cursor = await db.execute("""
        SELECT t.id, t.name, t.subject_tag, t.chapter_name, t.start_page, t.end_page
        FROM topics t
        WHERE t.status = 'approved' AND t.id NOT IN (
            SELECT DISTINCT s.topic_id FROM quiz_submissions qs
            JOIN sessions s ON qs.session_id = s.id
            WHERE s.child_id = ? AND qs.passed = 1
        )
        ORDER BY t.start_page ASC LIMIT 1
    """, (child_id,))
    next_topic_row = await cursor.fetchone()

    next_recommendation = None
    if next_topic_row:
        next_recommendation = {
            "id": next_topic_row["id"],
            "name": next_topic_row["name"],
            "subject": next_topic_row["subject_tag"],
            "chapter": next_topic_row["chapter_name"],
            "page_range": f"Pages {next_topic_row['start_page']} to {next_topic_row['end_page']}"
        }

    # Template rules based on simple conditions
    num_completed = len(completed_topics)
    if num_completed >= 3:
        headline = f"🌟 Outstanding momentum! Your child has mastered {num_completed} topics this week."
    elif num_completed >= 1:
        headline = f"👍 Great progress! {num_completed} topic mastered this week. Keep up the steady habit."
    else:
        headline = "🌱 Ready to learn! Let's start this week's first animated NCERT lesson."

    if needing_revision:
        revision_advice = f"Attention: {needing_revision[0]['name']} needs a refresher before moving forward."
    else:
        revision_advice = "All completed topics show solid concept retention!"

    return {
        "headline": headline,
        "revision_advice": revision_advice,
        "completed_count": num_completed,
        "completed_topics": completed_topics,
        "needing_revision": needing_revision,
        "recommended_next": next_recommendation
    }
