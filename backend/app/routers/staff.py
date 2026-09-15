from datetime import datetime, timezone
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


def _normalize_dt(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _duty_dict(a: models.DutyAssignment, warning: str | None = None):
    floor, building = _room_context(a.room) if a.room else (None, None)
    loc = a.location
    res = {
        "id": a.id,
        "staff_id": a.staff_id,
        "shift_id": a.shift_id,
        "shift_name": a.shift.shift_name if a.shift else None,
        "staff_name": a.staff.full_name if a.staff else None,
        "category": a.staff.category if a.staff else None,
        "room_id": a.room_id,
        "room_name": a.room.name if a.room else None,
        "floor_id": floor.id if floor else None,
        "floor_name": floor.name if floor else None,
        "building_id": building.id if building else None,
        "building_name": building.name if building else None,
        "location_id": a.location_id,
        "location_name": loc.name if loc else None,
        "location_type": loc.location_type if loc else None,
        "duty_type": a.duty_type,
        "start_time": a.start_time.isoformat() if a.start_time else None,
        "end_time": a.end_time.isoformat() if a.end_time else None,
        "notes": a.notes,
    }
    if warning:
        res["warning"] = warning
    return res


@router.get("/duties")
def list_duties(
    staff_id: int | None = Query(None),
    shift_id: int | None = Query(None),
    location_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.DutyAssignment)
    if staff_id:
        q = q.filter(models.DutyAssignment.staff_id == staff_id)
    if shift_id:
        q = q.filter(models.DutyAssignment.shift_id == shift_id)
    if location_id:
        q = q.filter(models.DutyAssignment.location_id == location_id)
    rows = q.order_by(models.DutyAssignment.id.desc()).all()
    return [_duty_dict(a) for a in rows]


@router.post("/duties", status_code=201)
def create_duty(payload: schemas.DutyAssignmentCreate, db: Session = Depends(get_db)):
    if not db.get(models.StaffMember, payload.staff_id):
        raise HTTPException(404, "Staff member not found")

    # Validate location_id if provided
    if payload.location_id is not None:
        loc = db.get(models.EventLocation, payload.location_id)
        if not loc:
            raise HTTPException(404, "Event location not found")
        if not loc.is_active:
            raise HTTPException(400, f"Location '{loc.name}' is inactive and cannot be used for new duty assignments.")

    # Validate room_id if provided (legacy)
    if payload.room_id is not None:
        if not db.get(models.Room, payload.room_id):
            raise HTTPException(404, "Room not found")

    # Validate shift_id if provided
    shift = None
    if payload.shift_id is not None:
        shift = db.get(models.StaffShift, payload.shift_id)
        if not shift:
            raise HTTPException(404, "Shift not found")
        if shift.staff_id != payload.staff_id:
            raise HTTPException(400, "Duty staff_id does not match shift staff_id")

    # Shift timing warning (Section 7: duty extends outside assigned shift window -> warning surfaced, not hard blocked)
    warning = None
    if shift and (payload.start_time or payload.end_time):
        d_start = _normalize_dt(payload.start_time)
        d_end = _normalize_dt(payload.end_time)
        s_start = _normalize_dt(shift.start_time)
        s_end = _normalize_dt(shift.end_time)
        if d_start and s_start and d_start < s_start:
            warning = "Duty extends outside assigned shift window."
        elif d_end and s_end and d_end > s_end:
            warning = "Duty extends outside assigned shift window."

    a = models.DutyAssignment(**payload.model_dump())
    db.add(a)
    db.commit()
    db.refresh(a)
    return _duty_dict(a, warning=warning)


@router.put("/duties/{duty_id}")
def update_duty(duty_id: int, payload: schemas.DutyAssignmentUpdate, db: Session = Depends(get_db)):
    a = db.get(models.DutyAssignment, duty_id)
    if not a:
        raise HTTPException(404, "Duty assignment not found")
    data = payload.model_dump(exclude_unset=True)
    target_staff_id = data.get("staff_id", a.staff_id)
    if "staff_id" in data and not db.get(models.StaffMember, target_staff_id):
        raise HTTPException(404, "Staff member not found")

    if "location_id" in data and data["location_id"] is not None:
        loc = db.get(models.EventLocation, data["location_id"])
        if not loc:
            raise HTTPException(404, "Event location not found")
        if not loc.is_active and data["location_id"] != a.location_id:
            raise HTTPException(400, f"Location '{loc.name}' is inactive and cannot be used for new duty assignments.")

    if "room_id" in data and data["room_id"] is not None:
        if not db.get(models.Room, data["room_id"]):
            raise HTTPException(404, "Room not found")

    target_shift_id = data.get("shift_id", a.shift_id)
    shift = None
    if target_shift_id is not None:
        shift = db.get(models.StaffShift, target_shift_id)
        if not shift:
            raise HTTPException(404, "Shift not found")
        if shift.staff_id != target_staff_id:
            raise HTTPException(400, "Duty staff_id does not match shift staff_id")

    for key, value in data.items():
        setattr(a, key, value)
    db.commit()
    db.refresh(a)

    warning = None
    if shift and (a.start_time or a.end_time):
        d_start = _normalize_dt(a.start_time)
        d_end = _normalize_dt(a.end_time)
        s_start = _normalize_dt(shift.start_time)
        s_end = _normalize_dt(shift.end_time)
        if d_start and s_start and d_start < s_start:
            warning = "Duty extends outside assigned shift window."
        elif d_end and s_end and d_end > s_end:
            warning = "Duty extends outside assigned shift window."

    return _duty_dict(a, warning=warning)


@router.delete("/duties/{duty_id}", status_code=204)
def delete_duty(duty_id: int, db: Session = Depends(get_db)):
    a = db.get(models.DutyAssignment, duty_id)
    if not a:
        raise HTTPException(404, "Duty assignment not found")
    db.delete(a)
    db.commit()


# ---------- Staff Shifts (availability windows) ----------
def _shift_dict(s: models.StaffShift, include_work: bool = True):
    sb = s.shift_block
    duties_list = (s.duties or []) if include_work else []
    tasks_list = (s.tasks or []) if include_work else []
    res = {
        "id": s.id,
        "shift_block_id": s.shift_block_id,
        "staff_id": s.staff_id,
        "shift_name": sb.name if sb else None,
        "staff_name": s.staff.full_name if s.staff else None,
        "staff_category": s.staff.category if s.staff else None,
        "staff_phone": s.staff.phone if s.staff else None,
        "start_time": sb.start_time.isoformat() if sb and sb.start_time else None,
        "end_time": sb.end_time.isoformat() if sb and sb.end_time else None,
        "status": sb.status if sb else "SCHEDULED",
        "derived_status": s.derived_status,
        "is_active": s.is_active,
        "notes": s.notes or (sb.notes if sb else None),
        "duty_count": len(s.duties) if s.duties else 0,
        "task_count": len(s.tasks) if s.tasks else 0,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }
    if include_work:
        res["duties"] = [_duty_dict(d) for d in duties_list]
        res["tasks"] = [
            {
                "id": t.id,
                "title": t.title,
                "description": t.description,
                "status": t.status,
                "priority": t.priority,
                "category": t.category,
                "owner": t.owner,
                "due_date": t.due_date.isoformat() if t.due_date else None,
            }
            for t in tasks_list
        ]
    return res


def _shift_block_dict(b: models.ShiftBlock, include_staff: bool = False):
    assignments = b.staff_assignments or []
    res = {
        "id": b.id,
        "name": b.name,
        "start_time": b.start_time.isoformat() if b.start_time else None,
        "end_time": b.end_time.isoformat() if b.end_time else None,
        "status": b.status,
        "derived_status": b.derived_status,
        "is_active": b.is_active,
        "notes": b.notes,
        "staff_count": len(assignments),
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "updated_at": b.updated_at.isoformat() if b.updated_at else None,
    }
    if include_staff:
        res["staff_assignments"] = [_shift_dict(a) for a in assignments]
    return res


# --- Shift Blocks (Common Workforce Shifts) ---

@router.get("/shift-blocks")
def list_shift_blocks(
    on_shift: bool | None = Query(None),
    status: str | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.ShiftBlock)
    if status:
        q = q.filter(models.ShiftBlock.status == status)
    rows = q.order_by(models.ShiftBlock.start_time.asc()).all()
    if on_shift is not None:
        rows = [b for b in rows if b.is_active == on_shift]
    return [_shift_block_dict(b, include_staff=True) for b in rows]


@router.get("/shift-blocks/{block_id}")
def get_shift_block(block_id: int, db: Session = Depends(get_db)):
    b = db.get(models.ShiftBlock, block_id)
    if not b:
        raise HTTPException(404, "Shift block not found")
    return _shift_block_dict(b, include_staff=True)


@router.post("/shift-blocks", status_code=201)
def create_shift_block(payload: schemas.ShiftBlockCreate, db: Session = Depends(get_db)):
    if payload.end_time <= payload.start_time:
        raise HTTPException(400, "end_time must be strictly after start_time")
    data = payload.model_dump()
    staff_ids = data.pop("staff_ids", None) or []
    
    # Validate staff IDs if provided
    for sid in staff_ids:
        if not db.get(models.StaffMember, sid):
            raise HTTPException(404, f"Staff member with id {sid} not found")

    block = models.ShiftBlock(**data)
    db.add(block)
    db.commit()
    db.refresh(block)

    # Add staff assignments (deduplicated)
    unique_sids = list(dict.fromkeys(staff_ids))
    for sid in unique_sids:
        db.add(models.StaffShift(shift_block_id=block.id, staff_id=sid))
    if unique_sids:
        db.commit()
        db.refresh(block)

    return _shift_block_dict(block, include_staff=True)


@router.put("/shift-blocks/{block_id}")
def update_shift_block(block_id: int, payload: schemas.ShiftBlockUpdate, db: Session = Depends(get_db)):
    b = db.get(models.ShiftBlock, block_id)
    if not b:
        raise HTTPException(404, "Shift block not found")
    data = payload.model_dump(exclude_unset=True)
    new_start = data.get("start_time", b.start_time)
    new_end = data.get("end_time", b.end_time)
    if new_end <= new_start:
        raise HTTPException(400, "end_time must be strictly after start_time")
    for key, value in data.items():
        setattr(b, key, value)
    db.commit()
    db.refresh(b)
    return _shift_block_dict(b, include_staff=True)


@router.put("/shift-blocks/{block_id}/staff")
def sync_shift_block_staff(block_id: int, payload: schemas.ShiftBlockStaffSync, db: Session = Depends(get_db)):
    b = db.get(models.ShiftBlock, block_id)
    if not b:
        raise HTTPException(404, "Shift block not found")
    
    # Validate each staff member exists
    unique_target_sids = list(dict.fromkeys(payload.staff_ids))
    for sid in unique_target_sids:
        if not db.get(models.StaffMember, sid):
            raise HTTPException(404, f"Staff member with id {sid} not found")

    current_assignments = {a.staff_id: a for a in (b.staff_assignments or [])}
    
    # Check if any assignment being removed has attached duties or tasks
    for sid, assignment in current_assignments.items():
        if sid not in unique_target_sids:
            duty_count = len(assignment.duties or [])
            task_count = len(assignment.tasks or [])
            if duty_count > 0 or task_count > 0:
                staff_name = assignment.staff.full_name if assignment.staff else f"Staff #{sid}"
                raise HTTPException(
                    409,
                    f"Cannot remove {staff_name} from this shift block: {duty_count} duties and {task_count} tasks are attached. Reassign or unassign their duties/tasks first."
                )

    # Perform synchronization: remove discarded, add new
    for sid, assignment in list(current_assignments.items()):
        if sid not in unique_target_sids:
            db.delete(assignment)

    for sid in unique_target_sids:
        if sid not in current_assignments:
            db.add(models.StaffShift(shift_block_id=b.id, staff_id=sid))

    db.commit()
    db.refresh(b)
    return _shift_block_dict(b, include_staff=True)


@router.delete("/shift-blocks/{block_id}", status_code=204)
def delete_shift_block(block_id: int, db: Session = Depends(get_db)):
    b = db.get(models.ShiftBlock, block_id)
    if not b:
        raise HTTPException(404, "Shift block not found")
    # Step 0 Delete Safety: refuse to delete if any staff assignment has attached duties or tasks
    for assignment in b.staff_assignments or []:
        if (assignment.duties and len(assignment.duties) > 0) or (assignment.tasks and len(assignment.tasks) > 0):
            raise HTTPException(
                409,
                "Cannot delete this shift because operational duties or tasks are attached. "
                "Cancel the shift instead, or reassign/remove the operational work first."
            )
    # Deleting ShiftBlock cascades StaffShift rows; foreign keys from duties/tasks
    # to StaffShift have ON DELETE SET NULL, preserving duty/task operational records.
    db.delete(b)
    db.commit()


# --- Staff Shifts (Individual Member Assignment Queries) ---

@router.get("/shifts")
def list_shifts(
    staff_id: int | None = Query(None),
    shift_block_id: int | None = Query(None),
    on_shift: bool | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.StaffShift)
    if staff_id:
        q = q.filter(models.StaffShift.staff_id == staff_id)
    if shift_block_id:
        q = q.filter(models.StaffShift.shift_block_id == shift_block_id)
    rows = q.all()
    if on_shift is not None:
        rows = [s for s in rows if s.is_active == on_shift]
    # Sort chronologically by shift_block start_time
    rows.sort(key=lambda s: s.start_time if s.start_time else datetime.min.replace(tzinfo=timezone.utc))
    return [_shift_dict(s) for s in rows]


@router.get("/shifts/{shift_id}")
def get_shift(shift_id: int, db: Session = Depends(get_db)):
    s = db.get(models.StaffShift, shift_id)
    if not s:
        raise HTTPException(404, "Staff shift assignment not found")
    base = _shift_dict(s)
    base["duties"] = [_duty_dict(d) for d in (s.duties or [])]
    base["tasks"] = [
        {
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "status": t.status,
            "priority": t.priority,
            "category": t.category,
            "owner": t.owner,
            "due_date": t.due_date.isoformat() if t.due_date else None,
        }
        for t in (s.tasks or [])
    ]
    return base


@router.delete("/shifts/{shift_id}", status_code=204)
def delete_staff_shift(shift_id: int, db: Session = Depends(get_db)):
    s = db.get(models.StaffShift, shift_id)
    if not s:
        raise HTTPException(404, "Staff shift assignment not found")
    duty_count = len(s.duties or [])
    task_count = len(s.tasks or [])
    if duty_count > 0 or task_count > 0:
        staff_name = s.staff.full_name if s.staff else f"Staff #{s.staff_id}"
        raise HTTPException(
            409,
            f"Cannot remove assignment for {staff_name}: {duty_count} duties and {task_count} tasks are attached."
        )
    db.delete(s)
    db.commit()

