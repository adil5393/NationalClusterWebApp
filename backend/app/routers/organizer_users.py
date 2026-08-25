"""CRUD for individual Organizer Portal accounts. Protected like every other
admin router (see main.py) — you must already be logged in as someone to
manage who else can log in."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth_utils import hash_password
from ..database import get_db
from ..security import require_admin

router = APIRouter(prefix="/api/organizer-users", tags=["organizer-users"])


def _active_admin_count(db: Session) -> int:
    return (
        db.query(models.OrganizerUser)
        .filter(models.OrganizerUser.is_active.is_(True), models.OrganizerUser.is_admin.is_(True))
        .count()
    )


def _resolve_staff_members(db: Session, staff_member_ids: list[int]) -> list[models.StaffMember]:
    ids = list(dict.fromkeys(staff_member_ids))  # de-dupe, keep order
    if not ids:
        return []
    found = db.query(models.StaffMember).filter(models.StaffMember.id.in_(ids)).all()
    if len(found) != len(ids):
        missing = set(ids) - {s.id for s in found}
        raise HTTPException(404, f"Staff member(s) not found: {sorted(missing)}")
    return found


@router.get("", response_model=list[schemas.OrganizerUserRead])
def list_users(db: Session = Depends(get_db)):
    return db.query(models.OrganizerUser).order_by(models.OrganizerUser.username).all()


@router.get("/modules")
def list_modules():
    """The fixed catalog of gate-able modules, for the permission-matrix editor."""
    return {"modules": schemas.ORGANIZER_MODULES, "levels": schemas.PERMISSION_LEVELS}


@router.post("", response_model=schemas.OrganizerUserRead, status_code=201)
def create_user(payload: schemas.OrganizerUserCreate, db: Session = Depends(get_db)):
    username = payload.username.strip()
    if not username:
        raise HTTPException(400, "Username is required")
    if not payload.password or len(payload.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    exists = db.query(models.OrganizerUser).filter(func.lower(models.OrganizerUser.username) == username.lower()).first()
    if exists:
        raise HTTPException(409, "That username is already taken")
    user = models.OrganizerUser(
        username=username,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        is_active=payload.is_active,
        is_admin=payload.is_admin,
        permissions=payload.permissions,
        staff_members=_resolve_staff_members(db, payload.staff_member_ids),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=schemas.OrganizerUserRead)
def update_user(
    user_id: int,
    payload: schemas.OrganizerUserUpdate,
    db: Session = Depends(get_db),
    current: models.OrganizerUser = Depends(require_admin),
):
    user = db.get(models.OrganizerUser, user_id)
    if not user:
        raise HTTPException(404, "Account not found")
    data = payload.model_dump(exclude_unset=True)

    if "username" in data:
        new_username = (data["username"] or "").strip()
        if not new_username:
            raise HTTPException(400, "Username is required")
        clash = (
            db.query(models.OrganizerUser)
            .filter(func.lower(models.OrganizerUser.username) == new_username.lower(), models.OrganizerUser.id != user_id)
            .first()
        )
        if clash:
            raise HTTPException(409, "That username is already taken")
        user.username = new_username

    if "full_name" in data:
        user.full_name = data["full_name"]

    if data.get("password"):
        if len(data["password"]) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")
        user.password_hash = hash_password(data["password"])

    if "permissions" in data:
        user.permissions = data["permissions"]

    if "staff_member_ids" in data:
        user.staff_members = _resolve_staff_members(db, data["staff_member_ids"] or [])

    losing_admin = "is_admin" in data and data["is_admin"] is False and user.is_admin
    deactivating = "is_active" in data and data["is_active"] is False and user.is_active
    if losing_admin or deactivating:
        if user.id == current.id:
            raise HTTPException(400, "You can't remove your own admin access or deactivate yourself")
        if user.is_admin and _active_admin_count(db) <= 1:
            raise HTTPException(400, "Can't remove the last active admin")

    if "is_admin" in data:
        user.is_admin = data["is_admin"]
    if "is_active" in data:
        user.is_active = data["is_active"]

    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: models.OrganizerUser = Depends(require_admin),
):
    user = db.get(models.OrganizerUser, user_id)
    if not user:
        raise HTTPException(404, "Account not found")
    if user.id == current.id:
        raise HTTPException(400, "You can't delete your own account")
    if user.is_active and user.is_admin and _active_admin_count(db) <= 1:
        raise HTTPException(400, "Can't delete the last active admin")
    db.delete(user)
    db.commit()
