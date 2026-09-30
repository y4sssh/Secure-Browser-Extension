import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover - dependency is installed through backend requirements.
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")


class Settings:
    env: str
    mongodb_uri: str
    db_name: str
    vt_api_key: str
    allowed_origins: str
    allowed_origin_regex: str
    storage_backend: str
    mongodb_timeout_ms: int

    def __init__(self):
        self.env = os.getenv("SECURE_BROWSER_ENV", "development")
        self.mongodb_uri = os.getenv("SECURE_BROWSER_MONGODB_URI", "")
        self.db_name = os.getenv("SECURE_BROWSER_DB_NAME", "secure_browser")
        self.vt_api_key = os.getenv("SECURE_BROWSER_VT_API_KEY", "")
        self.allowed_origins = os.getenv(
            "SECURE_BROWSER_ALLOWED_ORIGINS",
            "http://localhost:5173",
        )
        # An unpacked Chrome extension has a generated ID, so a placeholder
        # origin cannot satisfy the browser's CORS check. Keep this narrow to
        # valid Chrome extension IDs while allowing deployments to override it.
        self.allowed_origin_regex = os.getenv(
            "SECURE_BROWSER_ALLOWED_ORIGIN_REGEX",
            r"^chrome-extension://[a-p]{32}$",
        )
        self.storage_backend = os.getenv("SECURE_BROWSER_STORAGE_BACKEND", "auto").lower()
        self.mongodb_timeout_ms = int(os.getenv("SECURE_BROWSER_MONGODB_TIMEOUT_MS", "1000"))

    @property
    def allowed_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def mongo_enabled(self) -> bool:
        if self.storage_backend in {"jsonl", "file", "files"}:
            return False
        if self.storage_backend in {"mongodb", "mongo"}:
            return True
        return bool(self.mongodb_uri)


settings = Settings()
