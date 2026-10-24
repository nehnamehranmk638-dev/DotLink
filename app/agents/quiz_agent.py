import json
import uuid
from typing import Dict, Any, List, Optional
from app.config import settings
from app.db import get_db
from app.models.schemas import SubmitQuizSetsPayload, QuizQuestion
from app.agents.loop import run_agent_loop, log_agent_step
from app.agents.tools import calculator, check_grounding, count_words
from app.agents.topic_source import get_topic_pages
from app.agents.source_content import source_questions
from app.agents.validators import validate_question_with_retry_and_flag, calculate_expected_question_count

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

AGENT_3_TOOLS[-1]["function"]["parameters"] = SubmitQuizSetsPayload.model_json_schema()


def build_deterministic_quizzes(topic_name, start_page, end_page, pages_map=None):
    skip = calculate_expected_question_count(count_words(" ".join((pages_map or {}).values())))
    questions = source_questions(pages_map or {}, settings.QUIZ_TOTAL_QUESTIONS * 2 + skip, topic_name)[skip:]
    for index, question in enumerate(questions):
        position = index % settings.QUIZ_TOTAL_QUESTIONS
        question["difficulty"] = "easy" if position == 0 else "application" if position == settings.QUIZ_TOTAL_QUESTIONS - 1 else "medium"
        if question["difficulty"] == "application" and not question["question_text"].startswith(("A friend", "Help a friend", "Use the example")):
            question["question_text"] = "Help a friend use this example. " + question["question_text"]
    return SubmitQuizSetsPayload(quiz_set_a=[QuizQuestion(**q) for q in questions[:settings.QUIZ_TOTAL_QUESTIONS]],
                                 quiz_set_b=[QuizQuestion(**q) for q in questions[settings.QUIZ_TOTAL_QUESTIONS:]])


def run_code_backstop(questions, start_page, end_page, pages_map):
    processed, seen = [], set()
    for question in questions:
        result = validate_question_with_retry_and_flag(question, pages_map, start_page, end_page, settings.QUESTION_RETRY_CAP)
        duplicate = question.question_text.casefold() in seen
        seen.add(question.question_text.casefold())
        processed.append({"question": question, "flagged": not result["valid"] or duplicate,
                          "flag_reason": "Duplicate question in topic" if duplicate else result["flag_reason"]})
    return processed


