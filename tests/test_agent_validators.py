import pytest
from pydantic import ValidationError
from app.models.schemas import (
    SubmitTopicChunksPayload,
    TopicChunkItem,
    SubTopicChunk,
    ChapterChunk,
    CurriculumHierarchySubmission,
    SubmitLessonAndRevisionPayload,
    AnimatedScene,
    HighlightedWord,
    InVideoQuestion,
    RevisionBullet,
    WordNumberPair,
    MiniGameConfig,
    SubmitQuizSetsPayload,
    QuizQuestion
)
from app.agents.tools import check_reading_level, calculator, check_grounding
from app.agents.quiz_agent import run_code_backstop
from app.services.pdf_ncert import validate_selectable_text

# -------------------------------------------------------------------
# Agent 1 Hierarchical Validator Tests
# -------------------------------------------------------------------
def test_curriculum_hierarchy_submission_valid():
    submission = CurriculumHierarchySubmission(
        subject_tag="Science",
        chapters=[
            ChapterChunk(
                chapter_number=1,
                chapter_title="Living and Non-Living Things",
                start_page=1,
                end_page=12,
                topics=[
                    SubTopicChunk(
                        topic_number=1,
                        name="Characteristics of Living Things",
                        summary="Overview of growth, breathing, and movement.",
                        start_page=1,
                        end_page=6
                    ),
                    SubTopicChunk(
                        topic_number=2,
                        name="Habitats & Surroundings",
                        summary="How living things interact with their environment.",
                        start_page=7,
                        end_page=12
                    )
                ]
            )
        ]
    )
    assert len(submission.chapters) == 1
    assert submission.chapters[0].chapter_number == 1
    assert len(submission.chapters[0].topics) == 2
    assert submission.chapters[0].topics[0].start_page == 1

def test_chapter_chunk_invalid_page_order():
    with pytest.raises(ValidationError) as exc:
        ChapterChunk(
            chapter_number=1,
            chapter_title="Invalid Chapter",
            start_page=15,
            end_page=5,
            topics=[
                SubTopicChunk(
                    topic_number=1,
                    name="SubTopic 1",
                    summary="Summary 1",
                    start_page=15,
                    end_page=15
                )
            ]
        )
    assert "start_page (15) cannot be greater than end_page (5)" in str(exc.value)

def test_sub_topic_chunk_invalid_page_order():
    with pytest.raises(ValidationError) as exc:
        SubTopicChunk(
            topic_number=1,
            name="Invalid SubTopic",
            summary="Summary",
            start_page=10,
            end_page=4
        )
    assert "start_page (10) cannot be greater than end_page (4)" in str(exc.value)

def test_selectable_text_validator():
    # Blank / image-only pages without text should raise error
    with pytest.raises(ValueError) as exc:
        validate_selectable_text([{"page_number": 1, "text": ""}, {"page_number": 2, "text": "   "}])
    assert "no_selectable_text" in str(exc.value)

    # Pages with sufficient selectable text should pass
    validate_selectable_text([{"page_number": 1, "text": "This is a full paragraph of selectable digital textbook text containing plenty of characters for validation."}])
def test_topic_chunks_valid():
    payload = SubmitTopicChunksPayload(
        subject_tag="Maths",
        chapter_title="Building with Bricks",
        topics_list=[
            TopicChunkItem(name="Brick Patterns", start_page=1, end_page=4),
            TopicChunkItem(name="Floor and Wall Patterns", start_page=5, end_page=9)
        ]
    )
    assert len(payload.topics_list) == 2
    assert payload.topics_list[0].start_page == 1

def test_topic_chunks_invalid_page_order():
    with pytest.raises(ValidationError) as exc:
        SubmitTopicChunksPayload(
            subject_tag="Maths",
            chapter_title="Building with Bricks",
            topics_list=[
                TopicChunkItem(name="Invalid Range", start_page=10, end_page=4)
            ]
        )
    assert "start_page (10) cannot be greater than end_page (4)" in str(exc.value)

def test_topic_chunks_empty_list():
    with pytest.raises(ValidationError):
        SubmitTopicChunksPayload(
            subject_tag="Maths",
            chapter_title="Empty",
            topics_list=[]
        )

