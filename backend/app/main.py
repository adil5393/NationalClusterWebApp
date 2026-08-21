import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import (
    accommodation,
    announcements,
    attachments,
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


@app.on_event("startup")
def _startup() -> None:
    try:
        run_migrations()
    except Exception:  # pragma: no cover
        logger.exception("Migration on startup failed")


@app.get("/health")
def root_health():
    return {"status": "ok", "service": "cluster-nationals-api"}


for module in (
    health,
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
    public,
    search,
    imports,
    exports,
):
    app.include_router(module.router)
