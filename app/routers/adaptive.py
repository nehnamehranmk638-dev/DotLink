from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import AdaptiveAnswerRequest, AdaptiveDecisionResult
from app.deps import get_current_parent, get_supabase_admin, assert_owns_session
from app.services.adaptive import decide

router = APIRouter(prefix="/api/adaptive", tags=["adaptive"])

@router.post("/answer")
async def process_adaptive_answer(
    req: AdaptiveAnswerRequest,
    session: dict = Depends(assert_owns_session)
):
    """
    Evaluates child's answer using the 100% deterministic adaptive rule engine.
    Silent accuracy is logged strictly server-side and never exposed to the child.
    """
    admin = get_supabase_admin()

    # 1. Fetch question and check correctness server-side
    q_res = admin.table("questions").select("correct_answer").eq("id", req.question_id).single().execute()
    if not q_res.data:
        raise HTTPException(status_code=404, detail="Question not found.")

    correct_answer = q_res.data["correct_answer"].strip().lower()
    user_answer = req.answer.strip().lower()
    is_correct = (correct_answer == user_answer)

    # 2. Fetch prior attempts in this session
    prior_res = admin.table("attempts").select("time_taken, is_correct, attempt_number").eq("session_id", req.session_id).execute()
    prior_attempts = prior_res.data or []

    # 3. Deterministic decision engine (§9)
    decision: AdaptiveDecisionResult = decide(
        is_correct=is_correct,
        attempt_number=req.attempt_number,
        time_taken=req.time_taken,
        prior_attempts=prior_attempts
    )

    # 4. Record attempt in database
    admin.table("attempts").insert({
        "session_id": req.session_id,
        "question_id": req.question_id,
        "is_correct": is_correct,
        "time_taken": req.time_taken,
        "attempt_number": req.attempt_number,
        "stars_earned": decision.stars_earned,
        "silent_accuracy": decision.silent_accuracy,
        "adaptation_type": decision.adaptation_type
    }).execute()

    # Return child-facing payload (silent_accuracy is omitted for child protection)
    return {
        "is_correct": decision.is_correct,
        "next_action": decision.next_action,
        "mascot_state": decision.mascot_state,
        "stars_earned": decision.stars_earned,
        "adaptation_type": decision.adaptation_type
    }