# -------------------------------------------------------------------
# Agent 2 Validator Tests
# -------------------------------------------------------------------
def test_lesson_and_revision_valid():
    scenes = [
        AnimatedScene(scene_num=i, title=f"Scene {i}", visual_description="Illustration of bricks and arch patterns", narration_text=f"Welcome to lesson scene {i} on patterns and shapes.")
        for i in range(1, 5)
    ]
    words = [
        HighlightedWord(word="Arch", key_point="A curved symmetrical structure spanning an opening", scene_num=1)
    ]
    in_video = [
        InVideoQuestion(
            scene_num=1,
            question_text="What shape is the arch in the temple?",
            options=["Curved", "Square", "Straight", "None"],
            correct_answer="Curved",
            hint_text="Look at the top curve.",
            explanation_text="An arch is curved.",
            source_page=1
        )
    ]
    bullets = [
        RevisionBullet(bullet_num=1, scene_num=1, text="Arches provide strong curved support.")
    ]
    pairs = [
        WordNumberPair(left=f"L{i}", right=f"R{i}") for i in range(1, 7)
    ]
    payload = SubmitLessonAndRevisionPayload(
        scenes=scenes,
        highlighted_words=words,
        in_video_questions=in_video,
        revision_bullets=bullets,
        mini_game_config=MiniGameConfig(pairs=pairs)
    )
    assert len(payload.scenes) == 4
    assert len(payload.mini_game_config.pairs) == 6

def test_lesson_scenes_too_few():
    scenes = [
        AnimatedScene(scene_num=1, title="Solo", visual_description="Too short visual description", narration_text="Narration that is long enough.")
    ]
    pairs = [WordNumberPair(left=f"L{i}", right=f"R{i}") for i in range(1, 7)]
    with pytest.raises(ValidationError):
        SubmitLessonAndRevisionPayload(
            scenes=scenes,
            highlighted_words=[],
            in_video_questions=[],
            revision_bullets=[],
            mini_game_config=MiniGameConfig(pairs=pairs)
        )

def test_in_video_question_correct_answer_not_in_options():
    with pytest.raises(ValidationError) as exc:
        InVideoQuestion(
            scene_num=1,
            question_text="What is 2 + 2?",
            options=["3", "5", "6"],
            correct_answer="4",
            hint_text="Think of 2 pairs",
            explanation_text="2 plus 2 equals 4",
            source_page=1
        )
    assert "correct_answer '4' must be one of options" in str(exc.value)

def test_mini_game_config_invalid_pair_count():
    # Less than 6 pairs must fail
    pairs = [WordNumberPair(left=f"L{i}", right=f"R{i}") for i in range(1, 5)]
    with pytest.raises(ValidationError):
        MiniGameConfig(pairs=pairs)

# -------------------------------------------------------------------
# Agent 3 Validator Tests
# -------------------------------------------------------------------
def test_quiz_sets_valid_10_questions():
    set_a = [
        QuizQuestion(
            question_text=f"Question A{i}: What is the primary characteristic of brick bond {i}?",
            options=["Strong overlap", "Weak joint", "Cracked surface", "Loose sand"],
            correct_answer="Strong overlap",
            hint_text="Remember how bricks alternate.",
            explanation_text="Alternating layers create strong overlap.",
            source_page=1
        )
        for i in range(1, 11)
    ]
    set_b = [
        QuizQuestion(
            question_text=f"Question B{i}: How is an arch constructed in structure {i}?",
            options=["Curved wedge bricks", "Flat wooden planks", "Loose gravel", "Soft mud"],
            correct_answer="Curved wedge bricks",
            hint_text="Notice the wedge shape of each stone.",
            explanation_text="Wedge stones transfer weight sideways in arches.",
            source_page=2
        )
        for i in range(1, 11)
    ]
    payload = SubmitQuizSetsPayload(quiz_set_a=set_a, quiz_set_b=set_b)
    assert len(payload.quiz_set_a) == 10
    assert len(payload.quiz_set_b) == 10

