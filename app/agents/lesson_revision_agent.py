import json
import re
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
from app.agents.tools import check_reading_level, count_words
from app.agents.validators import validate_question_with_retry_and_flag, validate_topic_questions, validate_lesson_content
from app.agents.topic_source import get_topic_pages
from app.agents.source_content import source_questions, source_scenes

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

AGENT_2_TOOLS[-1]["function"]["parameters"] = SubmitLessonAndRevisionPayload.model_json_schema()

def build_deterministic_lesson(
    topic_name: str,
    subject_tag: str,
    start_page: int,
    end_page: int,
    word_count: int = 1200,
    pages_map: Optional[Dict[int, str]] = None
) -> SubmitLessonAndRevisionPayload:
    """
    Fallback generator for offline testing or development without LLM keys.
    Generates:
    - Scenes: roughly 1 scene per 150-250 words of source text, each with interaction beat & 3 variants (standard, simplified, short).
    - Questions: 4 to 8 questions (~1 per 200 words), 3-4 options, 1 correct option, grounded in topic text.
    """
    avg_words_per_scene = (settings.WORDS_PER_SCENE_MIN + settings.WORDS_PER_SCENE_MAX) / 2
    num_scenes = max(4, round(word_count / avg_words_per_scene))
    num_questions = min(
        settings.MAX_QUESTIONS_PER_TOPIC,
        max(settings.MIN_QUESTIONS_PER_TOPIC, round(word_count / settings.WORDS_PER_QUESTION))
    )

    scene_titles = [
        f"Welcome to {topic_name}",
        "Core Patterns and Rules",
        "Step-by-Step Exploration",
        "Worked Example and Practice",
        "Real-World Connections",
        "Common Traps and Solutions",
        "Application Challenge",
        "Mastery Summary"
    ]

    scene_sources = source_scenes(pages_map or {}, num_scenes)
    scenes = []
    for s_idx in range(num_scenes):
        s_num = s_idx + 1
        stitle = scene_titles[s_idx] if s_idx < len(scene_titles) else f"{topic_name}: Part {s_num}"
        source_page, source_text = scene_sources[s_idx]
        std_narration = f"Come explore {topic_name} with me! {source_text} Let’s pause and explain this idea together."
        scenes.append(AnimatedScene(
            scene_num=s_num, source_page=source_page,
            title=stitle,
            visual_description=f"Playful animation featuring Sparky demonstrating {stitle} with diagrams and floating highlight points.",
            narration_text=std_narration,
            narration_variants={
                "standard": std_narration,
                "simplified": f"Let’s take this one idea at a time. {source_text}",
                "short": " ".join(source_text.split()[:50])
            },
            interaction_beat="Tap the pulsing highlighted concept on screen to see its step-by-step rule."
        ))

    words = [HighlightedWord(word=next((w.strip(".,:;!?") for w in text.split() if len(w) >= 5), "Explore"),
                              key_point=" ".join(text.split()[:15]), scene_num=i + 1, source_page=page)
             for i, (page, text) in enumerate(scene_sources)]

    in_video_q = []
    for q_idx, question in enumerate(source_questions(pages_map or {}, num_questions, topic_name)):
        scene_assigned = min(num_scenes, max(1, round((q_idx + 1) * num_scenes / num_questions)))
        in_video_q.append(InVideoQuestion(scene_num=scene_assigned, **question))

    bullets = [RevisionBullet(bullet_num=i + 1, scene_num=i + 1,
                               text=" ".join(text.split()[:50]), source_page=page) for i, (page, text) in enumerate(scene_sources)]
    pairs = [WordNumberPair(left=f"Clue {i + 1}", right=" ".join(text.split()[:12]), source_page=page)
             for i, (page, text) in enumerate((scene_sources * 2)[:6])]
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

    pages_map = await get_topic_pages(db, topic)
    all_text = "\n".join(pages_map.values())
    word_count = count_words(all_text)
    if word_count == 0:
        word_count = 1200

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

    page_snippet = "\n\n".join([f"--- Page {p} ---\n{txt}" for p, txt in sorted(pages_map.items())])
    expected_q_count = min(settings.MAX_QUESTIONS_PER_TOPIC, max(settings.MIN_QUESTIONS_PER_TOPIC, round(word_count / settings.WORDS_PER_QUESTION)))
    expected_scenes_count = max(4, round(word_count / ((settings.WORDS_PER_SCENE_MIN + settings.WORDS_PER_SCENE_MAX) / 2)))

    system_prompt = (
        f"You are Agent 2 (Lesson & Revision Script Agent). You create interactive, child-safe animated lesson scripts "
        f"for Grade {grade} students based strictly on the NCERT textbook source pages.\n"
        f"Topic: {topic['name']} (Pages {topic['start_page']} to {topic['end_page']}, ~{word_count} words).\n"
        f"Requirements:\n"
        f"1. {expected_scenes_count} animated scenes (roughly 1 scene per 150-250 words) with visual_description and narration_text.\n"
        f"2. Highlighted active-listening words per scene (word, key_point, scene_num).\n"
        f"3. {expected_q_count} pop-up in-video questions (3-4 options, exactly ONE correct answer, distractors from topic terms, source_page, evidence_quote).\n"
        f"4. Revision bullets linked to scenes. Every scene needs source_page, an interaction_beat and narration_variants (standard, simplified, short).\n"
        f"Start with book exercise questions inside this topic, then add distinct easy, medium and one application question. Use plausible topic-specific distractors, never trick answers.\n"
        f"5. mini_game_config with 6 to 8 matching word/number pairs.\n"
        f"Immediately call 'submit_lesson_and_revision' with the complete payload."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Topic: '{topic['name']}'.\nSource Text:\n{page_snippet}\n\nPlease generate the lesson and revision sheet and call submit_lesson_and_revision."}
    ]

    generation_failure_reason = None
    if not settings.GROQ_API_KEY and not settings.GEMINI_API_KEY:
        lesson_data = build_deterministic_lesson(topic["name"], topic["subject_tag"], topic["start_page"], topic["end_page"], word_count, pages_map)
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
                db=db,
                max_retries=settings.QUESTION_RETRY_CAP,
                content_validator=lambda data: validate_lesson_content(data, word_count, pages_map, topic["start_page"], topic["end_page"])
            )
        except Exception as e:
            generation_failure_reason = str(e)
            try:
                await log_agent_step(db, run_id, topic_id, "lesson_revision_agent", 99, "fallback_lesson", {}, f"LLM error: {str(e)[:150]}. Using deterministic lesson.")
            except Exception:
                pass
            lesson_data = getattr(e, "payload", None) or build_deterministic_lesson(topic["name"], topic["subject_tag"], topic["start_page"], topic["end_page"], word_count, pages_map)

    # Save lesson bundle to DB
    bundle_id = str(uuid.uuid4())
    for scene in lesson_data.scenes:
        if scene.source_page is None:
            scene.source_page = sorted(pages_map)[min(len(pages_map) - 1, (scene.scene_num - 1) * len(pages_map) // len(lesson_data.scenes))]
    for bullet in lesson_data.revision_bullets:
        bullet.source_page = next((s.source_page for s in lesson_data.scenes if s.scene_num == bullet.scene_num), topic["start_page"])
    scenes_json = [{**s.model_dump(), "highlighted_words": [word.model_dump() for word in lesson_data.highlighted_words if word.scene_num == s.scene_num]} for s in lesson_data.scenes]
    bullets_json = [b.model_dump() for b in lesson_data.revision_bullets]
    mini_game_json = lesson_data.mini_game_config.model_dump()

    # Delete existing bundle if present (for re-generation)
    await db.execute("DELETE FROM lesson_bundles WHERE topic_id = ?", (topic_id,))
    await db.execute("""
        INSERT INTO lesson_bundles (id, topic_id, scenes_json, revision_bullets_json, mini_game_config, status)
        VALUES (?, ?, ?, ?, ?, 'ready')
    """, (bundle_id, topic_id, json.dumps(scenes_json), json.dumps(bullets_json), json.dumps(mini_game_json)))

    # Save in-video questions to DB with validation and code backstop
    await db.execute("DELETE FROM questions WHERE topic_id = ? AND question_type = 'in_video'", (topic_id,))
    batch_errors = validate_topic_questions(lesson_data.in_video_questions, word_count, pages_map, topic["start_page"], topic["end_page"])
    if generation_failure_reason:
        batch_errors.append(generation_failure_reason)
    for q in lesson_data.in_video_questions:
        val_res = validate_question_with_retry_and_flag(q, pages_map, topic["start_page"], topic["end_page"], settings.QUESTION_RETRY_CAP)
        if batch_errors:
            val_res.update(flagged=True, flag_reason="; ".join(batch_errors))
        q_id = str(uuid.uuid4())
        q_data = {
            "question_text": q.question_text,
            "options": q.options,
            "scene_num": q.scene_num,
            "evidence_quote": q.evidence_quote,
            "difficulty": q.difficulty,
            "answer_index": q.options.index(q.correct_answer)
        }
        await db.execute("""
            INSERT INTO questions (
                id, topic_id, question_type, question_data, correct_answer,
                hint_text, explanation_text, source_page, status, flagged, flag_reason
            )
            VALUES (?, ?, 'in_video', ?, ?, ?, ?, ?, 'active', ?, ?)
        """, (
            q_id, topic_id, json.dumps(q_data), q.correct_answer,
            q.hint_text, q.explanation_text, q.source_page,
            1 if val_res["flagged"] else 0, val_res["flag_reason"]
        ))

    await db.commit()
    return lesson_data

