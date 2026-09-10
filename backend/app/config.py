import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")


class Settings:
    """Application settings sourced exclusively from environment variables."""

    database_url: str = os.environ.get("DATABASE_URL", "postgresql://cluster_user:cluster_pass@localhost:5432/cluster_nationals")
    cors_origins: str = os.environ.get("CORS_ORIGINS", "*")
    # Legacy shared-password bootstrap value — only read by app.seed_admin to create
    # the first individual account; no longer required for the app to run.
    admin_password: str = os.environ.get("ADMIN_PASSWORD", "")
    session_secret: str = os.environ.get("SESSION_SECRET", "dev-session-secret-cluster-nationals")
    session_https_only: bool = os.environ.get("SESSION_HTTPS_ONLY", "false").lower() == "true"
    # The school registration form's live Google Sheet — set once so the organizer
    # portal's "Resync" button doesn't need the link pasted in on every use. Still
    # overridable per-request (see routers/imports.py) for a one-off different sheet.
    team_details_sheet_url: str = os.environ.get("TEAM_DETAILS_SHEET_URL", "")

    @property
    def cors_origins_list(self):
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