def test_quiz_sets_fewer_than_10_fails():
    set_a = [
        QuizQuestion(
            question_text=f"Question {i}: Identifying the core structure?",
            options=["Option A", "Option B"],
            correct_answer="Option A",
            hint_text="Hint for question",
            explanation_text="Explanation for question",
            source_page=1
        )
        for i in range(1, 9)  # Only 8 questions
    ]
    set_b = [
        QuizQuestion(
            question_text=f"Question {i}: Identifying the secondary structure?",
            options=["Option A", "Option B"],
            correct_answer="Option A",
            hint_text="Hint for question",
            explanation_text="Explanation for question",
            source_page=1
        )
        for i in range(1, 11)
    ]
    with pytest.raises(ValidationError):
        SubmitQuizSetsPayload(quiz_set_a=set_a, quiz_set_b=set_b)

# -------------------------------------------------------------------
# Deterministic Tools & Code Backstop Tests
# -------------------------------------------------------------------
def test_calculator_tool():
    assert calculator(12, "+", 15)["result"] == 27
    assert calculator(10, "*", 5)["result"] == 50
    assert calculator(100, "/", 4)["result"] == 25
    assert calculator(7, "/", 0)["success"] is False

def test_check_reading_level_tool():
    text = "The cat sat on the mat. The sun was hot. We had fun in the park."
    res = check_reading_level(text, target_grade=2)
    assert res["suitable"] is True
    assert "calculated_grade" in res

def test_check_grounding_tool():
    page_text = "Brick patterns in Murshidabad mosque show intricate jali work and curved arches built by master masons."
    q1 = "What kind of jali work and curved arches are found in the Murshidabad mosque?"
    q2 = "Explain the quantum mechanical spin of radioactive isotopes in astrophysics."
    assert check_grounding(q1, page_text)["grounded"] is True
    assert check_grounding(q2, page_text)["grounded"] is False

def test_run_code_backstop():
    pages_map = {
        1: "Murshidabad brick patterns with curved arches and jali screens.",
        2: "Floor patterns and circle brick designs found in ancient forts."
    }
    questions = [
        # Well grounded in page 1
        QuizQuestion(
            question_text="What curved arches and jali screens are seen in Murshidabad?",
            options=["Brick patterns", "Iron gates", "Glass windows", "Plastic sheets"],
            correct_answer="Brick patterns",
            hint_text="Look at Murshidabad patterns",
            explanation_text="Brick patterns have curved arches",
            evidence_quote="Murshidabad brick patterns with curved arches and jali screens.",
            source_page=1
        ),
        # Source page outside topic range (topic is pages 1-2, page is 9)
        QuizQuestion(
            question_text="What curved arches are seen in the construction?",
            options=["Brick", "Stone"],
            correct_answer="Brick",
            hint_text="Check the material used",
            explanation_text="Brick is the primary material",
            source_page=9
        ),
        # Ungrounded question
        QuizQuestion(
            question_text="What is the speed of light in vacuum?",
            options=["300000 km/s", "1000 km/s"],
            correct_answer="300000 km/s",
            hint_text="Fundamental physics constant",
            explanation_text="Light travels at approximately 300000 km per second",
            source_page=1
        )
    ]
    processed = run_code_backstop(questions, start_page=1, end_page=2, pages_map=pages_map)
    assert len(processed) == 3
    assert processed[0]["flagged"] is False
    assert processed[1]["flagged"] is True
    assert "outside topic page range" in processed[1]["flag_reason"]
    assert processed[2]["flagged"] is True
    assert "evidence quote" in processed[2]["flag_reason"]

# -------------------------------------------------------------------
# New Chunking Policy & Question Scaling Validators Tests
# -------------------------------------------------------------------
from app.agents.validators import (
    validate_single_correct_option,
    validate_option_count,
    calculate_expected_question_count,
    validate_question_count_for_topic,
    validate_grounding_evidence,
    recompute_arithmetic_in_options,
    validate_topic_chunk_policy,
    validate_question_with_retry_and_flag
)

