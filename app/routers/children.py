import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from app.db import get_db
from app.deps import get_current_parent
from app.models.schemas import ChildCreateRequest, ChildOut

router = APIRouter(prefix="/children", tags=["children"])

@router.post("", response_model=ChildOut)
async def create_child(
    req: ChildCreateRequest,
    parent: dict = Depends(get_current_parent)
):
    child_id = str(uuid.uuid4())
    db = await get_db()
    try:
        await db.execute("""
            INSERT INTO children (id, parent_id, name, age, grade, mascot_name, total_stars)
            VALUES (?, ?, ?, ?, ?, ?, 0)
        """, (child_id, parent["id"], req.name, req.age, req.grade, req.mascot_name))
        await db.commit()

        cursor = await db.execute("SELECT * FROM children WHERE id = ?", (child_id,))
        row = await cursor.fetchone()
        return ChildOut(
            id=row["id"],
            parent_id=row["parent_id"],
            name=row["name"],
            age=row["age"],
            grade=row["grade"],
            mascot_name=row["mascot_name"],
            total_stars=row["total_stars"],
            created_at=str(row["created_at"])
        )
    finally:
        await db.close()

@router.get("", response_model=List[ChildOut])
async def list_children(
    parent: dict = Depends(get_current_parent)
):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM children WHERE parent_id = ? ORDER BY created_at ASC",
            (parent["id"],)
        )
        rows = await cursor.fetchall()
        return [
            ChildOut(
                id=r["id"],
                parent_id=r["parent_id"],
                name=r["name"],
                age=r["age"],
                grade=r["grade"],
                mascot_name=r["mascot_name"],
                total_stars=r["total_stars"],
                created_at=str(r["created_at"])
            )
            for r in rows
        ]
    finally:
        await db.close()
