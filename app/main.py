import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import init_db
from app.routers.auth import router as auth_router
from app.routers.children import router as children_router
from app.routers.curriculum import router as curriculum_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database and ensure tables exist
    await init_db()
    yield

app = FastAPI(
    title="DotLink API",
    description="Agentic NCERT Learning Platform for Parents and Children",
    version="0.1.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include core routers
app.include_router(auth_router)
app.include_router(children_router)
app.include_router(curriculum_router)

@app.get("/health", tags=["system"])
async def health_check():
    return {
        "status": "healthy",
        "service": "DotLink API",
        "version": "0.1.0",
        "environment": settings.ENVIRONMENT
    }
