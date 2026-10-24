import os
import json
import uuid
import datetime
from typing import Dict, Any, List, Optional
import aiosqlite
from app.config import settings

DB_FILE = os.path.join(settings.BASE_DIR, "dotlink.db")

async def get_db():
    db = await aiosqlite.connect(DB_FILE, timeout=30.0)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode = WAL;")
    await db.execute("PRAGMA busy_timeout = 10000;")
    await db.execute("PRAGMA foreign_keys = ON;")
    return db

async def init_db():
    os.makedirs(settings.STORAGE_LOCAL_DIR, exist_ok=True)
    db = await get_db()
    try:
        # Create tables matching sql/schema.sql
        await db.execute("""
        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT,
            consent_given INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """)

        await db.execute("""
        CREATE TABLE IF NOT EXISTS children (
            id TEXT PRIMARY KEY,
            parent_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            age INTEGER NOT NULL,
            grade INTEGER NOT NULL,
            mascot_name TEXT NOT NULL,
            total_stars INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """)

        await db.execute("""
        CREATE TABLE IF NOT EXISTS textbooks (
            id TEXT PRIMARY KEY,
            parent_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            grade INTEGER NOT NULL,
            subject_tag TEXT NOT NULL,
            title TEXT NOT NULL,
            ncert_code TEXT NOT NULL,
            storage_path TEXT,
            page_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """)

        await db.execute("""
        CREATE TABLE IF NOT EXISTS topics (
            id TEXT PRIMARY KEY,
            textbook_id TEXT NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
            chapter_number INTEGER NOT NULL DEFAULT 1,
            chapter_title TEXT,
            chapter_name TEXT NOT NULL,
            topic_number INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL,
            description TEXT,
            subject_tag TEXT NOT NULL,
            start_page INTEGER NOT NULL,
            end_page INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'chunked',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """)

        await db.execute("""
        CREATE TABLE IF NOT EXISTS source_pages (
            id TEXT PRIMARY KEY,
            textbook_id TEXT NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
            topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
            page_number INTEGER NOT NULL,
            text TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """)

        await db.execute("""
        CREATE TABLE IF NOT EXISTS lesson_bundles (
            id TEXT PRIMARY KEY,
            topic_id TEXT NOT NULL UNIQUE REFERENCES topics(id) ON DELETE CASCADE,
            scenes_json TEXT NOT NULL DEFAULT '[]',
            revision_bullets_json TEXT NOT NULL DEFAULT '[]',
            mini_game_config TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'draft',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """)

        await db.execute("""
        CREATE TABLE IF NOT EXISTS questions (
            id TEXT PRIMARY KEY,
            topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
            question_type TEXT NOT NULL,
            question_data TEXT NOT NULL,
            correct_answer TEXT NOT NULL,
            hint_text TEXT NOT NULL,
            explanation_text TEXT NOT NULL,
            source_page INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            flagged INTEGER NOT NULL DEFAULT 0,
            flag_reason TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """)

        await db.execute("""
        CREATE TABLE IF NOT EXISTS agent_steps (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            topic_id TEXT REFERENCES topics(id) ON DELETE CASCADE,
            agent_name TEXT NOT NULL,
            step_num INTEGER NOT NULL,
            tool_name TEXT NOT NULL,
            args_json TEXT NOT NULL DEFAULT '{}',
            result_summary TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """)

        await db.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
            topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'active',
            last_scene_index INTEGER NOT NULL DEFAULT 0,
            unlocked_bullets_count INTEGER NOT NULL DEFAULT 0,
            active_focus_seconds INTEGER NOT NULL DEFAULT 0,
            started_at TEXT NOT NULL DEFAULT (datetime('now')),
            ended_at TEXT
        );
        """)

        await db.execute("""
        CREATE TABLE IF NOT EXISTS attempts (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
            attempt_number INTEGER NOT NULL,
            is_correct INTEGER NOT NULL,
            time_taken REAL NOT NULL,
            hint_shown INTEGER NOT NULL DEFAULT 0,
            explanation_shown INTEGER NOT NULL DEFAULT 0,
            pop_up_game_triggered INTEGER NOT NULL DEFAULT 0,
            stars_earned INTEGER NOT NULL DEFAULT 0,
            silent_accuracy INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """)

        await db.execute("""
        CREATE TABLE IF NOT EXISTS quiz_submissions (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            quiz_set TEXT NOT NULL,
            score_out_of_10 INTEGER NOT NULL,
            passed INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """)

        await db.execute("""
        CREATE TABLE IF NOT EXISTS idle_events (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            scene_or_question_id TEXT,
            prompted_at TEXT NOT NULL DEFAULT (datetime('now')),
            responded INTEGER NOT NULL,
            auto_paused_at TEXT
        );
        """)

        # Ensure hierarchical columns exist on topics table for existing databases
        cursor = await db.execute("PRAGMA table_info(topics);")
        topic_cols = [r["name"] for r in await cursor.fetchall()]
        if "chapter_number" not in topic_cols:
            await db.execute("ALTER TABLE topics ADD COLUMN chapter_number INTEGER NOT NULL DEFAULT 1;")
        if "chapter_title" not in topic_cols:
            await db.execute("ALTER TABLE topics ADD COLUMN chapter_title TEXT;")
        if "topic_number" not in topic_cols:
            await db.execute("ALTER TABLE topics ADD COLUMN topic_number INTEGER NOT NULL DEFAULT 1;")
        if "description" not in topic_cols:
            await db.execute("ALTER TABLE topics ADD COLUMN description TEXT;")

        await db.commit()
    finally:
        await db.close()
