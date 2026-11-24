import pytest
import uuid
import json
from app.config import settings
from app.agents.tools import split_sections, count_words
from app.agents.validators import (
    validate_single_correct_option,
    validate_option_count,
    validate_question_count_for_topic,
    validate_grounding_evidence,
    validate_question_with_retry_and_flag
)
from app.agents.lesson_revision_agent import build_deterministic_lesson
from app.agents.chunking_agent import run_textbook_chunking_agent
from app.db import init_db, get_db

@pytest.fixture(autouse=True)
async def setup_database():
    await init_db()

# -----------------------------------------------------------------------------
# 1. A 4-page chapter becomes one topic
# -----------------------------------------------------------------------------
def test_four_page_chapter_becomes_one_topic():
    # 4 pages, ~800 words total
    pages = [
        {"page_number": 1, "text": "Chapter 1: Shapes and Space\nLet us begin our exploration of spatial patterns. " + "Circle square triangle rectangle. " * 30},
        {"page_number": 2, "text": "Looking at spatial borders and straight edges. " + "Straight lines and curved curves form shapes. " * 30},
        {"page_number": 3, "text": "Worked Example: Identifying shapes in classroom doors and windows. " + "Count vertices and faces accurately. " * 30},
        {"page_number": 4, "text": "Chapter Summary and Review Exercises. " + "Test your understanding of flat 2D shapes and 3D solids. " * 30}
    ]
    total_words = sum(count_words(p["text"]) for p in pages)
    assert len(pages) <= settings.SMALL_CHAPTER_MAX_PAGES
    assert total_words <= settings.SMALL_CHAPTER_MAX_WORDS

    topics = split_sections(pages, chapter_title="Shapes and Space", chapter_number=1)
    
    assert len(topics) == 1
    t = topics[0]
    assert t["topic_number"] == 1
    assert t["start_page"] == 1
    assert t["end_page"] == 4
    assert t["decision_trace"] == "Chapter is short, kept as one topic"
    assert "Shapes and Space" in t["name"]
    assert t["word_count"] == total_words

# -----------------------------------------------------------------------------
# 2. A 30-page chapter becomes topics of ~1200 words each (none broken in headings/examples)
# -----------------------------------------------------------------------------
def test_thirty_page_chapter_split_into_topics():
    # 30 pages with 5 natural sections, each having ~1200 words (total ~6000 words)
    section_titles = [
        "Brick Patterns in Architecture",
        "Floor Designs and Symmetry",
        "Arch Construction Principles",
        "Measuring Wall Dimensions",
        "Estimating Brick Requirements"
    ]
    pages = []
    page_counter = 1

    for s_idx, title in enumerate(section_titles):
        # 6 pages per section = 30 pages total
        for p_in_sec in range(6):
            if p_in_sec == 0:
                p_text = f"Topic {s_idx + 1}: {title}\nIn this section, we study authentic architectural patterns.\n"
                p_text += "Masons lay bricks with alternating courses to guarantee structural load distribution. " * 15
            elif p_in_sec == 2:
                # Includes an atomic worked problem that must never be split
                p_text = "Worked Example: Calculating load forces on a curved arch.\n"
                p_text += "Step 1: Count wedge stones. Step 2: Multiply by load constant. Step 3: Verify symmetry.\n"
                p_text += "Observe how lateral thrust transfers downward into foundation piers safely. " * 12
            else:
                p_text = f"Detailed architectural principles and measurement steps for {title}.\n"
                p_text += "Precise calculations ensure safety and long-lasting stability in all masonry structures. " * 15
            
            pages.append({"page_number": page_counter, "text": p_text})
            page_counter += 1

    assert len(pages) == 30
    total_words = sum(count_words(p["text"]) for p in pages)
    assert total_words > settings.SMALL_CHAPTER_MAX_WORDS  # Must be a large chapter

    topics = split_sections(pages, chapter_title="Building with Bricks", chapter_number=1)

    # Must be split into multiple topics
    assert len(topics) >= 4
    assert topics[0]["decision_trace"] == f"Chapter is long, split into {len(topics)} topics"

    # Verify word count bounds and atomic blocks
    for t in topics:
        assert t["word_count"] >= settings.TOPIC_MIN_WORDS, f"Topic '{t['name']}' has {t['word_count']} words, below MIN ({settings.TOPIC_MIN_WORDS})"
        assert t["word_count"] <= settings.TOPIC_MAX_WORDS, f"Topic '{t['name']}' has {t['word_count']} words, above MAX ({settings.TOPIC_MAX_WORDS})"
        assert len(t["name"]) > 2
        assert t["start_page"] <= t["end_page"]
        # Ensure worked example wasn't truncated
        if "Worked Example:" in t["text"]:
            assert "Step 1: Count wedge stones" in t["text"]
            assert "foundation piers safely" in t["text"]

