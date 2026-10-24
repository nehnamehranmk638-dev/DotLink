import json
import uuid
from typing import Dict, Any, List, Optional
from app.config import settings
from app.db import get_db
from app.models.schemas import SubmitQuizSetsPayload, QuizQuestion
from app.agents.loop import run_agent_loop, log_agent_step
from app.agents.tools import calculator, check_grounding

AGENT_3_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_page_text",
            "description": "Reads the extracted text of a textbook source page.",
            "parameters": {
                "type": "object",
                "properties": {
                    "page_number": {"type": "integer"}
                },
                "required": ["page_number"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": "Calculates arithmetic expressions to verify numerical correctness.",
            "parameters": {
                "type": "object",
                "properties": {
                    "a": {"type": "number"},
                    "op": {"type": "string", "description": "+, -, *, /, ^, %"},
                    "b": {"type": "number"}
                },
                "required": ["a", "op", "b"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_grounding",
            "description": "Fuzzy-matches candidate question text against a textbook source page using RapidFuzz.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question_text": {"type": "string"},
                    "page_number": {"type": "integer"}
                },
                "required": ["question_text", "page_number"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "submit_quiz_sets",
            "description": "Submits two parallel non-overlapping 10-question quizzes: Set A (end of lesson) and Set B (retest).",
            "parameters": {
                "type": "object",
                "properties": {
                    "quiz_set_a": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "question_text": {"type": "string"},
                                "options": {"type": "array", "items": {"type": "string"}},
                                "correct_answer": {"type": "string"},
                                "hint_text": {"type": "string"},
                                "explanation_text": {"type": "string"},
                                "source_page": {"type": "integer"}
                            },
                            "required": ["question_text", "options", "correct_answer", "hint_text", "explanation_text", "source_page"]
                        }
                    },
                    "quiz_set_b": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "question_text": {"type": "string"},
                                "options": {"type": "array", "items": {"type": "string"}},
                                "correct_answer": {"type": "string"},
                                "hint_text": {"type": "string"},
                                "explanation_text": {"type": "string"},
                                "source_page": {"type": "integer"}
                            },
                            "required": ["question_text", "options", "correct_answer", "hint_text", "explanation_text", "source_page"]
                        }
                    }
                },
                "required": ["quiz_set_a", "quiz_set_b"]
            }
        }
    }
]

def build_deterministic_quizzes(topic_name: str, start_page: int, end_page: int) -> SubmitQuizSetsPayload:
    """Builds two distinct 10-question quizzes for offline testing/dev without LLM keys."""
    set_a = []
    set_b = []
    for i in range(1, 11):
        set_a.append(QuizQuestion(
            question_text=f"Question {i} (Set A): What is a key concept introduced in {topic_name} part {i}?",
            options=[f"Core fact {i}", f"Wrong option X{i}", f"Wrong option Y{i}", f"Wrong option Z{i}"],
            correct_answer=f"Core fact {i}",
            hint_text=f"Review the primary principle of section {i}.",
            explanation_text=f"Core fact {i} is the fundamental idea explained in the textbook.",
            source_page=start_page
        ))
        set_b.append(QuizQuestion(
            question_text=f"Question {i} (Set B): How do we apply the rule of {topic_name} in practice {i}?",
            options=[f"Practical application {i}", f"Incorrect method P{i}", f"Incorrect method Q{i}", f"Incorrect method R{i}"],
            correct_answer=f"Practical application {i}",
            hint_text=f"Think about the real-world example from section {i}.",
            explanation_text=f"Practical application {i} directly demonstrates the rule in action.",
            source_page=end_page if end_page >= start_page else start_page
        ))
    return SubmitQuizSetsPayload(quiz_set_a=set_a, quiz_set_b=set_b)

def run_code_backstop(
    questions: List[QuizQuestion],
    start_page: int,
    end_page: int,
    pages_map: Dict[int, str]
) -> List[Dict[str, Any]]:
    """
    Plain Python backstop:
    - Confirms source_page lies within topic's page range.
    - Re-runs grounding score against source page text.
    - Marks failures flagged=True with a flag_reason so parent sees them highlighted.
    """
    processed = []
    for q in questions:
        flagged = False
        reasons = []

        # 1. Page range check
        if q.source_page < start_page or q.source_page > end_page:
            flagged = True
            reasons.append(f"Source page {q.source_page} is outside topic range ({start_page}-{end_page})")

        # 2. Grounding check
        page_text = pages_map.get(q.source_page, "")
        if page_text:
            grounding_res = check_grounding(q.question_text, page_text)
            if not grounding_res["grounded"]:
                flagged = True
                reasons.append(f"Low grounding score ({grounding_res['score']} < {grounding_res['threshold']})")
        else:
            flagged = True
            reasons.append(f"No source page text found for page {q.source_page}")

        processed.append({
            "question": q,
            "flagged": flagged,
            "flag_reason": "; ".join(reasons) if flagged else None
        })
    return processed

