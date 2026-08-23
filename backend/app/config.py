import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


class Settings:
    """Application settings sourced exclusively from environment variables."""

    database_url: str = os.environ["DATABASE_URL"]
    cors_origins: str = os.environ.get("CORS_ORIGINS", "*")
    admin_password: str = os.environ["ADMIN_PASSWORD"]
    session_secret: str = os.environ["SESSION_SECRET"]
    session_https_only: bool = os.environ.get("SESSION_HTTPS_ONLY", "false").lower() == "true"

    @property
    def cors_origins_list(self):
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
