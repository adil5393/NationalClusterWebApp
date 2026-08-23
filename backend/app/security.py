"""Shared-password session guard for the Organizer Portal admin API.

Not per-user auth (no accounts table) — a single ADMIN_PASSWORD gates the whole
admin surface, tracked via a signed httpOnly session cookie (see SessionMiddleware
in main.py). This dependency is wired onto every admin router in main.py.
"""
from fastapi import HTTPException, Request


def require_auth(request: Request) -> None:
    if not request.session.get("authenticated"):
        raise HTTPException(401, "Not authenticated")