# -----------------------------------------------------------------------------
# 3. A very long heading block splits into "part 1/2"
# -----------------------------------------------------------------------------
def test_very_long_heading_block_splits_into_parts():
    # Single heading block with 3000 words (exceeds TOPIC_MAX_WORDS = 1800)
    pages = []
    # 10 pages, each 300 words under one heading = 3000 words
    for p_num in range(1, 11):
        if p_num == 1:
            header = "Topic 1: Monolithic Structural Foundations\n"
        else:
            header = ""
        body = "Understanding deep bedrock excavation and concrete load distributions in foundation engineering. " * 25
        pages.append({"page_number": p_num, "text": header + body})

    total_words = sum(count_words(p["text"]) for p in pages)
    assert total_words > settings.TOPIC_MAX_WORDS

    topics = split_sections(pages, chapter_title="Civil Foundations", chapter_number=1)

    assert len(topics) >= 2
    # Verify sub-topic naming: "Topic name, part 1/2"
    assert "part 1/" in topics[0]["name"]
    assert "part 2/" in topics[1]["name"]
    for t in topics:
        assert t["word_count"] >= settings.TOPIC_MIN_WORDS

# -----------------------------------------------------------------------------
# 4. Every topic has 4 to 8 questions, each with one correct option
# -----------------------------------------------------------------------------
def test_every_topic_has_four_to_eight_questions():
    test_word_counts = [800, 1200, 1600, 2400]
    pages_map = {
        1: "Murshidabad brick patterns display arches built with wedge-shaped stones.",
        2: "Floor circles feature central symmetry and radial alignment.",
        3: "Load calculations help masons determine exact brick quantities."
    }

    for wc in test_word_counts:
        lesson_data = build_deterministic_lesson(
            topic_name="Brick Geometry",
            subject_tag="Maths",
            start_page=1,
            end_page=3,
            word_count=wc,
            pages_map=pages_map
        )
        questions = lesson_data.in_video_questions
        q_count = len(questions)

        # Count must scale between 4 and 8
        assert settings.MIN_QUESTIONS_PER_TOPIC <= q_count <= settings.MAX_QUESTIONS_PER_TOPIC

        for q in questions:
            # 3 to 4 options
            assert settings.CHOICE_COUNT_MIN <= len(q.options) <= settings.CHOICE_COUNT_MAX

            # Exactly one correct option
            ok_single, err_single = validate_single_correct_option(q)
            assert ok_single is True, err_single

            # No duplicate options
            ok_opt, err_opt = validate_option_count(q)
            assert ok_opt is True, err_opt

            # Source page lies inside topic page range
            assert 1 <= q.source_page <= 3

            # Evidence quote present
            assert q.evidence_quote is not None and len(q.evidence_quote) > 5

        # Check difficulty mix: easy, medium, and application
        diffs = [q.difficulty for q in questions]
        assert "application" in diffs
        assert "easy" in diffs
        assert "medium" in diffs

# -----------------------------------------------------------------------------
# 5. Question with two correct options or none is rejected, retried, then flagged
# -----------------------------------------------------------------------------
def test_question_two_or_zero_correct_options_rejected_and_flagged():
    pages_map = {1: "Arches in ancient buildings are constructed from curved wedge-shaped stones."}

    # Case A: 0 correct options in options
    q_zero = {
        "question_text": "What shape is used in arches?",
        "options": ["Flat", "Square", "Straight", "None"],
        "correct_answer": "Curved",  # Not in options!
        "source_page": 1,
        "evidence_quote": "constructed from curved wedge-shaped stones"
    }

    # Initial attempt: rejected and retry requested
    res_retry = validate_question_with_retry_and_flag(q_zero, pages_map, start_page=1, end_page=2, retry_count=0)
    assert res_retry["valid"] is False
    assert res_retry["retry_needed"] is True
    assert res_retry["flagged"] is False

    # After retry cap (retry_count=2): flagged for parent review
    res_flagged = validate_question_with_retry_and_flag(q_zero, pages_map, start_page=1, end_page=2, retry_count=2)
    assert res_flagged["valid"] is False
    assert res_flagged["retry_needed"] is False
    assert res_flagged["flagged"] is True
    assert "does not appear in options" in res_flagged["flag_reason"]

    # Case B: 2 identical matching correct options
    q_two = {
        "question_text": "Select the arch shape",
        "options": ["Curved", "Square", "Curved", "Flat"],
        "correct_answer": "Curved",
        "source_page": 1,
        "evidence_quote": "constructed from curved wedge-shaped stones"
    }
    res_two_retry = validate_question_with_retry_and_flag(q_two, pages_map, start_page=1, end_page=2, retry_count=0)
    assert res_two_retry["valid"] is False
    assert res_two_retry["retry_needed"] is True

    res_two_flag = validate_question_with_retry_and_flag(q_two, pages_map, start_page=1, end_page=2, retry_count=2)
    assert res_two_flag["valid"] is False
    assert res_two_flag["flagged"] is True
    assert "Multiple options" in res_two_flag["flag_reason"]

