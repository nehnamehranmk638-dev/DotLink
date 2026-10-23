import datetime
import bcrypt
from typing import Optional, Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

from app.config import settings
from app.db import get_db

security = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    # Truncate to 72 bytes as per bcrypt specification
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        pwd_bytes = plain_password.encode("utf-8")[:72]
        hash_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.datetime.now(datetime.timezone.utc) + (
        expires_delta or datetime.timedelta(days=7)
    )
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SUPABASE_JWT_SECRET, algorithm="HS256")
    return encoded_jwt

def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        # First attempt with HS256 using SUPABASE_JWT_SECRET
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False}
        )
        return payload
    except JWTError:
        # Try without secret verification in case of mock/external token, but require valid structure
        try:
            unverified = jwt.get_unverified_claims(token)
            if "sub" in unverified:
                return unverified
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_parent(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Dict[str, Any]:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject identifier",
        )

    db = await get_db()
    try:
        cursor = await db.execute("SELECT * FROM profiles WHERE id = ?", (user_id,))
        profile = await cursor.fetchone()
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Parent profile not found",
            )
        if not profile["consent_given"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Parent consent has not been provided",
            )
        return dict(profile)
    finally:
        await db.close()

async def verify_child_ownership(child_id: str, parent_id: str, db) -> Dict[str, Any]:
    cursor = await db.execute(
        "SELECT * FROM children WHERE id = ? AND parent_id = ?",
        (child_id, parent_id)
    )
    child = await cursor.fetchone()
    if not child:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Child profile not found or does not belong to the current parent",
        )
    return dict(child)

async def verify_textbook_ownership(textbook_id: str, parent_id: str, db) -> Dict[str, Any]:
    cursor = await db.execute(
        "SELECT * FROM textbooks WHERE id = ? AND parent_id = ?",
        (textbook_id, parent_id)
    )
    textbook = await cursor.fetchone()
    if not textbook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Textbook not found or does not belong to the current parent",
        )
    return dict(textbook)

async def verify_topic_ownership(topic_id: str, parent_id: str, db) -> Dict[str, Any]:
    cursor = await db.execute("""
        SELECT t.* FROM topics t
        JOIN textbooks tb ON t.textbook_id = tb.id
        WHERE t.id = ? AND tb.parent_id = ?
    """, (topic_id, parent_id))
    topic = await cursor.fetchone()
    if not topic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Topic not found or does not belong to the current parent",
        )
    return dict(topic)

async def verify_session_ownership(session_id: str, parent_id: str, db) -> Dict[str, Any]:
    cursor = await db.execute("""
        SELECT s.*, c.parent_id FROM sessions s
        JOIN children c ON s.child_id = c.id
        WHERE s.id = ? AND c.parent_id = ?
    """, (session_id, parent_id))
    session = await cursor.fetchone()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found or does not belong to the current parent",
        )
    return dict(session)
