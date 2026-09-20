from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth_utils import hash_password, provision_login_credentials
from ..database import get_db
from .event_locations import _room_display_name, resolve_event_location_for_source, resolve_location_display

router = APIRouter(prefix="/api/staff", tags=["staff"])


@router.get("/meta")
def meta():
    return {
        "duty_types": schemas.DUTY_TYPES,
        "staff_categories": schemas.STAFF_CATEGORIES,
        "staff_languages": schemas.STAFF_LANGUAGES,
    }


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

    username, password = provision_login_credentials(db, staff.full_name, fallback_label="STAFF")
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


def _duty_shift_overflow_minutes(a: models.DutyAssignment) -> int | None:
    """Minutes a duty's timing falls outside its parent shift block's window
    (Section 7: allowed by design — emergency/extended responsibilities are
    never hard-blocked — just surfaced so it isn't missed). Combines both
    edges (starts early + runs late) into one number for a compact "+1h"
    style display. None when the duty has no shift, no timing, or fits
    entirely inside the shift window."""
    shift = a.shift
    if not shift or (not a.start_time and not a.end_time):
        return None
    d_start = _normalize_dt(a.start_time)
    d_end = _normalize_dt(a.end_time)
    s_start = _normalize_dt(shift.start_time)
    s_end = _normalize_dt(shift.end_time)
    minutes = 0
    if d_start and s_start and d_start < s_start:
        minutes += int((s_start - d_start).total_seconds() // 60)
    if d_end and s_end and d_end > s_end:
        minutes += int((d_end - s_end).total_seconds() // 60)
    return minutes or None


def _duty_location_fields(a: models.DutyAssignment) -> dict:
    """location_name/location_type plus the normalized location_source/
    location_source_id, for every path a duty's location can come from:
    an EventLocation (standalone, or a live-resolved linked Mat/Building/
    Room wrapper — see resolve_location_display), the true legacy direct
    Room reference (a.room_id with no EventLocation at all), or neither."""
    if a.location:
        resolved = resolve_location_display(a.location)
        return {
            "location_name": resolved["name"],
            "location_type": resolved["location_type"],
            "location_source": resolved["location_source"],
            "location_source_id": resolved["location_source_id"],
        }
    if a.room:
        return {
            "location_name": _room_display_name(a.room),
            "location_type": "ROOM",
            "location_source": "room",
            "location_source_id": a.room_id,
        }
    return {"location_name": None, "location_type": None, "location_source": None, "location_source_id": None}


def _duty_dict(a: models.DutyAssignment):
    room = a.room
    building = None
    floor = None
    if room:
        floor, building = _room_context(room)
    elif a.location:
        if a.location.room:
            room = a.location.room
            floor, building = _room_context(room)
        elif a.location.building:
            building = a.location.building

    area = a.operational_area
    res = {
        "id": a.id,
        "staff_id": a.staff_id,
        "shift_id": a.shift_id,
        "shift_name": a.shift.shift_name if a.shift else None,
        "staff_name": a.staff.full_name if a.staff else None,
        "category": a.staff.category if a.staff else None,
        "room_id": room.id if room else a.room_id,
        "room_name": room.name if room else None,
        "floor_id": floor.id if floor else None,
        "floor_name": floor.name if floor else None,
        "building_id": building.id if building else None,
        "building_name": building.name if building else None,
        "location_id": a.location_id,
        **_duty_location_fields(a),
        "duty_type": a.duty_type,
        # WHO this duty reports under — see models.OperationalArea. None for
        # any duty that predates this column and whose duty_type wasn't
        # recognized by the migration's deterministic backfill (see
        # "Other / Unclassified Duties" in the My Work UI) — never guessed.
        "operational_area_id": a.operational_area_id,
        "operational_area_name": area.name if area else None,
        "operational_area_code": area.code if area else None,
        "start_time": a.start_time.isoformat() if a.start_time else None,
        "end_time": a.end_time.isoformat() if a.end_time else None,
        "notes": a.notes,
    }
    overflow = _duty_shift_overflow_minutes(a)
    if overflow:
        res["warning"] = "Duty extends outside assigned shift window."
        res["outside_shift_minutes"] = overflow
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

    # Validate room_id if provided (legacy)
    if payload.room_id is not None:
        if not db.get(models.Room, payload.room_id):
            raise HTTPException(404, "Room not found")

    # Operational area is required for every NEW duty (existing historical
    # duties stay NULL/unclassified — see migration a5c9e2f7d1b4 — this only
    # gates duties created from here on).
    if not payload.operational_area_id:
        raise HTTPException(400, "Operational area is required")
    area = db.get(models.OperationalArea, payload.operational_area_id)
    if not area:
        raise HTTPException(404, "Operational area not found")
    if not area.is_active:
        raise HTTPException(400, f"Operational area '{area.name}' is inactive and cannot be used for new duty assignments.")

    # Validate shift_id if provided
    shift = None
    if payload.shift_id is not None:
        shift = db.get(models.StaffShift, payload.shift_id)
        if not shift:
            raise HTTPException(404, "Shift not found")
        if shift.staff_id != payload.staff_id:
            raise HTTPException(400, "Duty staff_id does not match shift staff_id")

    data = payload.model_dump()
    location_source = data.pop("location_source", None)
    location_source_id = data.pop("location_source_id", None)

    # Normalized location selection (see GET /event-locations/available)
    # takes priority: resolves/reuses the matching EventLocation wrapper
    # around an existing Mat/Building/Room instead of requiring the
    # organizer to have pre-created one. Falls back to a direct location_id
    # (an existing standalone EventLocation) when no source is given.
    if location_source and location_source_id is not None:
        wrapper = resolve_event_location_for_source(db, location_source, location_source_id)
        if not wrapper.is_active:
            raise HTTPException(400, f"Location '{wrapper.name}' is inactive and cannot be used for new duty assignments.")
        data["location_id"] = wrapper.id
    elif data.get("location_id") is not None:
        loc = db.get(models.EventLocation, data["location_id"])
        if not loc:
            raise HTTPException(404, "Event location not found")
        if not loc.is_active:
            raise HTTPException(400, f"Location '{loc.name}' is inactive and cannot be used for new duty assignments.")

    a = models.DutyAssignment(**data)
    db.add(a)
    db.commit()
    db.refresh(a)
    # _duty_dict computes the Section 7 outside-shift-window warning itself
    # (from a.shift), so every read path — this response, list_duties,
    # get_shift, /api/me/duties — shows it consistently.
    return _duty_dict(a)


@router.put("/duties/{duty_id}")
def update_duty(duty_id: int, payload: schemas.DutyAssignmentUpdate, db: Session = Depends(get_db)):
    a = db.get(models.DutyAssignment, duty_id)
    if not a:
        raise HTTPException(404, "Duty assignment not found")
    data = payload.model_dump(exclude_unset=True)
    location_source = data.pop("location_source", None)
    location_source_id = data.pop("location_source_id", None)

    target_staff_id = data.get("staff_id", a.staff_id)
    if "staff_id" in data and not db.get(models.StaffMember, target_staff_id):
        raise HTTPException(404, "Staff member not found")

    if location_source and location_source_id is not None:
        wrapper = resolve_event_location_for_source(db, location_source, location_source_id)
        if not wrapper.is_active and wrapper.id != a.location_id:
            raise HTTPException(400, f"Location '{wrapper.name}' is inactive and cannot be used for new duty assignments.")
        data["location_id"] = wrapper.id
    elif "location_id" in data and data["location_id"] is not None:
        loc = db.get(models.EventLocation, data["location_id"])
        if not loc:
            raise HTTPException(404, "Event location not found")
        if not loc.is_active and data["location_id"] != a.location_id:
            raise HTTPException(400, f"Location '{loc.name}' is inactive and cannot be used for new duty assignments.")

    if "room_id" in data and data["room_id"] is not None:
        if not db.get(models.Room, data["room_id"]):
            raise HTTPException(404, "Room not found")

    # Historical duties may keep operational_area_id = NULL until an
    # organizer explicitly sets it — updating other fields never forces
    # this. But an explicit change to a real area must be a valid, active one.
    if "operational_area_id" in data and data["operational_area_id"] is not None:
        area = db.get(models.OperationalArea, data["operational_area_id"])
        if not area:
            raise HTTPException(404, "Operational area not found")
        if not area.is_active and data["operational_area_id"] != a.operational_area_id:
            raise HTTPException(400, f"Operational area '{area.name}' is inactive and cannot be used for new duty assignments.")

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
    return _duty_dict(a)


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


def _incharges_summary(incharges: "list[models.ShiftOperationalIncharge]") -> list[dict]:
    """Groups a ShiftBlock's ShiftOperationalIncharge rows by area, e.g.
    [{operational_area_id, operational_area_name, staff: [{id, full_name}]}]
    — the shape the organizer's ShiftBlock roster and My Work's "Report To" /
    "You Are In-Charge" sections both render directly."""
    grouped: dict[int, dict] = {}
    for r in incharges:
        area = r.operational_area
        group = grouped.setdefault(
            r.operational_area_id,
            {
                "operational_area_id": r.operational_area_id,
                "operational_area_name": area.name if area else None,
                "operational_area_code": area.code if area else None,
                "staff": [],
            },
        )
        staff = r.staff
        group["staff"].append({"id": r.staff_id, "full_name": staff.full_name if staff else f"Staff #{r.staff_id}"})
    return sorted(grouped.values(), key=lambda g: (g["operational_area_name"] or ""))


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
        res["incharges"] = _incharges_summary(b.incharges or [])
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

    # A staff member still leading an Operational Area for this shift block
    # can't be silently dropped from the workforce out from under that
    # leadership — the organizer must remove/replace the in-charge
    # assignment(s) first (see /shift-blocks/{id}/incharges).
    removed_sids = [sid for sid in current_assignments if sid not in unique_target_sids]
    if removed_sids:
        incharge_rows = (
            db.query(models.ShiftOperationalIncharge)
            .filter(
                models.ShiftOperationalIncharge.shift_block_id == block_id,
                models.ShiftOperationalIncharge.staff_id.in_(removed_sids),
            )
            .all()
        )
        if incharge_rows:
            row = incharge_rows[0]
            staff_name = row.staff.full_name if row.staff else f"Staff #{row.staff_id}"
            area_name = row.operational_area.name if row.operational_area else f"area #{row.operational_area_id}"
            raise HTTPException(
                409,
                f"Cannot remove {staff_name} from this shift block: they are still in-charge of {area_name}. "
                "Remove or replace their in-charge assignment first."
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
    # Same delete-safety for Operational Area leadership: deleting the block
    # would cascade away shift_operational_incharges rows too (silently
    # orphaning leadership), so refuse if any exist.
    if b.incharges:
        raise HTTPException(
            409,
            "Cannot delete this shift because it has Operational Area in-charges assigned. "
            "Remove the in-charge assignments first."
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
    incharge_row = (
        db.query(models.ShiftOperationalIncharge)
        .filter(
            models.ShiftOperationalIncharge.shift_block_id == s.shift_block_id,
            models.ShiftOperationalIncharge.staff_id == s.staff_id,
        )
        .first()
    )
    if incharge_row:
        staff_name = s.staff.full_name if s.staff else f"Staff #{s.staff_id}"
        area_name = incharge_row.operational_area.name if incharge_row.operational_area else f"area #{incharge_row.operational_area_id}"
        raise HTTPException(
            409,
            f"Cannot remove assignment for {staff_name}: they are still in-charge of {area_name} for this shift. "
            "Remove or replace their in-charge assignment first."
        )
    db.delete(s)
    db.commit()


# --- Shift-wise Operational Area in-charges ---

def _shift_incharges_list(block_id: int, db: Session) -> list[dict]:
    rows = (
        db.query(models.ShiftOperationalIncharge)
        .filter(models.ShiftOperationalIncharge.shift_block_id == block_id)
        .all()
    )
    return _incharges_summary(rows)


@router.get("/shift-blocks/{block_id}/incharges")
def list_shift_incharges(block_id: int, db: Session = Depends(get_db)):
    if not db.get(models.ShiftBlock, block_id):
        raise HTTPException(404, "Shift block not found")
    return _shift_incharges_list(block_id, db)


@router.put("/shift-blocks/{block_id}/incharges")
def sync_shift_incharges(
    block_id: int, payload: list[schemas.ShiftAreaInchargeGroup], db: Session = Depends(get_db)
):
    """Full replace of this ShiftBlock's Operational Area leadership — same
    "whole desired state in, whole state written back" convention as
    PUT /shift-blocks/{id}/staff above. An area omitted from the payload
    loses any in-charges it currently has."""
    b = db.get(models.ShiftBlock, block_id)
    if not b:
        raise HTTPException(404, "Shift block not found")

    # V1 eligibility rule: only staff already on this ShiftBlock's own
    # workforce (StaffShift) may be made in-charge of it — never an
    # arbitrary staff member from outside this shift.
    assigned_staff_ids = {a.staff_id for a in (b.staff_assignments or [])}

    target: dict[int, set[int]] = {}
    for group in payload:
        area = db.get(models.OperationalArea, group.operational_area_id)
        if not area:
            raise HTTPException(404, f"Operational area {group.operational_area_id} not found")
        unique_sids = list(dict.fromkeys(group.staff_ids))
        if unique_sids and not area.is_active:
            raise HTTPException(400, f"Operational area '{area.name}' is inactive and cannot have in-charges assigned.")
        for sid in unique_sids:
            staff = db.get(models.StaffMember, sid)
            if not staff:
                raise HTTPException(404, f"Staff member with id {sid} not found")
            if sid not in assigned_staff_ids:
                raise HTTPException(
                    400,
                    f"{staff.full_name} is not assigned to this shift block and cannot be made in-charge of it.",
                )
        target.setdefault(group.operational_area_id, set()).update(unique_sids)

    existing = (
        db.query(models.ShiftOperationalIncharge)
        .filter(models.ShiftOperationalIncharge.shift_block_id == block_id)
        .all()
    )
    existing_by_area: dict[int, dict[int, models.ShiftOperationalIncharge]] = {}
    for row in existing:
        existing_by_area.setdefault(row.operational_area_id, {})[row.staff_id] = row

    for area_id in set(target) | set(existing_by_area):
        current = existing_by_area.get(area_id, {})
        target_sids = target.get(area_id, set())
        for sid, row in current.items():
            if sid not in target_sids:
                db.delete(row)
        for sid in target_sids:
            if sid not in current:
                db.add(models.ShiftOperationalIncharge(shift_block_id=block_id, operational_area_id=area_id, staff_id=sid))

    db.commit()
    return _shift_incharges_list(block_id, db)

