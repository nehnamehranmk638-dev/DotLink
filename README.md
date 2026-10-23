# DotLink: Agentic NCERT Learning Platform

DotLink is a full-stack educational web application designed for parents and children. A parent signs up with mandatory consent, configures child profiles, selects official NCERT textbook chapters by Grade + Subject, and uses offline AI agents to generate:
1. **Interactive Animated Lessons** (CSS/SVG scene cards with Web Speech API narration and pulsing active-listening words)
2. **Bullet-Point Progressive Revision Sheets**
3. **Dual 10-Question Quizzes** (Set A Mastery Evaluation and Set B Retest)

During live learning, the app is **100% deterministic Python with ZERO LLM calls**:
- Anti-rushing button locks (2–3s)
- Hint -> Explanation answer ladder (+3 stars on first attempt, hint on 1st wrong, explanation + 1 participation star on 2nd wrong)
- Low engagement detection (dragging response times or rapid guessing triggering a 60s matching pair mini-game)
- Inactivity monitoring (60s idle -> "Are you still watching?" 30s countdown -> auto-pause + real-time parent SSE alert)
- 7/10 Mastery Gate (>= 7/10 pass with corrections, +10 bonus stars, and subsequent topic unlock vs < 7/10 Full Revision Module + Retest Set B)
- Parent analytics across 4 core metrics (Accuracy, Attention Span, Time Focused, Speed of Response) and deterministic Feedback Cards.

---

## Architecture & Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, Vite, Vanilla CSS (tokens, glassmorphism, responsive, no Tailwind), React Router v6, Chart.js (`react-chartjs-2`), Web SpeechSynthesis API, Server-Sent Events (`EventSource`) |
| **Backend** | FastAPI (Python 3.11+), Pydantic v2, pypdf, RapidFuzz, httpx, pytest, pytest-asyncio, uvicorn |
| **Database & Auth** | Supabase Postgres (with dual local async SQLite engine for offline/test environments), Supabase Auth (JWT), private Storage bucket |
| **LLM Services** | Groq API (`openai/gpt-oss-120b` for heavy lesson & quiz generation, `openai/gpt-oss-20b` for light chunking), with automated exponential backoff and fallback to Google Gemini (`gemini-2.0-flash`) |
| **Deployment** | Render web service specification (`render.yaml`). *Note: In-process SSE Pub/Sub operates on a single Render instance.* |

---

## Project Structure

```
dotlink/
├─ app/
│  ├─ main.py, config.py, deps.py, db.py # FastAPI setup, central config, JWT auth, ownership checks
│  ├─ routers/
│  │  ├─ auth.py, children.py
│  │  ├─ curriculum.py                   # NCERT fetch+chunk, generate, agent-steps, approve, review edits
│  │  ├─ play.py                         # session start/resume, revision sheet, quiz submit
│  │  ├─ adaptive.py                     # live question evaluation, highlight clicks, idle logging
│  │  └─ dashboard.py                    # analytics, deterministic feedback, SSE stream
│  ├─ agents/
│  │  ├─ loop.py                         # shared ~60-line tool-calling loop
│  │  ├─ ncert_agent.py                  # Agent 1: Fetch & Chunk
│  │  ├─ lesson_revision_agent.py        # Agent 2: Lesson + Revision
│  │  ├─ quiz_agent.py                   # Agent 3: Quiz & Retest
│  │  └─ tools.py                        # pypdf reader, calculator, grounding + reading-level checks
│  ├─ services/
│  │  ├─ llm.py                          # Groq 120b/20b + Gemini fallback wrapper
│  │  ├─ pdf_ncert.py                    # NCERT catalog lookup + pypdf extraction
│  │  ├─ adaptive_engine.py              # button-lock check, Hint->Explanation ladder, pop-up game trigger
│  │  ├─ mastery_gate.py                 # >=7/10 check, Revision Module unlock, Set B trigger
│  │  ├─ idle_monitor.py                 # idle event handling + SSE publish + heartbeat
│  │  ├─ analytics_engine.py             # Accuracy, Attention Span, Time Focused, Speed
│  │  └─ insights_rules.py               # deterministic feedback card (no LLM)
│  └─ models/schemas.py                  # all Pydantic v2 schemas (DB + agent outputs)
├─ frontend/                             # React + Vite + Vanilla CSS
│  └─ src/pages/
│     ├─ parent/                         # Login, Dashboard (Chart.js + SSE), Curriculum, CurriculumReview
│     └─ child/                          # StudentDashboard, AnimatedLessonPlayer, QuizView
├─ tests/                                # Full pytest test suite
│  ├─ test_agent_validators.py
│  ├─ test_v01_pipeline.py
│  ├─ test_v02_lesson_player.py
│  ├─ test_adaptive_engine.py
│  ├─ test_mastery_gate.py
│  ├─ test_v04_mastery_pipeline.py
│  └─ test_v05_idle_and_parent.py
├─ sql/
│  ├─ schema.sql                         # Supabase PostgreSQL schema
│  └─ seed_demo.sql                      # 2 weeks of realistic history for weekly analytics graphs
├─ render.yaml, requirements.txt, .env.example, pytest.ini
```

