"""Organizer Portal login — individual accounts, cookie session. Intentionally
left un-protected in main.py (you can't log in to a route that requires being
logged in)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..auth_utils import verify_password
from ..config import settings
from ..database import get_db
from ..security import is_self_service_staff, is_self_service_volunteer

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


def _user_payload(user: "models.OrganizerUser | None"):
    if not user:
        return {"authenticated": False, "admin_password_gate_disabled": settings.disable_admin_password_gate}
    staff = user.staff_members[0] if user.staff_members else None
    volunteer = user.volunteers[0] if user.volunteers else None
    return {
        "authenticated": True,
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "is_admin": user.is_admin,
        "permissions": user.permissions or {},
        "staff_member": {"id": staff.id, "full_name": staff.full_name, "category": staff.category} if staff else None,
        "volunteer": {"id": volunteer.id, "full_name": volunteer.full_name} if volunteer else None,
        # Drives the frontend's My Work vs organizer Staff Operations split
        # (see routers/me.py, security.is_self_service_staff) — computed here
        # so the frontend never has to re-derive the admin/permission/
        # staff-link rule itself.
        "is_self_service_staff": is_self_service_staff(user),
        # Same idea for a volunteer's own login — see security.is_self_service_volunteer
        # and the /me/volunteer self-service endpoints in routers/me.py.
        "is_self_service_volunteer": is_self_service_volunteer(user),
        # Matches this account can fully control (except delete/reset) independent
        # of the "matches" module permission — see security.require_match_access.
        # The frontend uses this to both grant Matches page visibility to an
        # account with zero module access, and to color-code assigned matches.
        "assigned_match_ids": [m.id for m in user.assigned_matches],
        # Dev/testing only — see config.py's DISABLE_ADMIN_PASSWORD_GATE. Lets
        # Teams.tsx skip its "type an admin password" toggle-off dialog.
        "admin_password_gate_disabled": settings.disable_admin_password_gate,
    }


@router.post("/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    username = payload.username.strip()
    user = (
        db.query(models.OrganizerUser)
        .filter(func.lower(models.OrganizerUser.username) == username.lower())
        .first()
    )
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Incorrect username or password")
    request.session.clear()
    request.session["user_id"] = user.id
    return _user_payload(user)


@router.post("/logout")
def logout(request: Request):
    request.session.clear()
    return {"authenticated": False}


@router.get("/me")
def me(request: Request, db: Session = Depends(get_db)):
    user_id = request.session.get("user_id")
    user = db.get(models.OrganizerUser, user_id) if user_id else None
    if user_id and (not user or not user.is_active):
        request.session.clear()
        user = None
    elif user:
        # Rolling session: re-assigning marks the session modified so
        # SessionMiddleware re-issues the cookie (fresh Max-Age and signature
        # timestamp). An actively used account therefore never hits the fixed
        # 7-day-from-login cliff; only 7 days of inactivity expires it.
        request.session["user_id"] = user.id
    return _user_payload(user)
