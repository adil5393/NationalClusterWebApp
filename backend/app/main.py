import logging
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from .config import settings
from .security import require_admin, require_auth, require_module
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
    live_ws,
    matches,
    organizer_users,
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

# Per-account session cookie for the Organizer Portal (see security.py /
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
# site, login itself (you can't log in to a route that requires being logged in),
# and the live-match WebSocket feed (read-only fan-out — see ws.py/live_ws.py).
for module in (health, public, auth, live_ws):
    app.include_router(module.router)

# Everything else is the Organizer Portal's own data, gated per-module (see
# security.py / schemas.ORGANIZER_MODULES) — applied centrally here rather than
# editing every router file. GET needs "view" on the module, everything else
# needs "edit"; admins bypass this entirely.
for module in (dashboard, search):
    app.include_router(module.router, dependencies=[Depends(require_auth)])

for router_module, module_key in (
    (teams, "teams"),
    (participants, "teams"),
    (imports, "teams"),
    (structure, "buildings"),
    (accommodation, "accommodation"),
    (transport, "transport"),
    (venues, "venues"),
    (schedule, "schedule"),
    (knowledge, "knowledge"),
    (attachments, "knowledge"),
    (procurement, "procurement"),
    (announcements, "announcements"),
    (staff, "staff"),
    (matches, "matches"),
):
    app.include_router(router_module.router, dependencies=[Depends(require_module(module_key))])

# exports.py mixes entities across modules in one router (participants.csv vs
# rooms.csv) — each endpoint declares its own module dependency instead.
app.include_router(exports.router, dependencies=[Depends(require_auth)])

# Managing who else can log in, and with what access, is admin-only.
app.include_router(organizer_users.router, dependencies=[Depends(require_admin)])
