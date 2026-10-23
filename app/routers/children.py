from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
from app.models.schemas import CreateChildRequest
from app.deps import get_current_parent, get_supabase_admin

router = APIRouter(prefix="/children", tags=["children"])

@router.get("")
async def list_children(parent: dict = Depends(get_current_parent)) -> List[Dict[str, Any]]:
    admin = get_supabase_admin()
    res = admin.table("children").select("*").eq("parent_id", parent["id"]).order("created_at").execute()
    return res.data or []

@router.post("")
async def create_child(req: CreateChildRequest, parent: dict = Depends(get_current_parent)) -> Dict[str, Any]:
    admin = get_supabase_admin()
    res = admin.table("children").insert({
        "parent_id": parent["id"],
        "name": req.name,
        "age": req.age,
        "grade": req.grade,
        "mascot_name": req.mascot_name,
        "games_enabled": req.games_enabled
    }).execute()

    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create child profile.")

    return res.data[0]
