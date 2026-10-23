-- ==============================================================================
-- DotLink Database Schema (FastAPI + Groq + Agents + Supabase)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  consent_given boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. CHILDREN (Strict: No diagnosis field)
CREATE TABLE IF NOT EXISTS public.children (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  age integer NOT NULL CHECK (age >= 4 AND age <= 18),
  grade integer NOT NULL CHECK (grade >= 1 AND grade <= 12),
  mascot_name text NOT NULL DEFAULT 'Pip the Fox',
  games_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. TEXTBOOKS
CREATE TABLE IF NOT EXISTS public.textbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  storage_path text NOT NULL,
  page_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. TOPICS
CREATE TABLE IF NOT EXISTS public.topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  textbook_id uuid NOT NULL REFERENCES public.textbooks(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT 'General',
  name text NOT NULL,
  chapter_tag text NOT NULL DEFAULT 'Chapter',
  start_page integer NOT NULL,
  end_page integer NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('uploading','processing','needs_review','approved','failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. SOURCE_PAGES (Parent-only grounded textbook text)
CREATE TABLE IF NOT EXISTS public.source_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(topic_id, page_number)
);

-- 6. QUESTIONS
CREATE TABLE IF NOT EXISTS public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  question_data jsonb NOT NULL,
  correct_answer text NOT NULL,
  difficulty text NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  source text NOT NULL DEFAULT 'auto' CHECK (source IN ('uploaded','auto')),
  source_page integer NOT NULL,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. AGENT RUNS & AGENT STEPS (Traceable agent reasoning loop)
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL, -- 'content_agent', 'coach_agent', 'tutor_agent'
  topic_id uuid REFERENCES public.topics(id) ON DELETE CASCADE,
  session_id uuid,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  step integer NOT NULL,
  tool text NOT NULL,
  args jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  thought text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. SESSIONS
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended','abandoned')),
  last_position jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 9. ATTEMPTS (Strict: silent accuracy is parent-only, never visible to child)
CREATE TABLE IF NOT EXISTS public.attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  is_correct boolean NOT NULL,
  time_taken numeric NOT NULL DEFAULT 0.0,
  idle_time numeric NOT NULL DEFAULT 0.0,
  hint_used boolean NOT NULL DEFAULT false,
  attempt_number integer NOT NULL DEFAULT 1,
  stars_earned integer NOT NULL DEFAULT 0,
  silent_accuracy numeric NOT NULL DEFAULT 0.0,
  adaptation_type text NOT NULL DEFAULT 'none' CHECK (adaptation_type IN ('brain_break','rushing_visual','reteach','none')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. IDLE_EVENTS (Attention ladder logging)
CREATE TABLE IF NOT EXISTS public.idle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL,
  duration numeric NOT NULL DEFAULT 0.0,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11. TOPIC_PROGRESS
CREATE TABLE IF NOT EXISTS public.topic_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','learning','needs_practice','mastered')),
  silent_accuracy_avg numeric NOT NULL DEFAULT 0.0,
  stars_total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(child_id, topic_id)
);

-- 12. INSIGHTS (Parent-only non-diagnostic feedback)
CREATE TABLE IF NOT EXISTS public.insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  headline text NOT NULL,
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 13. LESSON_SCRIPTS (Pip's mascot dialogue scenes)
CREATE TABLE IF NOT EXISTS public.lesson_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  script_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved')),
  generated_at timestamptz NOT NULL DEFAULT now()
);

-- 14. TOPIC_GAMES & GAME_ATTEMPTS
CREATE TABLE IF NOT EXISTS public.topic_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  game_type text NOT NULL CHECK (game_type IN ('match_pairs','sort_basket','order_steps','quiz_ladder','crossword')),
  content_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.game_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  topic_game_id uuid REFERENCES public.topic_games(id) ON DELETE SET NULL,
  trigger text NOT NULL CHECK (trigger IN ('break_offer','learning_mode','game_zone')),
  choice text NOT NULL CHECK (choice IN ('continue','game','rest')),
  reason_codes text[] DEFAULT ARRAY[]::text[],
  shadow boolean NOT NULL DEFAULT false,
  accepted boolean NOT NULL DEFAULT false,
  completed boolean NOT NULL DEFAULT false,
  resumed_lesson boolean NOT NULL DEFAULT false,
  duration numeric DEFAULT 0.0,
  started_at timestamptz NOT NULL DEFAULT now()
);

-- 15. REWARD_ITEMS & CHILD_REWARDS
CREATE TABLE IF NOT EXISTS public.reward_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('mini_game','mascot_item','mascot_skin')),
  name text NOT NULL,
  star_cost integer NOT NULL DEFAULT 10,
  asset_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.child_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  reward_item_id uuid NOT NULL REFERENCES public.reward_items(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  used boolean NOT NULL DEFAULT false
);

-- Seed 5 starter reward items
INSERT INTO public.reward_items (id, type, name, star_cost, asset_ref) VALUES
  ('11111111-1111-1111-1111-111111111111', 'mascot_item', 'Detective Cap for Pip', 15, 'cap_detective'),
  ('22222222-2222-2222-2222-222222222222', 'mascot_item', 'Starry Scarf', 25, 'scarf_starry'),
  ('33333333-3333-3333-3333-333333333333', 'mascot_skin', 'Emerald Forest Pip', 35, 'skin_emerald'),
  ('44444444-4444-4444-4444-444444444444', 'mascot_skin', 'Sunset Glow Pip', 50, 'skin_sunset'),
  ('55555555-5555-5555-5555-555555555555', 'mini_game', 'Bonus Bubble Match', 40, 'game_bubble_match')
ON CONFLICT (id) DO NOTHING;

-- Trigger creating profiles on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, consent_given)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    COALESCE((new.raw_user_meta_data->>'consent_given')::boolean, true)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
