-- DotLink Supabase PostgreSQL Schema
-- Uses UUID primary keys, created_at defaults, cascading foreign keys, and indexes.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. profiles: id (= auth user id), name, email, consent_given (bool, must be true), created_at
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    consent_given BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. children: id, parent_id, name, age, grade, mascot_name, total_stars (default 0)
CREATE TABLE IF NOT EXISTS children (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    age INTEGER NOT NULL,
    grade INTEGER NOT NULL,
    mascot_name TEXT NOT NULL,
    total_stars INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_children_parent ON children(parent_id);

-- 3. textbooks: id, parent_id, grade, subject_tag, title, ncert_code, storage_path, page_count
CREATE TABLE IF NOT EXISTS textbooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    grade INTEGER NOT NULL,
    subject_tag TEXT NOT NULL,
    title TEXT NOT NULL,
    ncert_code TEXT NOT NULL,
    storage_path TEXT,
    page_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_textbooks_parent ON textbooks(parent_id);

-- 4. topics: id, textbook_id, chapter_name, name, subject_tag, start_page, end_page, status
-- status: 'chunked' -> 'generating' -> 'needs_review' -> 'approved'
CREATE TABLE IF NOT EXISTS topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    textbook_id UUID NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
    chapter_name TEXT NOT NULL,
    name TEXT NOT NULL,
    subject_tag TEXT NOT NULL,
    start_page INTEGER NOT NULL,
    end_page INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'chunked',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_topics_textbook ON topics(textbook_id);
CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);

-- 5. source_pages: id, textbook_id, topic_id (nullable, filled when chunked), page_number, text
-- Parent-only; never expose to child endpoints.
CREATE TABLE IF NOT EXISTS source_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    textbook_id UUID NOT NULL REFERENCES textbooks(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
    page_number INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_source_pages_textbook ON source_pages(textbook_id);
CREATE INDEX IF NOT EXISTS idx_source_pages_topic ON source_pages(topic_id);

-- 6. lesson_bundles: id, topic_id, scenes_json, revision_bullets_json, mini_game_config, status
CREATE TABLE IF NOT EXISTS lesson_bundles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic_id UUID NOT NULL UNIQUE REFERENCES topics(id) ON DELETE CASCADE,
    scenes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    revision_bullets_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    mini_game_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lesson_bundles_topic ON lesson_bundles(topic_id);

-- 7. questions: id, topic_id, question_type, question_data, correct_answer, hint_text, explanation_text, source_page, status, flagged, flag_reason
-- question_type: 'in_video' | 'quiz_a' | 'quiz_b'
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    question_type TEXT NOT NULL,
    question_data JSONB NOT NULL,
    correct_answer TEXT NOT NULL,
    hint_text TEXT NOT NULL,
    explanation_text TEXT NOT NULL,
    source_page INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    flagged BOOLEAN NOT NULL DEFAULT FALSE,
    flag_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_questions_topic_type ON questions(topic_id, question_type);

-- 8. agent_steps: id, run_id, topic_id, agent_name, step_num, tool_name, args_json, result_summary, created_at
CREATE TABLE IF NOT EXISTS agent_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL,
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    agent_name TEXT NOT NULL,
    step_num INTEGER NOT NULL,
    tool_name TEXT NOT NULL,
    args_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_summary TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON agent_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_steps_topic ON agent_steps(topic_id);

-- 9. sessions: id, child_id, topic_id, status, last_scene_index, unlocked_bullets_count, active_focus_seconds, started_at, ended_at
-- status: 'active' | 'paused' | 'completed'
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active',
    last_scene_index INTEGER NOT NULL DEFAULT 0,
    unlocked_bullets_count INTEGER NOT NULL DEFAULT 0,
    active_focus_seconds INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessions_child ON sessions(child_id);
CREATE INDEX IF NOT EXISTS idx_sessions_topic ON sessions(topic_id);

-- 10. attempts: id, session_id, question_id, attempt_number, is_correct, time_taken, hint_shown, explanation_shown, pop_up_game_triggered, stars_earned, silent_accuracy
CREATE TABLE IF NOT EXISTS attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    is_correct BOOLEAN NOT NULL,
    time_taken NUMERIC NOT NULL,
    hint_shown BOOLEAN NOT NULL DEFAULT FALSE,
    explanation_shown BOOLEAN NOT NULL DEFAULT FALSE,
    pop_up_game_triggered BOOLEAN NOT NULL DEFAULT FALSE,
    stars_earned INTEGER NOT NULL DEFAULT 0,
    silent_accuracy BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attempts_session ON attempts(session_id);
CREATE INDEX IF NOT EXISTS idx_attempts_question ON attempts(question_id);

-- 11. quiz_submissions: id, session_id, quiz_set ('quiz_a' | 'quiz_b'), score_out_of_10, passed, created_at
CREATE TABLE IF NOT EXISTS quiz_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    quiz_set TEXT NOT NULL,
    score_out_of_10 INTEGER NOT NULL,
    passed BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_session ON quiz_submissions(session_id);

-- 12. idle_events: id, session_id, scene_or_question_id, prompted_at, responded, auto_paused_at
CREATE TABLE IF NOT EXISTS idle_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    scene_or_question_id TEXT,
    prompted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded BOOLEAN NOT NULL,
    auto_paused_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_idle_events_session ON idle_events(session_id);
