import json
import uuid
import time
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from app.db import get_db
from app.deps import get_current_parent
from app.models.schemas import AdaptiveInteractRequest, AdaptiveInteractResponse
from app.services.remediation import build_remediation
from app.config import settings
from app.services.adaptive_engine import (
    calculate_expected_time,
    validate_response_time,
    evaluate_low_engagement,
    evaluate_answer_ladder
)

router = APIRouter(prefix="/api/adaptive", tags=["adaptive"])

# In-memory tracking for session mini-game cooldowns and rapid guess streaks
_session_game_timestamps: Dict[str, float] = {}
_session_rapid_guesses: Dict[str, int] = {}

@router.post("/interact", response_model=AdaptiveInteractResponse)
async def adaptive_interact(
    req: AdaptiveInteractRequest,
    parent: dict = Depends(get_current_parent)
):
    """
    Live adaptive interaction evaluation (100% deterministic, ZERO LLM calls).
    Handles:
    1. Highlighted active-listening word clicks -> unlocks next progressive revision bullet in order.
    2. Mid-video or quiz question answers -> anti-rushing lock validation, hint->explanation ladder, low-engagement mini-game triggers.
    """
    db = await get_db()
    try:
        # Fetch session
        cursor = await db.execute("""
            SELECT s.*, c.parent_id, c.id as child_id, c.total_stars
            FROM sessions s
            JOIN children c ON s.child_id = c.id
            WHERE s.id = ?
        """, (req.session_id,))
        session = await cursor.fetchone()
        if not session or session["parent_id"] != parent["id"]:
            raise HTTPException(status_code=404, detail="Session not found or unauthorized")

        # Fetch lesson bundle for topic bullets & mini-game config
        cursor = await db.execute("SELECT * FROM lesson_bundles WHERE topic_id = ?", (session["topic_id"],))
        bundle = await cursor.fetchone()
        all_bullets = json.loads(bundle["revision_bullets_json"]) if bundle else []
        mini_game_config = json.loads(bundle["mini_game_config"]) if bundle else {}

        # -------------------------------------------------------------
        # Branch 1: Highlighted Active-Listening Word Click
        # -------------------------------------------------------------
        if req.interaction_type == "highlight_click":
            curr_unlocked = session["unlocked_bullets_count"]
            unlocked_bullet = None

            if curr_unlocked < len(all_bullets):
                new_count = curr_unlocked + 1
                unlocked_bullet = all_bullets[curr_unlocked]
                await db.execute("""
                    UPDATE sessions SET unlocked_bullets_count = ? WHERE id = ?
                """, (new_count, req.session_id))
                await db.commit()

            return AdaptiveInteractResponse(
                status="success",
                unlocked_bullet=unlocked_bullet,
                stars_awarded=0,
                continue_lesson=True
            )

        # -------------------------------------------------------------
        # Branch 2: Question Answer Submission
        # -------------------------------------------------------------
        elif req.interaction_type == "answer_submit":
            if not req.question_id or req.selected_answer is None:
                raise HTTPException(status_code=400, detail="question_id and selected_answer required")

            # Validate response time
            try:
                time_taken = validate_response_time(req.time_taken)
            except ValueError as ve:
                raise HTTPException(status_code=400, detail=str(ve))

            # Fetch question
            cursor = await db.execute("SELECT * FROM questions WHERE id = ?", (req.question_id,))
            q = await cursor.fetchone()
            if not q or q["topic_id"] != session["topic_id"]:
                raise HTTPException(status_code=404, detail="Question not found")

            q_data = json.loads(q["question_data"])
            q_text = q_data.get("question_text", "")
            options = q_data.get("options", [])
            is_in_video = (q["question_type"] == "in_video")

            # The server derives the second unsuccessful attempt from persisted history.
            # Engagement refreshers cannot pre-empt the first-answer hint/retry.
            await db.execute("BEGIN IMMEDIATE")
            history_cursor = await db.execute("""
                SELECT COUNT(*) as count,
                       COALESCE(SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END), 0) as misses,
                       COALESCE(MAX(pop_up_game_triggered), 0) as remediated
                FROM attempts WHERE session_id = ? AND question_id = ?
            """, (req.session_id, req.question_id))
            history = await history_cursor.fetchone()

            # 1. Answer Ladder
            ladder_res = evaluate_answer_ladder(
                selected_answer=req.selected_answer,
                correct_answer=q["correct_answer"],
                attempt_number=history["count"] + 1,
                hint_text=q["hint_text"],
                explanation_text=q["explanation_text"],
                is_in_video=is_in_video
            )

            # 2. Low Engagement & Rapid Guess Detection
            expected_time = calculate_expected_time(q_text, options)
            last_game_ts = _session_game_timestamps.get(req.session_id)
            rapid_count = _session_rapid_guesses.get(req.session_id, 0)

            trigger_game, reason = evaluate_low_engagement(
                time_taken=time_taken,
                expected_time=expected_time,
                attempt_number=req.attempt_number,
                is_correct=ladder_res["is_correct"],
                recent_rapid_guesses=rapid_count,
                last_mini_game_timestamp=last_game_ts
            )

            trigger_game = (not ladder_res["is_correct"] and history["misses"] == 1
                            and not history["remediated"])
            correct_index = next((i for i, option in enumerate(options)
                                  if option.strip().casefold() == q["correct_answer"].strip().casefold()), None)

            # Update rapid guess counter
            if not ladder_res["is_correct"] and time_taken <= 1.5:
                _session_rapid_guesses[req.session_id] = rapid_count + 1
            else:
                _session_rapid_guesses[req.session_id] = 0

            if trigger_game:
                _session_game_timestamps[req.session_id] = time.time()
                _session_rapid_guesses[req.session_id] = 0

            # 3. Award Stars
            stars = ladder_res["stars_awarded"]
            if stars > 0:
                await db.execute("""
                    UPDATE children SET total_stars = total_stars + ? WHERE id = ?
                """, (stars, session["child_id"]))

            # 4. In-Video Unlock of Linked Bullet if correct on 1st try
            unlocked_bullet = None
            if is_in_video and ladder_res["is_correct"] and ladder_res["silent_accuracy"]:
                curr_unlocked = session["unlocked_bullets_count"]
                if curr_unlocked < len(all_bullets):
                    new_count = curr_unlocked + 1
                    unlocked_bullet = all_bullets[curr_unlocked]
                    await db.execute("""
                        UPDATE sessions SET unlocked_bullets_count = ? WHERE id = ?
                    """, (new_count, req.session_id))

            # 5. Record Attempt
            attempt_id = str(uuid.uuid4())
            await db.execute("""
                INSERT INTO attempts (id, session_id, question_id, attempt_number, is_correct, time_taken, hint_shown, explanation_shown, pop_up_game_triggered, stars_earned, silent_accuracy)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                attempt_id,
                req.session_id,
                req.question_id,
                req.attempt_number,
                1 if ladder_res["is_correct"] else 0,
                time_taken,
                1 if ladder_res["hint_shown"] else 0,
                1 if ladder_res["explanation_shown"] else 0,
                1 if trigger_game else 0,
                stars,
                1 if ladder_res["silent_accuracy"] else 0
            ))
            await db.commit()

            return AdaptiveInteractResponse(
                status="success",
                lesson_variant="simplified" if not ladder_res["is_correct"] or time_taken > expected_time * settings.TIME_RATIO_LOW_ENGAGEMENT else "short" if time_taken < expected_time and ladder_res["is_correct"] else "standard",
                result="breakdown" if trigger_game else "answer",
                remediation=build_remediation(q, q_data) if trigger_game else None,
                highlightOptionId=f"{req.question_id}-option-{correct_index}" if trigger_game and correct_index is not None else None,
                is_correct=ladder_res["is_correct"],
                hint_text=ladder_res["hint_text"],
                explanation_text=ladder_res["explanation_text"],
                stars_awarded=stars,
                unlocked_bullet=unlocked_bullet,
                trigger_mini_game=trigger_game,
                mini_game_config=mini_game_config if trigger_game else None,
                can_retry=ladder_res["can_retry"],
                continue_lesson=ladder_res["continue_lesson"]
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unknown interaction_type '{req.interaction_type}'")
    finally:
        await db.close()