# -----------------------------------------------------------------------------
# 6. Existing approved content is unchanged by the migration / re-run
# -----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_existing_approved_content_unchanged_by_rerun():
    db = await get_db()
    textbook_id = str(uuid.uuid4())
    parent_id = str(uuid.uuid4())

    # Create profile and textbook
    await db.execute("""
        INSERT INTO profiles (id, name, email, consent_given)
        VALUES (?, 'Test Parent', ?, 1)
    """, (parent_id, f"preserve_{uuid.uuid4().hex[:6]}@example.com"))

    await db.execute("""
        INSERT INTO textbooks (id, parent_id, grade, subject_tag, title, ncert_code, page_count)
        VALUES (?, ?, 4, 'Maths', 'Building with Bricks', 'ncert_m4_1', 6)
    """, (textbook_id, parent_id))

    # Insert 6 source pages
    for p_num in range(1, 7):
        await db.execute("""
            INSERT INTO source_pages (id, textbook_id, page_number, text)
            VALUES (?, ?, ?, ?)
        """, (str(uuid.uuid4()), textbook_id, p_num, f"Page {p_num}: Authentic source text for brick patterns."))

    # Insert an existing APPROVED topic (old split, version 1)
    approved_topic_id = str(uuid.uuid4())
    await db.execute("""
        INSERT INTO topics (
            id, textbook_id, chapter_number, chapter_title, chapter_name,
            topic_number, name, description, subject_tag, start_page, end_page, status, version
        )
        VALUES (?, ?, 1, 'Building with Bricks', 'Building with Bricks', 1, 'Old Approved Topic', 'Approved lesson', 'Maths', 1, 6, 'approved', 1)
    """, (approved_topic_id, textbook_id))
    await db.commit()

    # Verify approved topic exists in DB
    cur = await db.execute("SELECT * FROM topics WHERE textbook_id = ? AND status = 'approved'", (textbook_id,))
    approved_before = await cur.fetchall()
    assert len(approved_before) == 1
    assert approved_before[0]["id"] == approved_topic_id

    # Now simulate re-running Agent 1 (textbook chunking) on the existing textbook
    res = await run_textbook_chunking_agent(textbook_id, grade=4, subject_tag="Maths", db=db)
    
    # 1. Old approved topic must STILL exist with status='approved' and version=1
    cur = await db.execute("SELECT * FROM topics WHERE id = ?", (approved_topic_id,))
    old_topic = await cur.fetchone()
    assert old_topic is not None, "Old approved topic was deleted! Existing approved data must be preserved."
    assert old_topic["status"] == "approved"
    assert old_topic["version"] == 1

    # 2. Newly generated topic(s) from re-run must show as new version needing parent approval
    cur = await db.execute("SELECT * FROM topics WHERE textbook_id = ? AND id != ?", (textbook_id, approved_topic_id))
    new_topics = await cur.fetchall()
    assert len(new_topics) >= 1
    for nt in new_topics:
        assert nt["version"] == 2, "New re-run topics must increment version"
        assert nt["status"] == "needs_review", "New re-run topics must have status 'needs_review' awaiting parent approval"

    # 3. Child query (active approved topics) only returns the approved topic
    cur = await db.execute("SELECT * FROM topics WHERE textbook_id = ? AND status = 'approved'", (textbook_id,))
    live_child_topics = await cur.fetchall()
    assert len(live_child_topics) == 1
    assert live_child_topics[0]["id"] == approved_topic_id

    await db.close()

# -----------------------------------------------------------------------------
# 7. Bug 2: (a) Short single-activity worksheet stays 1 topic
# -----------------------------------------------------------------------------
def test_short_single_activity_worksheet_stays_one_topic():
    pages = [
        {"page_number": 1, "text": "Worksheet: Geometric Shapes\nActivity: Look around your classroom and list all objects shaped like a circle, square, or triangle.\nDraw each shape in the box provided below."}
    ]
    topics = split_sections(pages, chapter_title="Geometry Practice Worksheet", chapter_number=1)
    assert len(topics) == 1
    t = topics[0]
    assert t["topic_number"] == 1
    assert t["start_page"] == 1
    assert t["end_page"] == 1
    assert t["decision_trace"] == "Chapter is short, kept as one topic"