---

## Step-by-Step Local Setup & Run Guide

### 1. Prerequisites
- Python 3.11+
- Node.js v18+ and npm

### 2. Environment Configuration
Copy the template environment file:
```bash
cp .env.example .env
```
Fill in your credentials in `.env`:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-supabase-service-role-key
SUPABASE_JWT_SECRET=super-secret-dotlink-dev-jwt-key-minimum-32-chars-long
GROQ_API_KEY=your-groq-api-key
GEMINI_API_KEY=your-gemini-api-key
ENVIRONMENT=development
PORT=8000
FRONTEND_URL=http://localhost:5173
```
*(Note: If Groq or Gemini API keys are omitted, DotLink operates in offline mode using deterministic fallback content generation so all features and tests can be evaluated without third-party dependencies).*

### 3. Backend Setup & Run
Create and activate the virtual environment:
```bash
# Windows
python -m venv venv
.\venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

Install requirements:
```bash
pip install -r requirements.txt
```

Start the FastAPI server:
```bash
uvicorn app.main:app --reload --port 8000
```
Backend API will be running at `http://localhost:8000`. Interactive docs are available at `http://localhost:8000/docs`.

### 4. Frontend Setup & Run
In a separate terminal window:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

### 5. Supabase Setup
- Run the SQL statements in `sql/schema.sql` inside the Supabase SQL editor to create all 12 tables, indexes, and constraints.
- To seed 2 weeks of realistic child learning history for the Parent Dashboard Chart.js graphs, run `sql/seed_demo.sql`.

---

## Running Automated Tests

Run the complete test suite across all 5 build milestones:
```bash
# Windows
.\venv\Scripts\pytest

# macOS / Linux
pytest
```

Run specific test modules:
```bash
pytest tests/test_agent_validators.py      # Schema & Tool validation tests
pytest tests/test_adaptive_engine.py       # Deterministic ladder & engagement tests
pytest tests/test_mastery_gate.py          # 7/10 mastery gate tests
pytest tests/test_v01_pipeline.py          # Phase 1 integration tests
pytest tests/test_v02_lesson_player.py     # Phase 2 lesson player & resume tests
pytest tests/test_v04_mastery_pipeline.py  # Phase 4 quiz submission & retest tests
pytest tests/test_v05_idle_and_parent.py   # Phase 5 inactivity, SSE alert, & analytics tests
```

---

## Tunable Numbers in `app/config.py`
All locks, timeouts, and thresholds are centralized in `app/config.py`:
- `LOCK_SECONDS_QUESTION = 3.0`: Anti-rushing lock when a question appears
- `LOCK_SECONDS_RETRY = 2.0`: Anti-rushing lock on retry after wrong answer
- `EXPECTED_TIME_BASE = 4.0`: Base reading seconds
- `EXPECTED_TIME_PER_WORD = 0.35`: Additional seconds per word of question + options
- `TIME_RATIO_LOW_ENGAGEMENT = 1.5`: `time_taken / expected_time > 1.5` triggers 60s mini-game
- `RAPID_GUESS_THRESHOLD_SECONDS = 1.5`: Threshold for rapid wrong guessing
- `MINI_GAME_COOLDOWN_SECONDS = 300`: 5-minute cooldown between pop-up mini-games
- `IDLE_INACTIVITY_TIMEOUT_SECONDS = 60`: Triggers "Are you still watching?"
- `IDLE_COUNTDOWN_TIMEOUT_SECONDS = 30`: Auto-pauses session if unanswered
- `STARS_CORRECT_FIRST_TRY = 3`: Stars for 1st attempt correct answer
- `STARS_PARTICIPATION_SECOND_WRONG = 1`: Participation star on 2nd wrong answer
- `STARS_MASTERY_BONUS = 10`: Bonus stars on >= 7/10 mastery pass
- `MASTERY_PASS_SCORE = 7`: Pass threshold out of 10

---

## Render Deployment (`render.yaml`)
DotLink is preconfigured for deployment on Render via `render.yaml`.
> **Note:** The real-time SSE stream (`/api/live/{child_id}`) uses an in-process `asyncio` Pub/Sub queue, which operates on a single Render web service instance.
