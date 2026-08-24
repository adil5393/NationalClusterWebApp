"""Per-account, per-module session guard for the Organizer Portal admin API.

Each OrganizerUser either is_admin (full access to every module and Accounts) or
carries a `permissions` map of {module_key: "view" | "edit"} — a module missing
from that map means no access at all. GET/HEAD requests only need "view"; every
other method needs "edit". Looking the user up on every request (rather than
trusting the cookie alone) means deactivating someone, or narrowing their
permissions, takes effect immediately, not just on their next login.
"""
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from . import models
from .database import get_db

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def require_auth(request: Request, db: Session = Depends(get_db)) -> "models.OrganizerUser":
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(401, "Not authenticated")
    user = db.get(models.OrganizerUser, user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "Not authenticated")
    return user


def require_admin(request: Request, db: Session = Depends(get_db)) -> "models.OrganizerUser":
    user = require_auth(request, db)
    if not user.is_admin:
        raise HTTPException(403, "Admin access required")
    return user


def require_module(module_key: str):
    def _dep(request: Request, db: Session = Depends(get_db)) -> "models.OrganizerUser":
        user = require_auth(request, db)
        if user.is_admin:
            return user
        level = (user.permissions or {}).get(module_key)
        needs_edit = request.method not in SAFE_METHODS
        if level is None or (needs_edit and level != "edit"):
            verb = "edit" if needs_edit else "view"
            raise HTTPException(403, f"You don't have {verb} access to this section")
        return user
    return _dep
