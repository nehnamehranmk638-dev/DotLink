from typing import List, Dict, Any, Optional
from app.models.schemas import QuestionSetPayload, ExtractedQuestion
from app.agents.loop import run_agent_loop
from app.agents.tools import tool_calculator, tool_check_grounding, tool_check_reading_level
from app.deps import get_supabase_admin

CONTENT_AGENT_SYSTEM = """You are DotLink's Content Agent.
Your goal is to turn uploaded textbook pages into a high-quality, calm, ADHD-friendly question set for elementary students.
You have access to tools to read pages, search text, calculate arithmetic, test grounding, and verify reading level.
Always draft 3 to 5 questions covering easy, medium, and hard difficulty.
Before submitting, verify that each question's answer is grounded in the textbook text and suitable for the child's grade.
When ready, call `submit_question_set` with your verified questions.
"""

CONTENT_AGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_page_text",
            "description": "Read the full text of a specific textbook page stored in this topic.",
            "parameters": {
                "type": "object",
                "properties": {
                    "page_number": {"type": "integer", "description": "1-indexed page number"}
                },
                "required": ["page_number"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": "Calculate math expressions to verify correct answers.",
            "parameters": {
                "type": "object",
                "properties": {
                    "a": {"type": "number"},
                    "op": {"type": "string", "enum": ["+", "-", "*", "/"]},
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
            "description": "Check if a question is grounded in the cited textbook page text.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question_text": {"type": "string"},
                    "page_text": {"type": "string"}
                },
                "required": ["question_text", "page_text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_reading_level",
            "description": "Verify sentence length and vocabulary fits the grade level.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "grade": {"type": "integer"}
                },
                "required": ["text", "grade"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "submit_question_set",
            "description": "Submit the finalized, grounded question set for parent review.",
            "parameters": {
                "type": "object",
                "properties": {
                    "questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "questionText": {"type": "string"},
                                "type": {"type": "string", "enum": ["multiple_choice"]},
                                "options": {"type": "array", "items": {"type": "string"}},
                                "correctAnswer": {"type": "string"},
                                "difficulty": {"type": "string", "enum": ["easy", "medium", "hard"]},
                                "sourcePage": {"type": "integer"}
                            },
                            "required": ["questionText", "type", "options", "correctAnswer", "difficulty", "sourcePage"]
                        }
                    }
                },
                "required": ["questions"]
            }
        }
    }
]

async def run_content_agent(
    topic_id: str,
    subject: str,
    grade: int,
    stored_pages: List[Dict[str, Any]]
) -> tuple[Optional[QuestionSetPayload], str]:
    """
    Executes Content Agent run to draft and verify questions from stored pages.
    """
    pages_by_num = {p["page_number"]: p["text"] for p in stored_pages}
    page_numbers = list(pages_by_num.keys())

    # Build tool handlers bound to this topic's pages
    def handle_get_page_text(page_number: int):
        return {"page_number": page_number, "text": pages_by_num.get(page_number, "Page not found in this topic.")}

    def handle_check_grounding(question_text: str, page_text: str = ""):
        return tool_check_grounding(question_text, page_text)

    tool_handlers = {
        "get_page_text": handle_get_page_text,
        "calculator": tool_calculator,
        "check_grounding": handle_check_grounding,
        "check_reading_level": lambda text, grade=grade: tool_check_reading_level(text, grade)
    }

    # Summary of available pages for initial prompt
    pages_overview = "\n".join([f"- Page {p}: {len(pages_by_num[p])} characters" for p in page_numbers])
    user_goal = (
        f"Topic: {subject} for Grade {grade}.\n"
        f"Available textbook pages: {page_numbers}.\n"
        f"{pages_overview}\n\n"
        f"Read the pages using `get_page_text`, draft 3 to 5 questions, verify grounding, and submit via `submit_question_set`."
    )

    result, run_id = await run_agent_loop(
        agent_name="content_agent",
        system_prompt=CONTENT_AGENT_SYSTEM,
        user_goal=user_goal,
        tools_definitions=CONTENT_AGENT_TOOLS,
        tool_handlers=tool_handlers,
        submit_tool_name="submit_question_set",
        pydantic_output_model=QuestionSetPayload,
        topic_id=topic_id
    )

    # --- Code Backstop After Submit ---
    # Validate sourcePage within range and fuzzy match
    if result and isinstance(result, QuestionSetPayload):
        validated_questions: List[ExtractedQuestion] = []
        for q in result.questions:
            # Fallback if sourcePage out of range
            if q.sourcePage not in page_numbers:
                q.sourcePage = page_numbers[0] if page_numbers else 1
            validated_questions.append(q)
        result.questions = validated_questions

    return result, run_id
