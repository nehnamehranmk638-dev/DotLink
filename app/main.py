import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.config import settings
from app.routers import auth, children, topics, sessions, adaptive, coach, live, admin

app = FastAPI(
    title="DotLink API",
    description="FastAPI Backend + Groq AI Agents + Deterministic Adaptive Engine for DotLink",
    version="0.1.0"
)

# CORS middleware for development and Render production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(children.router)
app.include_router(topics.router)
app.include_router(sessions.router)
app.include_router(adaptive.router)
app.include_router(coach.router)
app.include_router(live.router)
app.include_router(admin.router)

@app.get("/health")
async def health_check():
    """Render health check endpoint."""
    return {
        "status": "healthy",
        "service": "DotLink FastAPI",
        "llm_provider": settings.LLM_PROVIDER,
        "environment": settings.ENVIRONMENT
    }

# Mount static build of React Vite frontend or standalone static app
dist_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend", "dist")
static_dir = os.path.join(os.path.dirname(__file__), "static")

if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def serve_root():
    if os.path.exists(os.path.join(dist_dir, "index.html")):
        return FileResponse(os.path.join(dist_dir, "index.html"))
    if os.path.exists(os.path.join(static_dir, "index.html")):
        return FileResponse(os.path.join(static_dir, "index.html"))
    return {"message": "DotLink FastAPI is running. Frontend static files not found."}

@app.get("/{full_path:path}")
async def serve_react_app(full_path: str):
    if full_path.startswith("api") or full_path.startswith("auth") or full_path in ["docs", "openapi.json", "health", "topics", "children", "sessions", "textbooks"]:
        return None
    if os.path.exists(os.path.join(dist_dir, full_path)) and os.path.isfile(os.path.join(dist_dir, full_path)):
        return FileResponse(os.path.join(dist_dir, full_path))
    if os.path.exists(os.path.join(static_dir, "index.html")):
        return FileResponse(os.path.join(static_dir, "index.html"))
    return {"message": "Not found"}
