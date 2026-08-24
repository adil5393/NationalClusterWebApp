"""Bootstraps the first Organizer Portal account, if none exist yet.

Individual accounts replaced the old shared ADMIN_PASSWORD login. Run this once
after deploying that change so there's at least one account to log in with —
after that, manage accounts from Organizer Portal -> Accounts, not this script.
It never touches existing accounts.

    docker compose exec backend python -m app.seed_admin

Username defaults to "admin" (override with INITIAL_ADMIN_USERNAME). Password
comes from INITIAL_ADMIN_PASSWORD, falling back to the legacy ADMIN_PASSWORD
env var if that's still set from before this change.
"""
import os

from .database import Base, SessionLocal, engine
from . import models
from .auth_utils import hash_password


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(models.OrganizerUser).count() > 0:
            print("Organizer accounts already exist — nothing to do.")
            return
        username = os.environ.get("INITIAL_ADMIN_USERNAME", "admin").strip() or "admin"
        password = os.environ.get("INITIAL_ADMIN_PASSWORD") or os.environ.get("ADMIN_PASSWORD")
        if not password:
            print("Set INITIAL_ADMIN_PASSWORD (or legacy ADMIN_PASSWORD) to bootstrap the first account.")
            return
        db.add(models.OrganizerUser(
            username=username,
            full_name="Administrator",
            password_hash=hash_password(password),
            is_active=True,
            is_admin=True,
        ))
        db.commit()
        print(f"Created initial organizer account '{username}'. Log in, then set a personal password from Accounts.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
