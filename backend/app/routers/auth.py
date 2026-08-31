"""Organizer Portal login — individual accounts, cookie session. Intentionally
left un-protected in main.py (you can't log in to a route that requires being
logged in)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..auth_utils import verify_password
from ..database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


def _user_payload(user: "models.OrganizerUser | None"):
    if not user:
        return {"authenticated": False}
    staff = user.staff_members[0] if user.staff_members else None
    return {
        "authenticated": True,
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "is_admin": user.is_admin,
        "permissions": user.permissions or {},
        "staff_member": {"id": staff.id, "full_name": staff.full_name, "category": staff.category} if staff else None,
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
    return _user_payload(user)
