"""Self-service "My Work" endpoints for an individual staff member's own
shifts, duties and tasks — the normal-staff counterpart to staff.py /
tasks.py's organizer-wide views. Identity always comes from the
authenticated session's linked StaffMember (security.resolve_self_staff),
never from a client-supplied staff id, so Staff A can never read or
complete Staff B's data by guessing/changing an id.

Also resolves shift-wise Operational Area in-charges for "Report To" (every
staff member) and "You Are In-Charge" / team visibility (an in-charge only).
IMPORTANT: DutyAssignment.shift_id points at a StaffShift row, not a
ShiftBlock — every in-charge lookup here goes through
DutyAssignment.shift_id -> StaffShift.shift_block_id -> ShiftOperationalIncharge.shift_block_id,
never a direct id comparison. See models.ShiftOperationalIncharge.

Reuses staff.py's existing `_shift_dict` / `_duty_dict` row-shaping so the
same fields already used by the organizer UI show up here."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from .. import id_card, models
from ..database import get_db
from ..security import require_auth, resolve_self_staff, resolve_self_volunteer
from .staff import _duty_dict, _shift_dict
from .volunteers import _photo_path

router = APIRouter(prefix="/api/me", tags=["me"])

_EPOCH = datetime.min.replace(tzinfo=timezone.utc)


def _self_staff(
    current: models.OrganizerUser = Depends(require_auth),
) -> models.StaffMember:
    staff = resolve_self_staff(current)
    if not staff:
        raise HTTPException(404, "No staff profile is linked to this account")
    return staff


def _self_volunteer(
    current: models.OrganizerUser = Depends(require_auth),
) -> models.Volunteer:
    volunteer = resolve_self_volunteer(current)
    if not volunteer:
        raise HTTPException(404, "No volunteer profile is linked to this account")
    return volunteer


def _my_shifts(staff: models.StaffMember) -> list[dict]:
    rows = sorted(staff.shifts or [], key=lambda s: s.start_time or _EPOCH)
    return [_shift_dict(s) for s in rows]


def _area_incharges_for_duty(d: models.DutyAssignment, db: Session) -> list[dict]:
    """Who leads d's Operational Area in the ShiftBlock d's shift belongs
    to — [] if the duty isn't classified into an area, or has no shift at
    all (unscheduled/emergency duties have nothing to resolve "for this
    ShiftBlock" against)."""
    if not d.operational_area_id or not d.shift:
        return []
    shift_block_id = d.shift.shift_block_id
    rows = (
        db.query(models.ShiftOperationalIncharge)
        .filter(
            models.ShiftOperationalIncharge.shift_block_id == shift_block_id,
            models.ShiftOperationalIncharge.operational_area_id == d.operational_area_id,
        )
        .all()
    )
    return [
        {"id": r.staff_id, "full_name": r.staff.full_name if r.staff else None, "phone": r.staff.phone if r.staff else None}
        for r in rows
    ]


def _my_duties(staff: models.StaffMember, db: Session) -> list[dict]:
    rows = sorted(staff.duties or [], key=lambda d: d.start_time or _EPOCH)
    result = []
    for d in rows:
        item = _duty_dict(d)
        item["operational_area_incharges"] = _area_incharges_for_duty(d, db)
        result.append(item)
    return result


def _task_dict(t: models.Task) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "status": t.status,
        "priority": t.priority,
        "category": t.category,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "shift_id": t.shift_id,
    }


def _my_tasks(staff: models.StaffMember, db: Session) -> list[dict]:
    rows = (
        db.query(models.Task)
        .filter(models.Task.assigned_staff_id == staff.id)
        .order_by(models.Task.due_date.is_(None), models.Task.due_date.asc(), models.Task.id.desc())
        .all()
    )
    return [_task_dict(t) for t in rows]


def _my_incharge_of(staff: models.StaffMember, db: Session) -> list[dict]:
    """Every (ShiftBlock, OperationalArea) this staff member leads — the
    "YOU ARE IN-CHARGE" cards. `staff_count` is the distinct staff with a
    duty in that area for that shift (read-only headline count; the actual
    roster is fetched on demand via /me/incharge/{shift_block_id}/{area_id}/team)."""
    rows = (
        db.query(models.ShiftOperationalIncharge)
        .filter(models.ShiftOperationalIncharge.staff_id == staff.id)
        .all()
    )
    my_shift_id_by_block = {s.shift_block_id: s.id for s in (staff.shifts or [])}
    result = []
    for r in rows:
        area = r.operational_area
        staff_count = (
            db.query(models.DutyAssignment.staff_id)
            .join(models.StaffShift, models.DutyAssignment.shift_id == models.StaffShift.id)
            .filter(
                models.StaffShift.shift_block_id == r.shift_block_id,
                models.DutyAssignment.operational_area_id == r.operational_area_id,
            )
            .distinct()
            .count()
        )
        result.append(
            {
                "shift_block_id": r.shift_block_id,
                # This in-charge's own StaffShift id for that block — lets the
                # frontend attach this card to the same ShiftCard duties/tasks
                # are already grouped under (both keyed by StaffShift.id).
                "shift_id": my_shift_id_by_block.get(r.shift_block_id),
                "operational_area_id": r.operational_area_id,
                "operational_area_name": area.name if area else None,
                "operational_area_code": area.code if area else None,
                "staff_count": staff_count,
            }
        )
    return result


