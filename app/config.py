import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings:
    BASE_DIR: Path = BASE_DIR

    # Environment & Server
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    PORT: int = int(os.getenv("PORT", "8000"))
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    STORAGE_LOCAL_DIR: str = os.getenv("STORAGE_LOCAL_DIR", str(BASE_DIR / "local_storage"))

    # Supabase Credentials
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "super-secret-dotlink-dev-jwt-key-minimum-32-chars-long")

    # LLM API Keys & Models
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GROQ_HEAVY_MODEL: str = "openai/gpt-oss-120b"
    GROQ_LIGHT_MODEL: str = "openai/gpt-oss-20b"
    GEMINI_FALLBACK_MODEL: str = "gemini-2.0-flash"

    # Agent Tunables
    AGENT_MAX_STEPS: int = 25
    AGENT_MAX_RETRIES: int = 2
    GROUNDING_FUZZY_THRESHOLD: float = 65.0  # RapidFuzz match ratio (0-100)

    # Adaptive Engine Timing & Anti-Rushing Locks (in seconds)
    LOCK_SECONDS_QUESTION: float = 3.0  # Buttons locked on initial question display
    LOCK_SECONDS_RETRY: float = 2.0     # Buttons locked on retry after wrong answer
    MAX_VALID_TIME_TAKEN: float = 300.0  # Sanity check ceiling for response time (5 min)

    # Engagement & Rapid Guessing Thresholds
    EXPECTED_TIME_BASE: float = 4.0        # Base read/think time in seconds
    EXPECTED_TIME_PER_WORD: float = 0.35   # Additional seconds per word of question + options
    TIME_RATIO_LOW_ENGAGEMENT: float = 1.5 # time_ratio > 1.5 triggers engagement refresher
    RAPID_GUESS_THRESHOLD_SECONDS: float = 1.5 # Wrong answer within 1.5s post-lock
    MINI_GAME_DURATION_SECONDS: int = 60
    MINI_GAME_COOLDOWN_SECONDS: int = 300  # 5 minutes cooldown between mini-games

    # Inactivity & Idle Monitoring
    IDLE_INACTIVITY_TIMEOUT_SECONDS: int = 60  # Triggers "Are you still watching?"
    IDLE_COUNTDOWN_TIMEOUT_SECONDS: int = 30   # Auto-pause if unanswered in 30s
    HEARTBEAT_INTERVAL_SECONDS: int = 10       # Active focus heartbeat every 10s
    SSE_HEARTBEAT_INTERVAL_SECONDS: int = 15   # SSE comment heartbeat every 15s

    # Stars & Rewards Economy
    STARS_CORRECT_FIRST_TRY: int = 3
    STARS_PARTICIPATION_SECOND_WRONG: int = 1
    STARS_MASTERY_BONUS: int = 10

    # Mastery Gate Rules
    MASTERY_PASS_SCORE: int = 7         # >= 7/10 required to pass Set A or Set B
    QUIZ_TOTAL_QUESTIONS: int = 10       # Exactly 10 questions in Set A and Set B
    QUIZ_SCORE_FIRST_ATTEMPT_ONLY: bool = True  # Set A graded on first attempt

settings = Settings()