def test_validate_single_correct_option():
    # Valid: exactly 1 matching option
    q_valid = {
        "question_text": "What material is used to construct arches?",
        "options": ["Wedge bricks", "Soft grass", "Loose sand", "Ice cubes"],
        "correct_answer": "Wedge bricks"
    }
    ok, err = validate_single_correct_option(q_valid)
    assert ok is True
    assert err is None

    # Invalid: 0 matching options
    q_no_match = {
        "question_text": "What material is used to construct arches?",
        "options": ["Wood", "Soft grass", "Loose sand"],
        "correct_answer": "Wedge bricks"
    }
    ok, err = validate_single_correct_option(q_no_match)
    assert ok is False
    assert "does not appear in options" in err

    # Invalid: multiple matching options
    q_multi = {
        "question_text": "Select correct answer",
        "options": ["Brick", "Stone", "Brick", "Wood"],
        "correct_answer": "Brick"
    }
    ok, err = validate_single_correct_option(q_multi)
    assert ok is False
    assert "Multiple options" in err

def test_validate_option_count():
    # 3 options (allowed)
    q3 = {"options": ["A", "B", "C"], "correct_answer": "A"}
    ok, err = validate_option_count(q3, min_count=3, max_count=4)
    assert ok is True

    # 4 options (allowed)
    q4 = {"options": ["A", "B", "C", "D"], "correct_answer": "A"}
    ok, err = validate_option_count(q4, min_count=3, max_count=4)
    assert ok is True

    # 2 options (too few)
    q2 = {"options": ["A", "B"], "correct_answer": "A"}
    ok, err = validate_option_count(q2, min_count=3, max_count=4)
    assert ok is False
    assert "outside allowed range" in err

    # 5 options (too many)
    q5 = {"options": ["A", "B", "C", "D", "E"], "correct_answer": "A"}
    ok, err = validate_option_count(q5, min_count=3, max_count=4)
    assert ok is False
    assert "outside allowed range" in err

    # Duplicate options (must fail)
    q_dup = {"options": ["Arch", "Wall", "Floor", "Arch"], "correct_answer": "Arch"}
    ok, err = validate_option_count(q_dup, min_count=3, max_count=4)
    assert ok is False
    assert "contain duplicates" in err

def test_validate_question_count_for_topic():
    # Expected question scaling calculation
    assert calculate_expected_question_count(800) == 4
    assert calculate_expected_question_count(1200) == 6
    assert calculate_expected_question_count(1600) == 8
    assert calculate_expected_question_count(2500) == 8
    assert calculate_expected_question_count(300) == 4

    # 4 to 8 questions allowed
    ok, err = validate_question_count_for_topic([1, 2, 3, 4, 5, 6], word_count=1200)
    assert ok is True

    # Too few (< 4)
    ok, err = validate_question_count_for_topic([1, 2, 3], word_count=1200)
    assert ok is False
    assert "outside allowed bounds" in err

    # Too many (> 8)
    ok, err = validate_question_count_for_topic(list(range(9)), word_count=1800)
    assert ok is False
    assert "outside allowed bounds" in err

def test_validate_grounding_evidence():
    pages_map = {
        1: "Murshidabad brick patterns display arches built with wedge-shaped stones.",
        2: "Floor circles feature central symmetry and radial alignment."
    }
    # Valid grounding with evidence quote
    q_good = {
        "question_text": "What stones are used in Murshidabad arches?",
        "options": ["Wedge-shaped stones", "Flat glass", "Clay mud"],
        "correct_answer": "Wedge-shaped stones",
        "evidence_quote": "arches built with wedge-shaped stones",
        "source_page": 1
    }
    ok, err = validate_grounding_evidence(q_good, pages_map, start_page=1, end_page=2)
    assert ok is True

    # Outside page range
    q_out_page = dict(q_good, source_page=5)
    ok, err = validate_grounding_evidence(q_out_page, pages_map, start_page=1, end_page=2)
    assert ok is False
    assert "outside topic page range" in err

    # Ungrounded quote
    q_bad_quote = dict(q_good, evidence_quote="Quantum electrodynamics in black hole event horizons")
    ok, err = validate_grounding_evidence(q_bad_quote, pages_map, start_page=1, end_page=2)
    assert ok is False
    assert "below threshold" in err

