from fastapi import APIRouter, HTTPException, Depends, Response
from app.models.schemas import SignupRequest, LoginRequest, AuthResponse
from app.deps import get_supabase_admin, get_supabase_anon, get_current_parent

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/signup", response_model=AuthResponse)
async def signup(req: SignupRequest, response: Response):
    admin = get_supabase_admin()
    try:
        # Create user via Supabase admin with confirmed email
        auth_res = admin.auth.admin.create_user({
            "email": req.email,
            "password": req.password,
            "email_confirm": True,
            "user_metadata": {
                "full_name": req.name,
                "consent_given": req.consent_given
            }
        })
        user = auth_res.user
        if not user:
            raise HTTPException(status_code=400, detail="Failed to create user.")

        # Ensure profiles row is present
        admin.table("profiles").upsert({
            "id": str(user.id),
            "name": req.name,
            "email": req.email,
            "consent_given": req.consent_given
        }).execute()

        # Sign in immediately to acquire access token
        anon = get_supabase_anon()
        login_res = anon.auth.sign_in_with_password({
            "email": req.email,
            "password": req.password
        })

        token = login_res.session.access_token if login_res.session else "demo-token"
        response.set_cookie(key="dotlink_token", value=token, httponly=True, samesite="lax")

        return AuthResponse(
            user_id=str(user.id),
            email=req.email,
            name=req.name,
            token=token
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/login", response_model=AuthResponse)
async def login(req: LoginRequest, response: Response):
    anon = get_supabase_anon()
    try:
        login_res = anon.auth.sign_in_with_password({
            "email": req.email,
            "password": req.password
        })
        if not login_res.user or not login_res.session:
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        token = login_res.session.access_token
        response.set_cookie(key="dotlink_token", value=token, httponly=True, samesite="lax")

        name = login_res.user.user_metadata.get("full_name", req.email.split("@")[0])
        return AuthResponse(
            user_id=str(login_res.user.id),
            email=req.email,
            name=name,
            token=token
        )
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Login failed: {str(e)}")

@router.get("/me")
async def get_me(parent: dict = Depends(get_current_parent)):
    return {"parent": parent}
