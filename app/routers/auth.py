import uuid
from fastapi import APIRouter, HTTPException, status
from app.db import get_db
from app.deps import hash_password, verify_password, create_access_token
from app.models.schemas import ParentSignupRequest, ParentLoginRequest, AuthTokenResponse, ProfileOut

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/signup", response_model=AuthTokenResponse)
async def signup(req: ParentSignupRequest):
    if not req.consent_given:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Parent consent must be provided to sign up."
        )

    db = await get_db()
    try:
        cursor = await db.execute("SELECT id FROM profiles WHERE email = ?", (req.email.lower(),))
        existing = await cursor.fetchone()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email already exists."
            )

        user_id = str(uuid.uuid4())
        pwd_hash = hash_password(req.password)
        await db.execute("""
            INSERT INTO profiles (id, name, email, password_hash, consent_given)
            VALUES (?, ?, ?, ?, 1)
        """, (user_id, req.name, req.email.lower(), pwd_hash))
        await db.commit()

        cursor = await db.execute("SELECT * FROM profiles WHERE id = ?", (user_id,))
        row = await cursor.fetchone()

        profile = ProfileOut(
            id=row["id"],
            name=row["name"],
            email=row["email"],
            consent_given=bool(row["consent_given"]),
            created_at=str(row["created_at"])
        )
        token = create_access_token({"sub": user_id, "name": req.name})
        return AuthTokenResponse(access_token=token, token_type="bearer", user=profile)
    finally:
        await db.close()

@router.post("/login", response_model=AuthTokenResponse)
async def login(req: ParentLoginRequest):
    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM profiles WHERE email = ?", (req.email.lower(),))
        user = await cursor.fetchone()
        if not user or not user["password_hash"]:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password."
            )

        if not verify_password(req.password, user["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password."
            )

        if not user["consent_given"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Parent consent is required."
            )

        profile = ProfileOut(
            id=user["id"],
            name=user["name"],
            email=user["email"],
            consent_given=bool(user["consent_given"]),
            created_at=str(user["created_at"])
        )
        token = create_access_token({"sub": user["id"], "name": user["name"]})
        return AuthTokenResponse(access_token=token, token_type="bearer", user=profile)
    finally:
        await db.close()
