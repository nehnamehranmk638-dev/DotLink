import json
import uuid
from typing import Dict, Any, List, Optional
from app.config import settings
from app.db import get_db
from app.models.schemas import (
    SubmitLessonAndRevisionPayload,
    AnimatedScene,
    HighlightedWord,
    InVideoQuestion,
    RevisionBullet,
    WordNumberPair,
    MiniGameConfig
)
from app.agents.loop import run_agent_loop, log_agent_step
from app.agents.tools import check_reading_level

AGENT_2_TOOLS = [
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
            "name": "check_reading_level",
            "description": "Checks whether candidate narration text matches the target grade level using Flesch-Kincaid formula.",
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
            "name": "submit_lesson_and_revision",
            "description": "Submits the complete animated lesson script, highlighted active-listening words, in-video pop-up questions, revision bullets, and mini-game config.",
            "parameters": {
                "type": "object",
                "properties": {
                    "scenes": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "scene_num": {"type": "integer"},
                                "title": {"type": "string"},
                                "visual_description": {"type": "string"},
                                "narration_text": {"type": "string"}
                            },
                            "required": ["scene_num", "title", "visual_description", "narration_text"]
                        }
                    },
                    "highlighted_words": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "word": {"type": "string"},
                                "key_point": {"type": "string"},
                                "scene_num": {"type": "integer"}
                            },
                            "required": ["word", "key_point", "scene_num"]
                        }
                    },
                    "in_video_questions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "scene_num": {"type": "integer"},
                                "question_text": {"type": "string"},
                                "options": {"type": "array", "items": {"type": "string"}},
                                "correct_answer": {"type": "string"},
                                "hint_text": {"type": "string"},
                                "explanation_text": {"type": "string"},
                                "source_page": {"type": "integer"}
                            },
                            "required": ["scene_num", "question_text", "options", "correct_answer", "hint_text", "explanation_text", "source_page"]
                        }
                    },
                    "revision_bullets": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "bullet_num": {"type": "integer"},
                                "scene_num": {"type": "integer"},
                                "text": {"type": "string"}
                            },
                            "required": ["bullet_num", "scene_num", "text"]
                        }
                    },
                    "mini_game_config": {
                        "type": "object",
                        "properties": {
                            "pairs": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "left": {"type": "string"},
                                        "right": {"type": "string"}
                                    },
                                    "required": ["left", "right"]
                                }
                            }
                        },
                        "required": ["pairs"]
                    }
                },
                "required": ["scenes", "highlighted_words", "in_video_questions", "revision_bullets", "mini_game_config"]
            }
        }
    }
]

def build_deterministic_lesson(topic_name: str, subject_tag: str, start_page: int, end_page: int) -> SubmitLessonAndRevisionPayload:
    """Fallback generator for offline testing or development without LLM keys."""
    scenes = [
        AnimatedScene(
            scene_num=1,
            title=f"Welcome to {topic_name}",
            visual_description=f"A bright animated laboratory introducing fundamental concepts of {topic_name} with playful floating icons.",
            narration_text=f"Hello explorer! Today we are learning about {topic_name}. Look closely at the clues and concepts on screen!"
        ),
        AnimatedScene(
            scene_num=2,
            title="Core Patterns and Rules",
            visual_description="Interactive diagrams showing the main rules, step-by-step illustrations, and colorful highlight badges.",
            narration_text=f"Every problem has a pattern. In {subject_tag}, when we observe carefully, we find rules that make everything simple."
        ),
        AnimatedScene(
            scene_num=3,
            title="Real-World Connections",
            visual_description="A bustling cityscape and nature view highlighting where these concepts appear in daily life.",
            narration_text="Did you know these ideas are used by builders, scientists, and artists all over the world every single day?"
        ),
        AnimatedScene(
            scene_num=4,
            title="Mastery Summary",
            visual_description="A sparkling trophy and summary board displaying the key takeaways with confetti.",
            narration_text="Great work! You now know the key ideas. Let us review the key points and test our understanding."
        )
    ]
    words = [
        HighlightedWord(word="Pattern", key_point="A repeated design or sequence that follows a rule", scene_num=1),
        HighlightedWord(word="Rule", key_point="A set guideline that helps us calculate or understand facts", scene_num=2),
        HighlightedWord(word="Concept", key_point="The foundational idea behind the topic", scene_num=3)
    ]
    in_video_q = [
        InVideoQuestion(
            scene_num=2,
            question_text=f"What is the most helpful strategy when studying {topic_name}?",
            options=["Look for patterns and rules", "Rush without reading", "Ignore the examples", "Guess randomly"],
            correct_answer="Look for patterns and rules",
            hint_text="Remember what scene 2 explained about observing carefully.",
            explanation_text="Observing carefully to find patterns and rules helps solve problems easily.",
            source_page=start_page
        )
    ]
    bullets = [
        RevisionBullet(bullet_num=1, scene_num=1, text=f"{topic_name} introduces the foundational concepts."),
        RevisionBullet(bullet_num=2, scene_num=2, text="Recognizing patterns allows for quick and accurate understanding."),
        RevisionBullet(bullet_num=3, scene_num=3, text="Concepts connect directly to real-world applications."),
        RevisionBullet(bullet_num=4, scene_num=4, text="Reviewing core takeaways guarantees solid mastery.")
    ]
    pairs = [
        WordNumberPair(left="Pattern", right="Repeated design"),
        WordNumberPair(left="Rule", right="Guiding principle"),
        WordNumberPair(left="Observe", right="Look closely"),
        WordNumberPair(left="Solve", right="Find the answer"),
        WordNumberPair(left="Review", right="Refresh memory"),
        WordNumberPair(left="Mastery", right="Full understanding")
    ]
    return SubmitLessonAndRevisionPayload(
        scenes=scenes,
        highlighted_words=words,
        in_video_questions=in_video_q,
        revision_bullets=bullets,
        mini_game_config=MiniGameConfig(pairs=pairs)
    )