def test_recompute_arithmetic_in_options():
    # Correct arithmetic
    q_correct_math = {
        "question_text": "If a mason lays 12 bricks per row across 5 rows, how many bricks are laid (12 * 5)?",
        "options": ["60 bricks", "50 bricks", "70 bricks"],
        "correct_answer": "60 bricks"
    }
    ok, err = recompute_arithmetic_in_options(q_correct_math)
    assert ok is True

    # Incorrect arithmetic designating wrong answer
    q_wrong_math = {
        "question_text": "What is 12 + 15?",
        "options": ["27", "30", "25"],
        "correct_answer": "30"
    }
    ok, err = recompute_arithmetic_in_options(q_wrong_math)
    assert ok is False
    assert "Arithmetic mismatch" in err

    # Non-math question passes cleanly
    q_non_math = {
        "question_text": "What shape is the arch?",
        "options": ["Curved", "Square", "Straight"],
        "correct_answer": "Curved"
    }
    ok, err = recompute_arithmetic_in_options(q_non_math)
    assert ok is True

def test_validate_topic_chunk_policy():
    # Small chapter: 4 pages, 1500 words must produce exactly 1 topic
    small_single = [{"name": "Chapter 1", "word_count": 1500}]
    ok, err = validate_topic_chunk_policy(small_single, chapter_pages_count=4, chapter_word_count=1500)
    assert ok is True

    # Small chapter producing 2 topics must fail
    small_multi = [{"name": "Part 1", "word_count": 750}, {"name": "Part 2", "word_count": 750}]
    ok, err = validate_topic_chunk_policy(small_multi, chapter_pages_count=4, chapter_word_count=1500)
    assert ok is False
    assert "must produce exactly 1 topic" in err

    # Large chapter: no topic below TOPIC_MIN_WORDS (800)
    large_valid = [
        {"name": "Topic 1", "word_count": 1200},
        {"name": "Topic 2", "word_count": 1100},
        {"name": "Topic 3", "word_count": 1400}
    ]
    ok, err = validate_topic_chunk_policy(large_valid, chapter_pages_count=20, chapter_word_count=3700)
    assert ok is True

    # Large chapter: topic below TOPIC_MIN_WORDS must fail
    large_invalid = [
        {"name": "Topic 1", "word_count": 1200},
        {"name": "Topic 2", "word_count": 650}  # below 800
    ]
    ok, err = validate_topic_chunk_policy(large_invalid, chapter_pages_count=20, chapter_word_count=3200)
    assert ok is False
    assert "below TOPIC_MIN_WORDS" in err

def test_validate_question_with_retry_and_flag():
    pages_map = {1: "Arches in ancient buildings are constructed from curved wedge-shaped stones."}
    valid_q = {
        "question_text": "What stones are used to construct arches?",
        "options": ["Curved wedge-shaped stones", "Flat glass panels", "Cardboard boxes", "Mud bricks"],
        "correct_answer": "Curved wedge-shaped stones",
        "evidence_quote": "constructed from curved wedge-shaped stones",
        "source_page": 1
    }
    # Valid question: no retry, not flagged
    res = validate_question_with_retry_and_flag(valid_q, pages_map, start_page=1, end_page=2, retry_count=0)
    assert res["valid"] is True
    assert res["retry_needed"] is False
    assert res["flagged"] is False

    # Invalid question (no correct answer in options) on first attempt (retry_count=0): retry needed
    bad_q = dict(valid_q, correct_answer="Non-existent answer")
    res_retry = validate_question_with_retry_and_flag(bad_q, pages_map, start_page=1, end_page=2, retry_count=0)
    assert res_retry["valid"] is False
    assert res_retry["retry_needed"] is True
    assert res_retry["flagged"] is False

    # Invalid question after retry cap reached (retry_count=2): flagged for parent
    res_flagged = validate_question_with_retry_and_flag(bad_q, pages_map, start_page=1, end_page=2, retry_count=2)
    assert res_flagged["valid"] is False
    assert res_flagged["retry_needed"] is False
    assert res_flagged["flagged"] is True
    assert "does not appear in options" in res_flagged["flag_reason"]

