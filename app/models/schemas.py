from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

# -------------------------------------------------------------
# 1. Auth & Profiles
# -------------------------------------------------------------
class ParentSignupRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6)
    consent_given: bool

    @field_validator("consent_given")
    @classmethod
    def validate_consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Consent must be explicitly given to create a parent account.")
        return v

class ParentLoginRequest(BaseModel):
    email: EmailStr
    password: str

class ProfileOut(BaseModel):
    id: str
    name: str
    email: str
    consent_given: bool
    created_at: str

class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: ProfileOut

# -------------------------------------------------------------
# 2. Children
# -------------------------------------------------------------
class ChildCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    age: int = Field(..., ge=3, le=18)
    grade: int = Field(..., ge=1, le=12)
    mascot_name: str = Field(..., min_length=2, max_length=50)

class ChildOut(BaseModel):
    id: str
    parent_id: str
    name: str
    age: int
    grade: int
    mascot_name: str
    total_stars: int = 0
    created_at: str

# -------------------------------------------------------------
# 3. Textbooks, Topics, Source Pages
# -------------------------------------------------------------
class TextbookOut(BaseModel):
    id: str
    parent_id: str
    grade: int
    subject_tag: str
    title: str
    ncert_code: str
    storage_path: Optional[str] = None
    page_count: int
    created_at: str

class TopicOut(BaseModel):
    id: str
    textbook_id: str
    chapter_number: Optional[int] = 1
    chapter_title: Optional[str] = None
    chapter_name: str
    topic_number: Optional[int] = 1
    name: str
    description: Optional[str] = None
    subject_tag: str
    start_page: int
    end_page: int
    status: str
    version: Optional[int] = 1
    created_at: str

class SourcePageOut(BaseModel):
    id: str
    textbook_id: str
    topic_id: Optional[str] = None
    page_number: int
    text: str

# -------------------------------------------------------------
# 4. Agent Tool Payloads (Strict Validation)
# -------------------------------------------------------------
# Agent 1 Hierarchical Payloads
class SubTopicChunk(BaseModel):
    topic_number: int = Field(..., ge=1)
    name: str = Field(..., min_length=2, description="Clear, child-friendly sub-topic title")
    summary: str = Field(..., description="1-sentence overview of what this sub-topic covers")
    start_page: int = Field(..., ge=1)
    end_page: int = Field(..., ge=1)

    @model_validator(mode="after")
    def validate_page_order(self):
        if self.start_page > self.end_page:
            raise ValueError(f"start_page ({self.start_page}) cannot be greater than end_page ({self.end_page})")
        return self

class ChapterChunk(BaseModel):
    chapter_number: int = Field(..., ge=1)
    chapter_title: str = Field(..., min_length=2)
    start_page: int = Field(..., ge=1)
    end_page: int = Field(..., ge=1)
    topics: List[SubTopicChunk] = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_page_order(self):
        if self.start_page > self.end_page:
            raise ValueError(f"Chapter start_page ({self.start_page}) cannot be greater than end_page ({self.end_page})")
        return self

class CurriculumHierarchySubmission(BaseModel):
    subject_tag: str = Field(..., min_length=2)
    chapters: List[ChapterChunk] = Field(..., min_length=1)

# Backward-compatibility Agent 1 flat payload
class TopicChunkItem(BaseModel):
    name: str = Field(..., min_length=2)
    start_page: int = Field(..., ge=1)
    end_page: int = Field(..., ge=1)

    @model_validator(mode="after")
    def check_page_order(self):
        if self.start_page > self.end_page:
            raise ValueError(f"start_page ({self.start_page}) cannot be greater than end_page ({self.end_page})")
        return self

class SubmitTopicChunksPayload(BaseModel):
    subject_tag: str = Field(..., min_length=2)
    chapter_title: str = Field(..., min_length=2)
    topics_list: List[TopicChunkItem] = Field(..., min_length=1)

# Agent 2 Payloads
class AnimatedScene(BaseModel):
    scene_num: int = Field(..., ge=1)
    title: str = Field(..., min_length=2)
    visual_description: str = Field(..., min_length=5)
    narration_text: str = Field(..., min_length=10)
    narration_variants: Optional[Dict[str, str]] = None
    interaction_beat: Optional[str] = None

class HighlightedWord(BaseModel):
    word: str = Field(..., min_length=1)
    key_point: str = Field(..., min_length=3)
    scene_num: int = Field(..., ge=1)

class InVideoQuestion(BaseModel):
    scene_num: int = Field(..., ge=1)
    question_text: str = Field(..., min_length=5)
    options: List[str] = Field(..., min_length=2, max_length=4)
    correct_answer: str = Field(..., min_length=1)
    hint_text: str = Field(..., min_length=3)
    explanation_text: str = Field(..., min_length=5)
    source_page: int = Field(..., ge=1)
    evidence_quote: Optional[str] = None
    difficulty: Optional[str] = "medium"

    @model_validator(mode="after")
    def check_correct_answer_in_options(self):
        if self.correct_answer not in self.options:
            raise ValueError(f"correct_answer '{self.correct_answer}' must be one of options: {self.options}")
        return self

class RevisionBullet(BaseModel):
    bullet_num: int = Field(..., ge=1)
    scene_num: int = Field(..., ge=1)
    text: str = Field(..., min_length=5)

