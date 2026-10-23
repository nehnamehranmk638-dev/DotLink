from fastapi import Header, HTTPException, Depends, Request
from typing import Optional
from supabase import create_client, Client
from app.config import settings

def get_supabase_admin() -> Client:
    """Returns elevated Supabase service-role client for backend operations."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            status_code=500,
            detail="Supabase URL and Service Role Key must be configured."
        )
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

def get_supabase_anon() -> Client:
    """Returns anon client for user-level operations like login/signup."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

async def get_current_parent(
    request: Request,
    authorization: Optional[str] = Header(None)
) -> dict:
    """
    Extracts and verifies authenticated parent from Bearer token or cookie.
    Guarantees parent_id is valid and non-empty.
    """
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
    elif "dotlink_token" in request.cookies:
        token = request.cookies.get("dotlink_token")

    admin = get_supabase_admin()

    if token:
        try:
            # Verify JWT with Supabase Auth
            user_resp = admin.auth.get_user(token)
            if user_resp and user_resp.user:
                return {
                    "id": str(user_resp.user.id),
                    "email": user_resp.user.email,
                    "name": user_resp.user.user_metadata.get("full_name", user_resp.user.email.split("@")[0]),
                }
        except Exception as e:
            pass

    # In development, fallback to first existing profile or raise 401
    if settings.ENVIRONMENT == "development":
        profile_res = admin.table("profiles").select("*").limit(1).execute()
        if profile_res.data and len(profile_res.data) > 0:
            first_user = profile_res.data[0]
            return {
                "id": str(first_user["id"]),
                "email": first_user["email"],
                "name": first_user["name"],
            }

    raise HTTPException(status_code=401, detail="Authentication required. Please log in.")

async def assert_owns_child(child_id: str, parent: dict = Depends(get_current_parent)) -> dict:
    """Ensures child belongs to the authenticated parent."""
    admin = get_supabase_admin()
    res = admin.table("children").select("*").eq("id", child_id).eq("parent_id", parent["id"]).single().execute()
    if not res.data:
        raise HTTPException(status_code=403, detail="Access denied: Child does not belong to your account.")
    return res.data

async def assert_owns_topic(topic_id: str, parent: dict = Depends(get_current_parent)) -> dict:
    """Ensures topic belongs to the authenticated parent via textbooks.parent_id."""
    admin = get_supabase_admin()
    res = admin.table("topics").select("*, textbooks!inner(parent_id)").eq("id", topic_id).eq("textbooks.parent_id", parent["id"]).single().execute()
    if not res.data:
        raise HTTPException(status_code=403, detail="Access denied: Topic not found or does not belong to your account.")
    return res.data

async def assert_owns_session(session_id: str, parent: dict = Depends(get_current_parent)) -> dict:
    """Ensures session belongs to a child owned by the parent."""
    admin = get_supabase_admin()
    res = admin.table("sessions").select("*, children!inner(parent_id)").eq("id", session_id).eq("children.parent_id", parent["id"]).single().execute()
    if not res.data:
        raise HTTPException(status_code=403, detail="Access denied: Session does not belong to your account.")
    return res.data