async def run_quiz_agent(
    topic_id: str,
    run_id: str,
    db,
    excluded_questions=None,
    max_retries=settings.QUESTION_RETRY_CAP
) -> SubmitQuizSetsPayload:
    """
    Executes Agent 3: Quiz & Retest Agent followed by the Python code backstop.
    Uses heavy task weight (openai/gpt-oss-120b).
    """
    cursor = await db.execute("SELECT * FROM topics WHERE id = ?", (topic_id,))
    topic = await cursor.fetchone()
    if not topic:
        raise ValueError(f"Topic {topic_id} not found")

    pages_map = await get_topic_pages(db, topic)

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

    excluded_questions = set(excluded_questions or [])
    def validate_submission(data):
        errors = [item["flag_reason"] for item in run_code_backstop(data.quiz_set_a + data.quiz_set_b, topic["start_page"], topic["end_page"], pages_map) if item["flagged"]]
        for quiz in (data.quiz_set_a, data.quiz_set_b):
            if not {"easy", "medium", "application"} <= {question.difficulty for question in quiz}:
                errors.append("Each quiz set needs easy, medium and one application question")
        if any(question.question_text.casefold() in excluded_questions for question in data.quiz_set_a + data.quiz_set_b):
            errors.append("Duplicate of a lesson question; create a new question")
        return errors

    page_snippet = "\n\n".join([f"--- Page {p} ---\n{txt}" for p, txt in sorted(pages_map.items())])
    system_prompt = (
        f"You are Agent 3 (Quiz & Retest Agent). You generate two parallel 10-question multiple-choice quizzes: "
        f"Set A (end-of-lesson quiz) and Set B (post-revision retest) for Topic '{topic['name']}' "
        f"(Pages {topic['start_page']} to {topic['end_page']}).\n"
        f"Requirements:\n"
        f"1. Exactly 10 questions in quiz_set_a, exactly 10 questions in quiz_set_b.\n"
        f"2. No overlapping questions between Set A and Set B.\n"
        f"3. Every question needs 3-4 distinct plausible options, exactly one correct_answer, hint_text, explanation_text, source_page, evidence_quote and difficulty.\n"
        f"Use only THIS topic. Start with its book exercises. Mix easy, medium and one application question in each set. Avoid duplicates and silly distractors.\n"
        f"Directly generate and call 'submit_quiz_sets' with both complete 10-question sets."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Topic: '{topic['name']}'.\nSource Text:\n{page_snippet}\nAlready used in this lesson (do not repeat): {sorted(excluded_questions)}\n\nPlease generate Quiz Set A and Quiz Set B and immediately call submit_quiz_sets."}
    ]

    generation_failure_reason = None
    if not settings.GROQ_API_KEY and not settings.GEMINI_API_KEY:
        quiz_data = build_deterministic_quizzes(topic["name"], topic["start_page"], topic["end_page"], pages_map)
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
                content_validator=validate_submission,
                max_retries=max_retries,
                max_steps=settings.AGENT_MAX_STEPS
            )
        except Exception as e:
            generation_failure_reason = str(e)
            await log_agent_step(db, run_id, topic_id, "quiz_agent", 98, "fallback_quizzes", {}, f"Agent step error: {str(e)[:150]}. Using backstop quizzes.")
            quiz_data = getattr(e, "payload", None) or build_deterministic_quizzes(topic["name"], topic["start_page"], topic["end_page"], pages_map)

    # Run Code Backstop in plain Python
    processed_a = run_code_backstop(quiz_data.quiz_set_a, topic["start_page"], topic["end_page"], pages_map)
    processed_b = run_code_backstop(quiz_data.quiz_set_b, topic["start_page"], topic["end_page"], pages_map)

    for item in processed_a + processed_b:
        if item["question"].question_text.casefold() in excluded_questions:
            item.update(flagged=True, flag_reason="Duplicate of a lesson question")
    if generation_failure_reason:
        for item in processed_a + processed_b:
            item.update(flagged=True, flag_reason=generation_failure_reason)

    # Save to database
    await db.execute("DELETE FROM questions WHERE topic_id = ? AND question_type IN ('quiz_a', 'quiz_b')", (topic_id,))

    for item in processed_a:
        q = item["question"]
        q_id = str(uuid.uuid4())
        q_data = {"question_text": q.question_text, "options": q.options, "evidence_quote": q.evidence_quote, "difficulty": q.difficulty, "answer_index": q.options.index(q.correct_answer)}
        await db.execute("""
            INSERT INTO questions (id, topic_id, question_type, question_data, correct_answer, hint_text, explanation_text, source_page, status, flagged, flag_reason)
            VALUES (?, ?, 'quiz_a', ?, ?, ?, ?, ?, 'active', ?, ?)
        """, (q_id, topic_id, json.dumps(q_data), q.correct_answer, q.hint_text, q.explanation_text, q.source_page, 1 if item["flagged"] else 0, item["flag_reason"]))

    for item in processed_b:
        q = item["question"]
        q_id = str(uuid.uuid4())
        q_data = {"question_text": q.question_text, "options": q.options, "evidence_quote": q.evidence_quote, "difficulty": q.difficulty, "answer_index": q.options.index(q.correct_answer)}
        await db.execute("""
            INSERT INTO questions (id, topic_id, question_type, question_data, correct_answer, hint_text, explanation_text, source_page, status, flagged, flag_reason)
            VALUES (?, ?, 'quiz_b', ?, ?, ?, ?, ?, 'active', ?, ?)
        """, (q_id, topic_id, json.dumps(q_data), q.correct_answer, q.hint_text, q.explanation_text, q.source_page, 1 if item["flagged"] else 0, item["flag_reason"]))

    await db.commit()
    return quiz_data