class WordNumberPair(BaseModel):
    left: str = Field(..., min_length=1)
    right: str = Field(..., min_length=1)

class MiniGameConfig(BaseModel):
    pairs: List[WordNumberPair] = Field(..., min_length=6, max_length=8)

class SubmitLessonAndRevisionPayload(BaseModel):
    scenes: List[AnimatedScene] = Field(..., min_length=4, max_length=16)
    highlighted_words: List[HighlightedWord] = Field(..., min_length=1)
    in_video_questions: List[InVideoQuestion] = Field(..., min_length=1, max_length=16)
    revision_bullets: List[RevisionBullet] = Field(..., min_length=1)
    mini_game_config: MiniGameConfig

# Agent 3 Payloads
class QuizQuestion(BaseModel):
    question_text: str = Field(..., min_length=5)
    options: List[str] = Field(..., min_length=2, max_length=4)
    correct_answer: str = Field(..., min_length=1)
    hint_text: str = Field(..., min_length=3)
    explanation_text: str = Field(..., min_length=5)
    source_page: int = Field(..., ge=1)
    evidence_quote: Optional[str] = None
    difficulty: Optional[str] = "medium"

    @model_validator(mode="after")
    def check_correct_answer_in_options(self):
        if self.correct_answer not in self.options:
            raise ValueError(f"correct_answer '{self.correct_answer}' must be one of options: {self.options}")
        return self

class SubmitQuizSetsPayload(BaseModel):
    quiz_set_a: List[QuizQuestion] = Field(..., min_length=10, max_length=10)
    quiz_set_b: List[QuizQuestion] = Field(..., min_length=10, max_length=10)

# -------------------------------------------------------------
# 5. Database Entities (Lesson Bundle, Question, Steps)
# -------------------------------------------------------------
class LessonBundleOut(BaseModel):
    id: str
    topic_id: str
    scenes_json: List[Dict[str, Any]]
    revision_bullets_json: List[Dict[str, Any]]
    mini_game_config: Dict[str, Any]
    status: str
    created_at: Optional[str] = None

class QuestionOut(BaseModel):
    id: str
    topic_id: str
    question_type: str
    question_data: Dict[str, Any]
    correct_answer: str
    hint_text: str
    explanation_text: str
    source_page: int
    status: str
    flagged: bool = False
    flag_reason: Optional[str] = None
    created_at: Optional[str] = None

class QuestionPatch(BaseModel):
    question_text: Optional[str] = None
    options: Optional[List[str]] = None
    correct_answer: Optional[str] = None
    hint_text: Optional[str] = None
    explanation_text: Optional[str] = None
    source_page: Optional[int] = None

class LessonBundlePatch(BaseModel):
    scenes_json: Optional[List[Dict[str, Any]]] = None
    revision_bullets_json: Optional[List[Dict[str, Any]]] = None
    mini_game_config: Optional[Dict[str, Any]] = None

class AgentStepOut(BaseModel):
    id: str
    run_id: str
    topic_id: str
    agent_name: str
    step_num: int
    tool_name: str
    args_json: Dict[str, Any]
    result_summary: str
    created_at: str

# -------------------------------------------------------------
# 6. Session & Adaptive Models
# -------------------------------------------------------------
class SessionStartResumeRequest(BaseModel):
    child_id: str
    topic_id: str

class SessionStartResumeResponse(BaseModel):
    session_id: str
    status: str
    is_resume: bool
    last_scene_index: int
    unlocked_bullets: List[Dict[str, Any]]
    lesson_bundle: Dict[str, Any]
    in_video_questions: List[Dict[str, Any]]

class AdaptiveInteractRequest(BaseModel):
    session_id: str
    interaction_type: str  # 'highlight_click' | 'answer_submit'
    word: Optional[str] = None
    scene_num: Optional[int] = None
    question_id: Optional[str] = None
    selected_answer: Optional[str] = None
    attempt_number: int = 1
    time_taken: Optional[float] = None  # Seconds since lock expiry

class AdaptiveInteractResponse(BaseModel):
    status: str
    is_correct: Optional[bool] = None
    hint_text: Optional[str] = None
    explanation_text: Optional[str] = None
    stars_awarded: int = 0
    unlocked_bullet: Optional[Dict[str, Any]] = None
    trigger_mini_game: bool = False
    mini_game_config: Optional[Dict[str, Any]] = None
    can_retry: bool = False
    continue_lesson: bool = False

class IdleEventRequest(BaseModel):
    scene_or_question_id: Optional[str] = None
    responded: bool

class QuizSubmitRequest(BaseModel):
    quiz_set: str  # 'quiz_a' | 'quiz_b'
    # List of attempts or answers
    answers: List[Dict[str, Any]]  # Each: question_id, selected_answer, is_first_try_correct, time_taken

class QuizSubmitResponse(BaseModel):
    score_out_of_10: int
    passed: bool
    quiz_set: str
    bonus_stars: int = 0
    topic_mastered: bool
    next_topic_unlocked: bool
    corrections: Optional[List[Dict[str, Any]]] = None
    full_revision_module: Optional[Dict[str, Any]] = None
    launch_quiz_b: bool = False
