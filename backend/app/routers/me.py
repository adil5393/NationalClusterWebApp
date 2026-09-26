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
import math
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import id_card, models
from ..config import settings
from ..database import get_db
from ..ws import broadcast_callbacks_change_sync
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


# ---------- Your matches (any account) ----------
# Matches this login has been assigned to (models.Match.assigned_users) —
# shown as "Your Matches" on whichever page the account lands on (Dashboard,
# My Work, My ID Card). Keyed off the session's own account, so it works for
# organizer, staff and volunteer logins alike and never exposes anyone else's.
_MATCH_STATUS_ORDER = {"ONGOING": 0, "PAUSED": 1, "SCHEDULED": 2, "POSTPONED": 3, "COMPLETED": 4, "CANCELLED": 5}


@router.get("/matches")
def my_matches(current: models.OrganizerUser = Depends(require_auth)):
    from .matches import _match_number  # local: matches.py is a much heavier import

    far_future = datetime.max.replace(tzinfo=timezone.utc)

    def sort_key(m: models.Match):
        when = m.scheduled_at if m.scheduled_at else far_future
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        finished = m.status in ("COMPLETED", "CANCELLED")
        # In progress first, then upcoming by time; finished ones last, newest first.
        return (_MATCH_STATUS_ORDER.get(m.status, 9), -when.timestamp() if finished else when.timestamp(), m.id)

    out = []
    for m in sorted(current.assigned_matches, key=sort_key):
        out.append({
            "id": m.id,
            "match_number": _match_number(m) if m.round else None,
            "tournament_name": m.tournament.name if m.tournament else None,
            "round_name": m.round.name if m.round else None,
            "pool_name": m.pool.name if m.pool else None,
            "team_a_name": m.team_a.name if m.team_a else None,
            "team_b_name": m.team_b.name if m.team_b else None,
            "team_a_score": m.team_a_score,
            "team_b_score": m.team_b_score,
            "status": m.status,
            "scheduled_at": m.scheduled_at,
            "mat_name": m.mat.name if m.mat else None,
            "venue_name": m.venue.name if m.venue else None,
        })
    return out


# ---------- "Call me back" requests (models.CallbackRequest) ----------
# Every logged-in account sees every request, tagged with its helpline
# (e.g. "Accommodation Help"), and anyone can mark one handled; the staff
# member it's addressed to sees it flagged "For you".
_CALLBACK_HANDLED_VISIBLE = timedelta(hours=24)
_CALLBACK_STATUSES = {"PENDING", "DONE", "UNREACHABLE"}


def _callback_orphaned(req: models.CallbackRequest) -> bool:
    staff = req.staff_member
    return staff is None or not any(u.is_active for u in staff.organizer_users)


def _callback_visible_to(req: models.CallbackRequest, current: models.OrganizerUser, my_staff_ids: set[int]) -> bool:
    return True  # every logged-in account (require_auth) — see the note above


def _room_label(a: models.AccommodationAssignment) -> "str | None":
    room = a.room
    if not room:
        return None
    building = room.floor.building if room.floor else None
    return f"{building.name} · {room.name}" if building else room.name


def _callback_room(req: models.CallbackRequest, db: Session) -> "str | None":
    """Where the requester is staying, so staff can also just walk over: the
    participant's own bed allotment if they have one, otherwise their team's
    whole-team room(s). Looked up live, so it follows later room changes."""
    if req.participant_id:
        own = db.query(models.AccommodationAssignment).filter_by(participant_id=req.participant_id).first()
        if own and _room_label(own):
            return _room_label(own)
    if req.team_id:
        rooms = [
            label
            for a in db.query(models.AccommodationAssignment)
            .filter(models.AccommodationAssignment.team_id == req.team_id, models.AccommodationAssignment.participant_id.is_(None))
            .all()
            if (label := _room_label(a))
        ]
        if rooms:
            return ", ".join(dict.fromkeys(rooms))
    return None


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle (haversine) distance in metres."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _callback_location(req: models.CallbackRequest) -> "dict | None":
    if req.latitude is None or req.longitude is None:
        return None
    dist = _distance_m(req.latitude, req.longitude, settings.campus_lat, settings.campus_lng)
    return {
        "latitude": req.latitude,
        "longitude": req.longitude,
        "accuracy_m": round(req.location_accuracy_m) if req.location_accuracy_m is not None else None,
        "distance_from_campus_m": round(dist),
        "on_campus": dist <= settings.campus_radius_m,
    }


def _callback_dict(req: models.CallbackRequest, my_staff_ids: set[int], db: Session) -> dict:
    team = req.team
    return {
        "topic": req.topic,
        "room": _callback_room(req, db),
        "location": _callback_location(req),
        "id": req.id,
        "requester_name": req.requester_name,
        "requester_role": req.requester_role,
        "requester_kind": req.requester_kind,
        "team_name": team.name if team else None,
        "school_code": team.school_code if team else None,
        "callback_phone": req.callback_phone,
        "message": req.message,
        "status": req.status,
        "created_at": req.created_at,
        "staff_member_id": req.staff_member_id,
        "staff_name": req.staff_member.full_name if req.staff_member else None,
        # True = addressed to this login's own staff member ("For you").
        "for_me": req.staff_member_id in my_staff_ids,
        # True = the addressee has no active login of their own.
        "unreachable_in_app": _callback_orphaned(req),
        "handled_by_name": (req.handled_by.full_name or req.handled_by.username) if req.handled_by else None,
        "handled_at": req.handled_at,
    }


@router.get("/callbacks")
def my_callbacks(current: models.OrganizerUser = Depends(require_auth), db: Session = Depends(get_db)):
    my_staff_ids = {s.id for s in current.staff_members}
    cutoff = datetime.now(timezone.utc) - _CALLBACK_HANDLED_VISIBLE
    rows = (
        db.query(models.CallbackRequest)
        .filter(
            (models.CallbackRequest.status == "PENDING")
            | (models.CallbackRequest.handled_at >= cutoff)
        )
        .order_by(models.CallbackRequest.created_at.desc())
        .all()
    )
    visible = [r for r in rows if _callback_visible_to(r, current, my_staff_ids)]
    # Waiting requests first (oldest first — they've waited longest), then handled.
    pending = sorted((r for r in visible if r.status == "PENDING"), key=lambda r: r.created_at)
    handled = [r for r in visible if r.status != "PENDING"]
    return [_callback_dict(r, my_staff_ids, db) for r in pending + handled]


class CallbackStatusUpdate(BaseModel):
    status: str  # PENDING (reopen) | DONE | UNREACHABLE


@router.post("/callbacks/{callback_id}/status")
def set_callback_status(
    callback_id: int,
    payload: CallbackStatusUpdate,
    current: models.OrganizerUser = Depends(require_auth),
    db: Session = Depends(get_db),
):
    if payload.status not in _CALLBACK_STATUSES:
        raise HTTPException(400, "Unknown status")
    req = db.get(models.CallbackRequest, callback_id)
    my_staff_ids = {s.id for s in current.staff_members}
    if not req or not _callback_visible_to(req, current, my_staff_ids):
        raise HTTPException(404, "Request not found")
    req.status = payload.status
    if payload.status != "PENDING":
        # Handled — the requester's location isn't needed any more.
        req.latitude = req.longitude = req.location_accuracy_m = None
    if payload.status == "PENDING":
        req.handled_by_user_id = None
        req.handled_at = None
    else:
        req.handled_by_user_id = current.id
        req.handled_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(req)
    broadcast_callbacks_change_sync()
    return _callback_dict(req, my_staff_ids, db)


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
