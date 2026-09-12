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


# Router-level gate for routers/matches.py only (registered in main.py in place
# of require_module("matches") — pools/buckets/reports/mats keep the plain
# module gate). An account assigned to a match (models.Match.assigned_users)
# gets access independent of the "matches" module permission entirely: they
# can view every match (even with zero module access), and get full control
# of specifically their own assigned match(es) for the plain lifecycle
# actions below — never delete, reset, the general PUT edit, or mat
# (re)assignment, which always still need real module edit access or admin.
_ASSIGNABLE_MATCH_ACTIONS = {"start", "score", "pause", "resume", "complete", "cancel", "forfeit", "postpone"}


def require_match_access(request: Request, db: Session = Depends(get_db)) -> "models.OrganizerUser":
    user = require_auth(request, db)
    if user.is_admin:
        return user

    level = (user.permissions or {}).get("matches")
    if request.method in SAFE_METHODS:
        if level in ("view", "edit") or user.assigned_matches:
            return user
        raise HTTPException(403, "You don't have view access to this section")

    if level == "edit":
        return user

    # No module edit access — only a per-match assignment can still unlock
    # this, and only for a whitelisted action (fails closed: any new
    # mutating endpoint added later defaults to requiring full edit access).
    action = request.url.path.rstrip("/").rsplit("/", 1)[-1]
    if action not in _ASSIGNABLE_MATCH_ACTIONS:
        raise HTTPException(403, "This action requires full Matches & Fixtures edit access")

    match_id_raw = request.path_params.get("match_id")
    match = db.get(models.Match, int(match_id_raw)) if match_id_raw is not None else None
    if match and any(u.id == user.id for u in match.assigned_users):
        return user
    raise HTTPException(403, "You're not assigned to this match")
