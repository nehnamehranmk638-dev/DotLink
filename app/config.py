import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    PORT: int = int(os.getenv("PORT", 8000))
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    # Supabase
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    # LLM Settings
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "groq") # 'groq' or 'gemini'
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GROQ_MODEL_MAIN: str = os.getenv("GROQ_MODEL_MAIN", "openai/gpt-oss-120b")
    GROQ_MODEL_FAST: str = os.getenv("GROQ_MODEL_FAST", "openai/gpt-oss-20b")

    # Gemini (Fallback)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")

    # Adaptive Thresholds (§9)
    TIME_RATIO_SLOW: float = 1.5
    TIME_RATIO_FAST: float = 0.6
    FAST_ANSWER_SECONDS: float = 1.5
    ACCURACY_LOW: float = 0.7
    MAX_PAGE_RANGE: int = 20
    MIN_TEXT_CHARS_PER_PAGE: int = 50
    MASTERY_ACCURACY: float = 0.7
    MASTERY_MIN_ATTEMPTS: int = 5

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
