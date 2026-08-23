import logging
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .config import settings
from .security import require_auth
from .routers import (
    accommodation,
    announcements,
    attachments,
    auth,
    dashboard,
    exports,
    health,
    imports,
    knowledge,
    participants,
    procurement,
    public,
    schedule,
    search,
    staff,
    structure,
    teams,
    transport,
    venues,
)

BASE_DIR = Path(__file__).resolve().parent.parent
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("cluster")


def run_migrations() -> None:
    """Apply Alembic migrations to head. Idempotent and safe to run on startup."""
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BASE_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BASE_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(cfg, "head")
    logger.info("Alembic migrations applied (head).")


app = FastAPI(title="Cluster Nationals 2026-27 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shared-password session cookie for the Organizer Portal (see security.py /
# routers/auth.py). https_only stays env-driven: the current prod deployment is
# plain HTTP on a bare IP, and a secure cookie silently never gets set over HTTP.
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    session_cookie="cn_session",
    same_site="lax",
    https_only=settings.session_https_only,
    max_age=60 * 60 * 24 * 7,  # 7 days
)


@app.on_event("startup")
def _startup() -> None:
    try:
        run_migrations()
    except Exception:  # pragma: no cover
        logger.exception("Migration on startup failed")


@app.get("/health")
def root_health():
    return {"status": "ok", "service": "cluster-nationals-api"}


# Open to the internet, no session required: health checks, the public read-only
# site, and login itself (you can't log in to a route that requires being logged in).
for module in (health, public, auth):
    app.include_router(module.router)

# Everything else is the Organizer Portal's own data — gated behind the shared
# password session (see security.py), applied centrally here rather than editing
# every router file.
for module in (
    dashboard,
    teams,
    participants,
    structure,
    accommodation,
    transport,
    venues,
    schedule,
    knowledge,
    attachments,
    procurement,
    announcements,
    search,
    imports,
    exports,
    staff,
):
    app.include_router(module.router, dependencies=[Depends(require_auth)])
