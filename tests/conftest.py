"""Tests use a fresh local database and fake/offline models, never parent data or API credits."""
import pytest


@pytest.fixture(scope="session", autouse=True)
def isolated_test_environment(tmp_path_factory):
    from app.config import settings
    import app.db as database
    patch = pytest.MonkeyPatch()
    folder = tmp_path_factory.mktemp("dotlink")
    patch.setattr(database, "DB_FILE", str(folder / "test.db"))
    patch.setattr(settings, "STORAGE_LOCAL_DIR", str(folder / "storage"))
    patch.setattr(settings, "GROQ_API_KEY", "")
    patch.setattr(settings, "GEMINI_API_KEY", "")
    patch.setattr(settings, "SUPABASE_URL", "")
    patch.setattr(settings, "SUPABASE_SERVICE_KEY", "")
    yield
    patch.undo()