@router.get("/shifts")
def my_shifts(staff: models.StaffMember = Depends(_self_staff)):
    return _my_shifts(staff)


@router.get("/duties")
def my_duties(staff: models.StaffMember = Depends(_self_staff), db: Session = Depends(get_db)):
    return _my_duties(staff, db)


@router.get("/tasks")
def my_tasks(staff: models.StaffMember = Depends(_self_staff), db: Session = Depends(get_db)):
    return _my_tasks(staff, db)


@router.get("/work")
def my_work(staff: models.StaffMember = Depends(_self_staff), db: Session = Depends(get_db)):
    """One combined snapshot for the My Work home screen instead of four
    separate round trips — the frontend always needs all of it together."""
    return {
        "staff": {"id": staff.id, "full_name": staff.full_name, "category": staff.category},
        "shifts": _my_shifts(staff),
        "duties": _my_duties(staff, db),
        "tasks": _my_tasks(staff, db),
        "incharge_of": _my_incharge_of(staff, db),
    }


@router.patch("/tasks/{task_id}/complete")
def complete_my_task(
    task_id: int,
    staff: models.StaffMember = Depends(_self_staff),
    db: Session = Depends(get_db),
):
    """One-way: marks the task completed. There's no existing reopen/undo
    business rule for tasks (routers/tasks.py has no such transition either),
    so self-service intentionally doesn't expose one — an organizer can still
    reopen it from the Tasks board if genuinely needed."""
    t = db.get(models.Task, task_id)
    if not t or t.assigned_staff_id != staff.id:
        raise HTTPException(404, "Task not found")
    if t.status != "completed":
        t.status = "completed"
        db.commit()
        db.refresh(t)
    return _task_dict(t)


@router.get("/incharge/{shift_block_id}/{operational_area_id}/team")
def my_incharge_team(
    shift_block_id: int,
    operational_area_id: int,
    staff: models.StaffMember = Depends(_self_staff),
    db: Session = Depends(get_db),
):
    """Read-only team roster for an in-charge — the [View Team] action.
    Ownership is enforced by requiring an actual ShiftOperationalIncharge
    row for (this exact shift_block_id, this exact operational_area_id,
    this staff member) before anything is returned: a normal staff member,
    or an in-charge of a *different* area/shift, gets the same 404 as a
    nonexistent one — no confirmation that the area/shift/other staff exist.
    This is intentionally read-only: no edit/create/delete capability is
    exposed here, only names/phone/duty timing for people already assigned
    to duties in this area for this shift."""
    is_incharge = (
        db.query(models.ShiftOperationalIncharge)
        .filter(
            models.ShiftOperationalIncharge.shift_block_id == shift_block_id,
            models.ShiftOperationalIncharge.operational_area_id == operational_area_id,
            models.ShiftOperationalIncharge.staff_id == staff.id,
        )
        .first()
    )
    if not is_incharge:
        raise HTTPException(404, "In-charge assignment not found")

    duties = (
        db.query(models.DutyAssignment)
        .join(models.StaffShift, models.DutyAssignment.shift_id == models.StaffShift.id)
        .filter(
            models.StaffShift.shift_block_id == shift_block_id,
            models.DutyAssignment.operational_area_id == operational_area_id,
        )
        .all()
    )
    by_staff: dict[int, dict] = {}
    for d in duties:
        member = d.staff
        entry = by_staff.setdefault(
            d.staff_id,
            {
                "id": d.staff_id,
                "full_name": member.full_name if member else f"Staff #{d.staff_id}",
                "phone": member.phone if member else None,
                "duties": [],
            },
        )
        loc = d.location
        entry["duties"].append(
            {
                "id": d.id,
                "duty_type": d.duty_type,
                "start_time": d.start_time.isoformat() if d.start_time else None,
                "end_time": d.end_time.isoformat() if d.end_time else None,
                "location_name": loc.name if loc else (d.room.name if d.room else None),
            }
        )
    return sorted(by_staff.values(), key=lambda s: s["full_name"] or "")


# ---------- Volunteer self-service ----------
# A volunteer's own login gets no organizer module access at all (see
# schemas.VOLUNTEER_BASE_PERMISSIONS) — this is the entire self-service
# surface for that account: their own profile and their own ID card,
# resolved from the session's OrganizerUser<->Volunteer link
# (security.resolve_self_volunteer), never a client-supplied volunteer id.
@router.get("/volunteer")
def my_volunteer_profile(volunteer: models.Volunteer = Depends(_self_volunteer)):
    return {
        "id": volunteer.id,
        "full_name": volunteer.full_name,
        "student_class": volunteer.student_class,
        "gender": volunteer.gender,
        "phone": volunteer.phone,
        "email": volunteer.email,
        "photo_url": volunteer.photo_url,
    }


@router.get("/volunteer/idcard.pdf")
def my_volunteer_idcard(volunteer: models.Volunteer = Depends(_self_volunteer)):
    card = id_card.render_volunteer_id_card_page(volunteer, _photo_path(volunteer))
    pdf = id_card.build_pdf([card])
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="volunteer-idcard-{volunteer.id}.pdf"'},
    )
