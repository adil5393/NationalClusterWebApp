"""Staff members and their duty assignments (room-scoped, shift-based)."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth_utils import hash_password
from ..database import get_db

router = APIRouter(prefix="/api/staff", tags=["staff"])


def _provision_login(db: Session, full_name: str) -> tuple[str, str]:
    """Username is their first name in caps (suffixed with a number if that's
    already taken by someone else), password is "2026" + their first name;
    both are handed back once by the caller since the password only exists
    as a bcrypt hash after this."""
    first = (full_name or "").strip().split()[0] if (full_name or "").strip() else "STAFF"
    base_username = first.upper()
    username = base_username
    suffix = 2
    while db.query(models.OrganizerUser).filter(func.lower(models.OrganizerUser.username) == username.lower()).first():
        username = f"{base_username}{suffix}"
        suffix += 1
    return username, f"2026{first}"


@router.get("/meta")
def meta():
    return {"duty_types": schemas.DUTY_TYPES, "staff_categories": schemas.STAFF_CATEGORIES}


# ---------- Staff members ----------
@router.get("", response_model=list[schemas.StaffRead])
def list_staff(db: Session = Depends(get_db)):
    return db.query(models.StaffMember).order_by(models.StaffMember.full_name).all()


@router.post("", response_model=schemas.StaffRead, status_code=201)
def create_staff(payload: schemas.StaffCreate, db: Session = Depends(get_db)):
    """No login is created here — an organizer creates one on demand per
    staff member via POST /staff/{id}/credential, from a "Create Credential"
    button in the Staff admin page."""
    staff = models.StaffMember(**payload.model_dump())
    db.add(staff)
    db.commit()
    db.refresh(staff)
    return staff


@router.post("/{staff_id}/credential", response_model=schemas.StaffCredentialResult, status_code=201)
def create_staff_credential(staff_id: int, db: Session = Depends(get_db)):
    staff = db.get(models.StaffMember, staff_id)
    if not staff:
        raise HTTPException(404, "Staff member not found")
    if staff.organizer_users:
        raise HTTPException(409, f"{staff.full_name} already has a login: {staff.organizer_users[0].username}")

    username, password = _provision_login(db, staff.full_name)
    login = models.OrganizerUser(
        username=username,
        full_name=staff.full_name,
        password_hash=hash_password(password),
        is_active=True,
        is_admin=False,
        permissions=schemas.STAFF_BASE_PERMISSIONS,
        staff_members=[staff],
    )
    db.add(login)
    db.commit()
    return {"login_username": username, "login_password": password}


@router.put("/{staff_id}", response_model=schemas.StaffRead)
def update_staff(staff_id: int, payload: schemas.StaffUpdate, db: Session = Depends(get_db)):
    staff = db.get(models.StaffMember, staff_id)
    if not staff:
        raise HTTPException(404, "Staff member not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(staff, key, value)
    db.commit()
    db.refresh(staff)
    return staff


@router.delete("/{staff_id}", status_code=204)
def delete_staff(staff_id: int, db: Session = Depends(get_db)):
    staff = db.get(models.StaffMember, staff_id)
    if not staff:
        raise HTTPException(404, "Staff member not found")
    db.delete(staff)
    db.commit()


# ---------- Duty assignments ----------
def _room_context(room: models.Room):
    floor = room.floor
    building = floor.building if floor else None
    return floor, building


def _duty_dict(a: models.DutyAssignment):
    floor, building = _room_context(a.room) if a.room else (None, None)
    return {
        "id": a.id,
        "staff_id": a.staff_id,
        "staff_name": a.staff.full_name if a.staff else None,
        "category": a.staff.category if a.staff else None,
        "room_id": a.room_id,
        "room_name": a.room.name if a.room else None,
        "floor_id": floor.id if floor else None,
        "floor_name": floor.name if floor else None,
        "building_id": building.id if building else None,
        "building_name": building.name if building else None,
        "duty_type": a.duty_type,
        "start_time": a.start_time.isoformat() if a.start_time else None,
        "end_time": a.end_time.isoformat() if a.end_time else None,
        "notes": a.notes,
    }


@router.get("/duties")
def list_duties(staff_id: int | None = Query(None), db: Session = Depends(get_db)):
    q = db.query(models.DutyAssignment)
    if staff_id:
        q = q.filter(models.DutyAssignment.staff_id == staff_id)
    rows = q.order_by(models.DutyAssignment.id.desc()).all()
    return [_duty_dict(a) for a in rows]


@router.post("/duties", status_code=201)
def create_duty(payload: schemas.DutyAssignmentCreate, db: Session = Depends(get_db)):
    if not db.get(models.StaffMember, payload.staff_id):
        raise HTTPException(404, "Staff member not found")
    if not db.get(models.Room, payload.room_id):
        raise HTTPException(404, "Room not found")
    a = models.DutyAssignment(**payload.model_dump())
    db.add(a)
    db.commit()
    db.refresh(a)
    return _duty_dict(a)


@router.put("/duties/{duty_id}")
def update_duty(duty_id: int, payload: schemas.DutyAssignmentUpdate, db: Session = Depends(get_db)):
    a = db.get(models.DutyAssignment, duty_id)
    if not a:
        raise HTTPException(404, "Duty assignment not found")
    data = payload.model_dump(exclude_unset=True)
    if "staff_id" in data and not db.get(models.StaffMember, data["staff_id"]):
        raise HTTPException(404, "Staff member not found")
    if "room_id" in data and not db.get(models.Room, data["room_id"]):
        raise HTTPException(404, "Room not found")
    for key, value in data.items():
        setattr(a, key, value)
    db.commit()
    db.refresh(a)
    return _duty_dict(a)


@router.delete("/duties/{duty_id}", status_code=204)
def delete_duty(duty_id: int, db: Session = Depends(get_db)):
    a = db.get(models.DutyAssignment, duty_id)
    if not a:
        raise HTTPException(404, "Duty assignment not found")
    db.delete(a)
    db.commit()
