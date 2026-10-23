from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal, Dict, Any
from datetime import datetime

# --- Auth ---
class SignupRequest(BaseModel):
    name: str = Field(min_length=1)
    email: str
    password: str = Field(min_length=6)
    consent_given: bool = True

class LoginRequest(BaseModel):
    email: str
    password: str

class AuthResponse(BaseModel):
    user_id: str
    email: str
    name: str
    token: str

# --- Child ---
class CreateChildRequest(BaseModel):
    name: str = Field(min_length=1)
    age: int = Field(ge=4, le=18)
    grade: int = Field(ge=1, le=12)
    mascot_name: str = "Pip the Fox"
    games_enabled: bool = True

# --- Textbook & Topic ---
class CreateTopicRequest(BaseModel):
    textbook_id: str
    name: str
    subject: str = "Science"
    chapter_tag: str = "Chapter 1"
    start_page: int = Field(ge=1)
    end_page: int = Field(ge=1)

# --- Questions ---
class ExtractedQuestion(BaseModel):
    questionText: str
    type: Literal["multiple_choice"] = "multiple_choice"
    options: List[str] = Field(min_length=2, max_length=5)
    correctAnswer: str
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    sourcePage: int

class QuestionSetPayload(BaseModel):
    questions: List[ExtractedQuestion]

# --- Adaptive Decision (§9) ---
class AdaptiveAnswerRequest(BaseModel):
    session_id: str
    question_id: str
    answer: str
    time_taken: float = Field(ge=0.0)
    attempt_number: int = Field(ge=1)

class AdaptiveDecisionResult(BaseModel):
    is_correct: bool = False
    next_action: Literal["next_question", "retry_same", "break_offer", "rushing_visual", "reteach", "stop_topic"]
    mascot_state: Literal["happy", "encouraging", "calm", "thinking", "waving"]
    stars_earned: int
    silent_accuracy: float
    adaptation_type: Literal["brain_break", "rushing_visual", "reteach", "none"]

# --- Idle Event ---
class IdleEventRequest(BaseModel):
    session_id: str
    question_id: Optional[str] = None
    duration: float
    resolved: bool = True

# --- Topic Complete ---
class CompleteTopicResponse(BaseModel):
    topic_id: str
    status: Literal["mastered", "needs_practice"]
    silent_accuracy_avg: float
    stars_total: int
    first_attempt_accuracy: float
    final_accuracy: float

# --- Coach Agent ---
class CoachChatRequest(BaseModel):
    child_id: str
    message: str

class CoachChatResponse(BaseModel):
    reply: str
    headline: Optional[str] = None
    suggested_step: Optional[str] = None
