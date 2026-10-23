# DotLink: 3-Minute Hackathon Demo Script (Realm Hack'26)

> **Architecture:** FastAPI (Python 3.13) + Groq AI Agents + Supabase + React (Vite/CSS) + Render  
> **Core Thesis:** "AI agents prepare and explain. Rules decide. A parent approves."

---

## ⏱️ 3-Minute Presenter Walkthrough

### 1. The Problem & Non-Diagnostic Positioning (0:00 – 0:40)
- **Open Dashboard (`/`)**:
  - *"Traditional edtech punishes neurodivergent learners with flashing countdown timers, leaderboard pressure, and sensory overwhelm."*
  - *"DotLink takes the opposite stance: calm aesthetics, zero countdown clocks, and gentle dopamine pacing. We never diagnose ADHD — adaptation is identical and beneficial for every child."*
- **Highlight Live Parent Observer**:
  - Point out the 3-second polling banner: tracks active study beats and hesitation alerts without intrusive screen recording.

---

### 2. PDF Upload & Transparent Agent Reasoning (0:40 – 1:20)
- **Navigate to Upload**:
  - Select Grade 3 Science Chapter: Pages 1 to 3 (*Plant Anatomy & Solar Energy*).
  - Click **"Run Content Agent"**.
- **Show the Agent Steps Trace (`agent_steps`)**:
  - Point to the live reasoning trace in the UI:
    1. `get_page_text(1)`: Extracted 742 characters of plant text via `pypdf`.
    2. `calculator(a, op, b)`: Verified mathematical correctness in code.
    3. `check_reading_level(q, grade=3)`: Verified sentence length and vocabulary for Grade 3.
    4. `check_grounding(q, page=1)`: Confirmed token grounding against stored source text.
    5. `submit_question_set(questions)`: Pydantic schema validation.

---

### 3. Rule 7 Safety Gate: Parent Approval (1:20 – 1:40)
- **Review Screen**:
  - Show each question with its **"from page N"** pill and grounding verification.
  - Explain Rule 7: *"A lesson is locked until approved by the parent. The FastAPI session endpoint strictly rejects unapproved topics."*
  - Click **"Approve Lesson for Child"**.

---

### 4. Child Study Experience (Zero Timers!) (1:40 – 2:25)
- **Switch to Child Mode (`/play`)**:
  - Pip greets Alex warmly. Tap the approved lesson.
- **Scene Player**:
  - **Zero Timers**: No countdown clocks, no penalty buzzer.
  - **Rushing Visual**: Tap an answer rapidly (< 1.5s) ➜ Pip locks buttons for 2.5s with a gentle *"Take a breath and count with me"* visual.
  - **Sensory Brain Break**: If fatigue or prolonged hesitation occurs, a neutral 3-way modal appears (*"Want a quick break? Keep going, play a quick game, or take a rest?"*).
  - **Stars Only Go Up**: Complete the chapter ➜ earn study stars.

---

### 5. Parent Analytics & Coach Agent (2:25 – 3:00)
- **Switch to Progress & Coach**:
  - Click **"Populate 2-Wk Demo Data"** to view rich Chart.js analytics:
    - **Silent Retrieval Accuracy Trend**: First-attempt accuracy (headline) vs final resolved accuracy.
    - **Deliberation Pacing Bar Chart**: Response time compared to grade expected baseline.
  - **Rule-Based Insights**:
    - *"Strong Conceptual Mastery"* / *"Healthy Rest Break Utilized"* (100% deterministic code).
  - **Coach Agent Q&A**:
    - Ask Coach Pip: *"How was Alex's focus on science this week?"*
    - Show grounded, non-diagnostic response and practical suggestions.

---

## 🏛️ Plain-Language Architecture Summary for Judges

1. **Where AI is Used**:
   - Strictly offline via **Content Agent** and **Coach Agent** using Groq (`gpt-oss-120b` / `20b`) with Gemini fallback.
   - Every output is bounded by Pydantic schemas and 20s timeouts with 1 retry.
2. **Why AI Never Decides What the Child Sees**:
   - Live session adaptation (scoring, stars, fatigue, rushing, break offers, mastery) is **100% deterministic Python (`adaptive.py`, `breaks.py`)**.
   - No LLM hallucinates difficulty or interrupts the child.
3. **How Child Data is Protected**:
   - Access control enforced via FastAPI dependencies (`get_current_parent`, `assert_owns`).
   - Zero diagnostic or clinical fields in database or UI.
   - Silent accuracy is parent-only and never exposed in child mode.