# -----------------------------------------------------------------------------
# 8. Bug 2: (b) Short chapter with multiple pedagogical activity types splits into sub-topics
# -----------------------------------------------------------------------------
def test_short_chapter_with_multiple_pedagogical_activities_splits_into_subtopics():
    # 8-page chapter modelled after Santoor Grade 4 "Together We Can"
    pages = [
        {"page_number": 1, "text": "Together We Can\nPoem: Two little birds sitting in a tree, singing sweet songs for you and me. Together they build a nest with straw and leaves."},
        {"page_number": 2, "text": "Let us Recite\nRead the poem aloud with your partner. Notice how rhythm and rhyming words create joyful harmony across each verse."},
        {"page_number": 3, "text": "Let us Think\nWhy did the birds work together? What happens when friends help each other during difficult tasks? Answer in your own words."},
        {"page_number": 4, "text": "Let us Speak\nDiscuss with your classmates about a time when you and your family cooperated to clean the house or prepare dinner."},
        {"page_number": 5, "text": "Let us Learn\nNew Vocabulary Words: Nest, Straw, Twigs, Harmony, Cooperate. Learn their definitions and use them in full sentences."},
        {"page_number": 6, "text": "Let us Write\nWrite a short paragraph about how your school team worked together to win an exciting sports relay race."},
        {"page_number": 7, "text": "Let us Do\nProject Time: Gather fallen leaves and twigs from the school garden and create a miniature model nest with clay."},
        {"page_number": 8, "text": "Worked Example: Model Presentation Steps\nStep 1: Explain your nest design. Step 2: List the natural materials used. Step 3: Present proudly."}
    ]
    topics = split_sections(pages, chapter_title="Together We Can", chapter_number=1)
    # Must produce distinct sub-topics for the distinct activities
    assert len(topics) >= 5, f"Expected multiple sub-topics, got {len(topics)}"
    
    # Check that pedagogical activity markers appear in the sub-topic names and rules
    topic_names = [t["name"] for t in topics]
    assert any("Recite" in name for name in topic_names)
    assert any("Think" in name for name in topic_names)
    assert any("Speak" in name for name in topic_names)
    assert any("Write" in name or "Learn" in name for name in topic_names)

    # Verify atomic worked example was preserved intact
    we_topics = [t for t in topics if "Worked Example" in t["text"]]
    assert len(we_topics) == 1
    assert "Step 1: Explain your nest design" in we_topics[0]["text"]
    assert "Step 3: Present proudly" in we_topics[0]["text"]

    # Verify boundary rules recorded in decision_trace
    for t in topics:
        assert len(t["decision_trace"]) > 0
        assert "pedagogical_marker" in t["decision_trace"] or "heading" in t["decision_trace"].lower() or "activity" in t["decision_trace"].lower() or "topic" in t["decision_trace"].lower()

# -----------------------------------------------------------------------------
# 9. Bug 2: (c) Simulated full textbook with 10+ chapters produces 10+ separate chapter entries
# -----------------------------------------------------------------------------
def test_simulated_full_textbook_ten_plus_chapters_produces_separate_chapters():
    from app.agents.chunking_agent import extract_curriculum_structure
    pages = []
    chapter_names = [
        "Real Numbers", "Polynomials", "Linear Equations", "Quadratic Equations",
        "Arithmetic Progressions", "Triangles", "Coordinate Geometry",
        "Introduction to Trigonometry", "Circles", "Constructions", "Surface Areas and Volumes"
    ]
    # 3 pages per chapter = 33 pages total
    page_num = 1
    for i, ch_name in enumerate(chapter_names):
        pages.append({"page_number": page_num, "text": f"Chapter {i + 1}: {ch_name}\nFundamental mathematical principles and definitions of {ch_name}."})
        pages.append({"page_number": page_num + 1, "text": f"Worked Example on {ch_name} with step-by-step solutions and analysis."})
        pages.append({"page_number": page_num + 2, "text": f"Exercise {i + 1}.1: Practice questions on {ch_name}."})
        page_num += 3

    submission = extract_curriculum_structure(pages, textbook_title="Mathematics Grade 10", subject_tag="Maths")
    
    # Must produce 11 distinct chapter entries (not merged into 1 blob or truncated)
    assert len(submission.chapters) == 11
    for idx, ch in enumerate(submission.chapters):
        assert ch.chapter_number == idx + 1
        assert chapter_names[idx].lower() in ch.chapter_title.lower()
        assert ch.start_page == idx * 3 + 1
        assert ch.end_page == idx * 3 + 3
        assert len(ch.topics) >= 1