async def run_lesson_and_revision_agent(
    topic_id: str,
    run_id: str,
    db
) -> SubmitLessonAndRevisionPayload:
    """
    Executes Agent 2: Lesson & Revision Script Agent.
    Uses heavy task weight (openai/gpt-oss-120b).
    """
    # Fetch topic details and source pages
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

    # Fetch textbook grade
    tb_cursor = await db.execute("SELECT grade FROM textbooks WHERE id = ?", (topic["textbook_id"],))
    tb_row = await tb_cursor.fetchone()
    grade = tb_row["grade"] if tb_row else 4

    async def tool_executor(name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        if name == "get_page_text":
            p = args.get("page_number", topic["start_page"])
            text = pages_map.get(p)
            if text:
                return {"page_number": p, "text": text}
            return {"error": f"Page {p} not found for this topic (range: {topic['start_page']}-{topic['end_page']})"}
        elif name == "check_reading_level":
            text = args.get("text", "")
            g = args.get("grade", grade)
            return check_reading_level(text, g)
        return {"error": f"Unknown tool {name}"}

    system_prompt = (
        f"You are Agent 2 (Lesson & Revision Script Agent). You create interactive, child-safe animated lesson scripts "
        f"for Grade {grade} students based strictly on the NCERT textbook source pages.\n"
        f"Topic: {topic['name']} (Pages {topic['start_page']} to {topic['end_page']}).\n"
        f"Requirements:\n"
        f"1. 4 to 8 animated scenes (scene_num, title, visual_description, narration_text).\n"
        f"2. Highlighted active-listening words per scene (word, key_point, scene_num) that pulse for the child to click.\n"
        f"3. 1 to 3 mid-lesson pop-up in-video questions (scene_num, question_text, 3-4 options, correct_answer, hint_text, explanation_text, source_page).\n"
        f"4. Revision bullets linked to scenes.\n"
        f"5. mini_game_config with 6 to 8 matching word/number pairs.\n"
        f"Check reading level to ensure age-appropriateness, and call submit_lesson_and_revision when done."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Please generate the lesson and revision sheet for topic '{topic['name']}'."}
    ]

    if not settings.GROQ_API_KEY and not settings.GEMINI_API_KEY:
        lesson_data = build_deterministic_lesson(topic["name"], topic["subject_tag"], topic["start_page"], topic["end_page"])
    else:
        try:
            lesson_data = await run_agent_loop(
                agent_name="lesson_revision_agent",
                run_id=run_id,
                topic_id=topic_id,
                task_weight="heavy",
                messages=messages,
                tool_definitions=AGENT_2_TOOLS,
                tool_executor=tool_executor,
                submit_tool_name="submit_lesson_and_revision",
                submit_validator=SubmitLessonAndRevisionPayload,
                db=db
            )
        except Exception as e:
            try:
                await log_agent_step(db, run_id, topic_id, "lesson_revision_agent", 99, "fallback_lesson", {}, f"LLM error: {str(e)[:150]}. Using deterministic lesson.")
            except Exception:
                pass
            lesson_data = build_deterministic_lesson(topic["name"], topic["subject_tag"], topic["start_page"], topic["end_page"])

    # Save lesson bundle to DB
    bundle_id = str(uuid.uuid4())
    scenes_json = [s.model_dump() for s in lesson_data.scenes]
    bullets_json = [b.model_dump() for b in lesson_data.revision_bullets]
    mini_game_json = lesson_data.mini_game_config.model_dump()

    # Delete existing bundle if present (for re-generation)
    await db.execute("DELETE FROM lesson_bundles WHERE topic_id = ?", (topic_id,))
    await db.execute("""
        INSERT INTO lesson_bundles (id, topic_id, scenes_json, revision_bullets_json, mini_game_config, status)
        VALUES (?, ?, ?, ?, ?, 'ready')
    """, (bundle_id, topic_id, json.dumps(scenes_json), json.dumps(bullets_json), json.dumps(mini_game_json)))

    # Save in-video questions to DB
    await db.execute("DELETE FROM questions WHERE topic_id = ? AND question_type = 'in_video'", (topic_id,))
    for q in lesson_data.in_video_questions:
        q_id = str(uuid.uuid4())
        q_data = {
            "question_text": q.question_text,
            "options": q.options,
            "scene_num": q.scene_num
        }
        await db.execute("""
            INSERT INTO questions (id, topic_id, question_type, question_data, correct_answer, hint_text, explanation_text, source_page, status, flagged, flag_reason)
            VALUES (?, ?, 'in_video', ?, ?, ?, ?, ?, 'active', 0, NULL)
        """, (q_id, topic_id, json.dumps(q_data), q.correct_answer, q.hint_text, q.explanation_text, q.source_page))

    await db.commit()
    return lesson_data
