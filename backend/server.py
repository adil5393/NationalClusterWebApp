"""Uvicorn entrypoint. Supervisor runs `uvicorn server:app` from /app/backend."""
from app.main import app  # noqa: F401