async def run_quiz_agent(
    topic_id: str,
    run_id: str,
    db
) -> SubmitQuizSetsPayload:
    """
    Executes Agent 3: Quiz & Retest Agent followed by the Python code backstop.
    Uses heavy task weight (openai/gpt-oss-120b).
    """
    cursor = await db.execute("SELECT * FROM topics WHERE id = ?", (topic_id,))
    topic = await cursor.fetchone()
    if not topic:
        raise ValueError(f"Topic {topic_id} not found")

    cursor = await db.execute("""
        SELECT page_number, text FROM source_pages
        WHERE textbook_id = ? AND page_number BETWEEN ? AND ?
        ORDER BY page_number ASC
    """, (topic["textbook_id"], topic["start_page"], topic["end_page"]))
    pages_rows = await cursor.fetchall()
    pages_map = {r["page_number"]: r["text"] for r in pages_rows}

    async def tool_executor(name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        if name == "get_page_text":
            p = args.get("page_number", topic["start_page"])
            text = pages_map.get(p)
            if text:
                return {"page_number": p, "text": text}
            return {"error": f"Page {p} not found"}
        elif name == "calculator":
            return calculator(args.get("a", 0), args.get("op", "+"), args.get("b", 0))
        elif name == "check_grounding":
            p = args.get("page_number", topic["start_page"])
            q_text = args.get("question_text", "")
            return check_grounding(q_text, pages_map.get(p, ""))
        return {"error": f"Unknown tool {name}"}

    page_snippet = "\n\n".join([f"--- Page {p} ---\n{txt}" for p, txt in sorted(pages_map.items())])
    system_prompt = (
        f"You are Agent 3 (Quiz & Retest Agent). You generate two parallel 10-question multiple-choice quizzes: "
        f"Set A (end-of-lesson quiz) and Set B (post-revision retest) for Topic '{topic['name']}' "
        f"(Pages {topic['start_page']} to {topic['end_page']}).\n"
        f"Requirements:\n"
        f"1. Exactly 10 questions in quiz_set_a, exactly 10 questions in quiz_set_b.\n"
        f"2. No overlapping questions between Set A and Set B.\n"
        f"3. Every question strictly requires question_text, options, correct_answer, hint_text, explanation_text, and source_page.\n"
        f"Directly generate and call 'submit_quiz_sets' with both complete 10-question sets."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Topic: '{topic['name']}'.\nSource Text:\n{page_snippet[:3500]}\n\nPlease generate Quiz Set A and Quiz Set B and immediately call submit_quiz_sets."}
    ]

    if not settings.GROQ_API_KEY and not settings.GEMINI_API_KEY:
        quiz_data = build_deterministic_quizzes(topic["name"], topic["start_page"], topic["end_page"])
    else:
        try:
            quiz_data = await run_agent_loop(
                agent_name="quiz_agent",
                run_id=run_id,
                topic_id=topic_id,
                task_weight="heavy",
                messages=messages,
                tool_definitions=AGENT_3_TOOLS,
                tool_executor=tool_executor,
                submit_tool_name="submit_quiz_sets",
                submit_validator=SubmitQuizSetsPayload,
                db=db,
                max_steps=25
            )
        except Exception as e:
            await log_agent_step(db, run_id, topic_id, "quiz_agent", 98, "fallback_quizzes", {}, f"Agent step error: {str(e)[:150]}. Using backstop quizzes.")
            quiz_data = build_deterministic_quizzes(topic["name"], topic["start_page"], topic["end_page"])

    # Run Code Backstop in plain Python
    processed_a = run_code_backstop(quiz_data.quiz_set_a, topic["start_page"], topic["end_page"], pages_map)
    processed_b = run_code_backstop(quiz_data.quiz_set_b, topic["start_page"], topic["end_page"], pages_map)

    # Save to database
    await db.execute("DELETE FROM questions WHERE topic_id = ? AND question_type IN ('quiz_a', 'quiz_b')", (topic_id,))

    for item in processed_a:
        q = item["question"]
        q_id = str(uuid.uuid4())
        q_data = {"question_text": q.question_text, "options": q.options}
        await db.execute("""
            INSERT INTO questions (id, topic_id, question_type, question_data, correct_answer, hint_text, explanation_text, source_page, status, flagged, flag_reason)
            VALUES (?, ?, 'quiz_a', ?, ?, ?, ?, ?, 'active', ?, ?)
        """, (q_id, topic_id, json.dumps(q_data), q.correct_answer, q.hint_text, q.explanation_text, q.source_page, 1 if item["flagged"] else 0, item["flag_reason"]))

    for item in processed_b:
        q = item["question"]
        q_id = str(uuid.uuid4())
        q_data = {"question_text": q.question_text, "options": q.options}
        await db.execute("""
            INSERT INTO questions (id, topic_id, question_type, question_data, correct_answer, hint_text, explanation_text, source_page, status, flagged, flag_reason)
            VALUES (?, ?, 'quiz_b', ?, ?, ?, ?, ?, 'active', ?, ?)
        """, (q_id, topic_id, json.dumps(q_data), q.correct_answer, q.hint_text, q.explanation_text, q.source_page, 1 if item["flagged"] else 0, item["flag_reason"]))

    await db.commit()
    return quiz_data
