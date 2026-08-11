import os


class Settings:
    env: str
    mongodb_uri: str
    db_name: str
    vt_api_key: str
    allowed_origins: str

    def __init__(self):
        self.env = os.getenv("SECURE_BROWSER_ENV", "development")
        self.mongodb_uri = os.getenv("SECURE_BROWSER_MONGODB_URI", "mongodb://localhost:27017")
        self.db_name = os.getenv("SECURE_BROWSER_DB_NAME", "secure_browser")
        self.vt_api_key = os.getenv("SECURE_BROWSER_VT_API_KEY", "")
        self.allowed_origins = os.getenv(
            "SECURE_BROWSER_ALLOWED_ORIGINS",
            "http://localhost:5173,chrome-extension://EXTENSION_ID",
        )

    @property
    def allowed_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


settings = Settings()
