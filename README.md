# DotLink: ADHD-Friendly Adaptive Study Companion

Built for Realm Hack'26.

> **Architecture:** FastAPI (Python 3.13) + Groq AI Agents + Supabase + React (Vite/CSS) + Render  
> **Pitch:** “AI agents prepare and explain. Rules decide. A parent approves.”

---

## 🌟 Key Features

1. **Designed with ADHD in Mind (Non-Diagnostic)**:
   - Zero countdown clocks, no flashing timers, zero score penalties.
   - Dopamine pacing cues and tactile break offers.
   - Absolutely no ADHD or medical fields in DB or UI.
2. **Transparent AI Agents (Offline Preparation)**:
   - **Content Agent**: reads digital textbook PDFs with `pypdf`, checks arithmetic with tools, tests grounding against source pages, and drafts questions.
   - **Agent Steps Trace (`agent_steps`)**: complete visibility into the agent's reasoning loop for the parent.
   - **Coach Agent**: grounded, non-diagnostic weekly progress summaries and interactive chat.
3. **Deterministic Child Runtime (100% Python)**:
   - `app/services/adaptive.py`: reacts to hesitation, rushing, and errors using pure tested code.
   - `app/services/breaks.py`: 3-way sensory break offers (continue, game, rest).
   - `app/services/insights_rules.py`: deterministic parent observation notes.
4. **Rule 7 Approval Gate**:
   - A lesson cannot be played by a child until approved by a parent. Enforced by FastAPI route guards.

---

## 🚀 Running Locally

### 1. Backend (FastAPI)
```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Open [http://localhost:8000](http://localhost:8000) for the full application or [http://localhost:8000/docs](http://localhost:8000/docs) for the interactive Swagger API documentation.

### 2. Running Tests
```bash
pytest
```
All 16 unit tests verify adaptive engine branches, break detection guards, and validator tools.

---

## ☁️ Deployment (Render)
Configured via `render.yaml`.
- Build: `pip install -r requirements.txt`
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check: `/health`
