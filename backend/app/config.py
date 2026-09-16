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
    # Dev/testing convenience only — never set in production. Skips the
    # "type an admin password to unlock" gate on Teams-tab toggles (see
    # routers/teams.py's _require_admin_password). Defaults false so a
    # deployment that never sets this env var enforces the gate as normal;
    # docker-compose.yml (dev) defaults it to true.
    disable_admin_password_gate: bool = os.environ.get("DISABLE_ADMIN_PASSWORD_GATE", "false").lower() == "true"
    # The school registration form's live Google Sheet — set once so the organizer
    # portal's "Resync" button doesn't need the link pasted in on every use. Still
    # overridable per-request (see routers/imports.py) for a one-off different sheet.
    team_details_sheet_url: str = os.environ.get("TEAM_DETAILS_SHEET_URL", "")
    # The team arrival Google Form's live response sheet — same "Anyone with the
    # link – Viewer" sharing requirement as team_details_sheet_url above. Lets the
    # organizer portal's arrival "Resync" button pull the latest travel plans with
    # no link to paste in (see routers/imports.py import_team_arrivals_from_sheet).
    team_arrival_sheet_url: str = os.environ.get("TEAM_ARRIVAL_SHEET_URL", "")

    @property
    def cors_origins_list(self):
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
