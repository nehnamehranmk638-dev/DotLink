from fastapi import APIRouter, HTTPException, Depends
from app.models.schemas import CoachChatRequest, CoachChatResponse
from app.deps import get_current_parent, assert_owns_child
from app.agents.coach_agent import ask_parent_coach

router = APIRouter(prefix="/api/coach", tags=["coach"])

@router.post("/chat", response_model=CoachChatResponse)
async def coach_chat(
    req: CoachChatRequest,
    child: dict = Depends(assert_owns_child)
):
    """
    Coach Agent Q&A answering parent queries grounded in session history.
    """
    result = await ask_parent_coach(
        child_id=req.child_id,
        user_query=req.message
    )

    return CoachChatResponse(
        reply=result.reply,
        headline=result.headline,
        suggested_step=result.suggested_step
    )
