"""Organizer Portal login — shared password, cookie session. Intentionally left
un-protected in main.py (you can't log in to a route that requires being logged in)."""
import secrets

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ..config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


@router.post("/login")
def login(payload: LoginRequest, request: Request):
    if not secrets.compare_digest(payload.password, settings.admin_password):
        raise HTTPException(401, "Incorrect password")
    request.session["authenticated"] = True
    return {"authenticated": True}


@router.post("/logout")
def logout(request: Request):
    request.session.clear()
    return {"authenticated": False}


@router.get("/me")
def me(request: Request):
    return {"authenticated": bool(request.session.get("authenticated"))}
