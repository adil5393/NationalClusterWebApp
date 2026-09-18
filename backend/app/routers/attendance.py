"""Marking event-day attendance — deliberately its own module/permission (see
schemas.ORGANIZER_MODULES: "attendance"), separate from Teams & Participants
edit access. This lets check-in/gate staff be granted just this one narrow
capability without also being able to add, edit, or delete participant
records. (The generic participant edit endpoints can't touch is_present
anyway — it isn't part of ParticipantUpdate — so this is the only way in.)

set_weight below is a separate, independent concern: it records a weigh-in
against the AKFI kabaddi weight-category caps in AGE_GROUP_WEIGHT_CAPS, but
never touches is_present/checked_in_at — an overweight player still showed
up and still gets billed (see payments.py's _present_members, which reads
is_present only). Weight instead gates match/pool/fixture eligibility: see
matches.py's _team_unplayable_reason, which excludes an overweight
participant from a team's present-player headcount via is_overweight below.
Once a weight is saved, changing it again requires an admin password (same
shape as _require_admin_password's un-mark-attendance gate) — only the
first save is free."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth_utils import verify_password
from ..database import get_db
from ..ws import broadcast_roster_change_sync

router = APIRouter(prefix="/api/participants", tags=["attendance"])
coach_router = APIRouter(prefix="/api/coaches", tags=["attendance"])

# Rs.-style flat lookup (see receipt.py's fee constants for the same
# pattern): kg cap per age group, matched case-insensitively/trimmed since
# Participant.age_group is free text (models.py). Not every age group in
# use has to be one of these three — see module docstring.
AGE_GROUP_WEIGHT_CAPS = {
    "under 14": 51,
    "under 17": 57,
    "under 19": 75,
}


def weight_cap_for(age_group: "str | None") -> "float | None":
    if not age_group:
        return None
    return AGE_GROUP_WEIGHT_CAPS.get(age_group.strip().lower())


def is_overweight(p: models.Participant) -> bool:
    """True only when the participant's age group has a defined cap AND a
    weigh-in has been recorded AND it's over that cap — used by matches.py
    to exclude them from a team's present-player headcount for match/pool/
    fixture eligibility. Never affects is_present/attendance/billing."""
    cap = weight_cap_for(p.age_group)
    return cap is not None and p.weight is not None and p.weight > cap


def _require_admin_password(
    db: Session, password: "str | None", action: str = "mark a present member absent"
) -> None:
    """Un-marking an already-present member back to absent, or changing an
    already-recorded weigh-in (see set_weight), requires an admin account's
    password — same "type an admin password to unlock" shape as
    public.py's reveal_team_contacts, just gating a destructive
    organizer-portal action instead of a public reveal. Prevents a non-admin
    gate/check-in staff account (which can hold just the narrow "attendance"
    permission — see module docstring) from undoing another staff member's
    check-in, silently dropping a member off the team's billed receipt total
    (see receipt.py), or quietly editing a weigh-in that decides match/pool/
    fixture eligibility, by mis-clicking."""
    if not password:
        raise HTTPException(401, f"Admin password is required to {action}")
    admins = (
        db.query(models.OrganizerUser)
        .filter(models.OrganizerUser.is_active.is_(True), models.OrganizerUser.is_admin.is_(True))
        .all()
    )
    if not any(verify_password(password, u.password_hash) for u in admins):
        raise HTTPException(401, "Incorrect admin password")


@router.post("/{participant_id}/attendance", response_model=schemas.ParticipantRead)
def set_attendance(participant_id: int, payload: schemas.AttendanceUpdate, db: Session = Depends(get_db)):
    p = db.get(models.Participant, participant_id)
    if not p:
        raise HTTPException(404, "Participant not found")
    if p.is_present and not payload.present:
        _require_admin_password(db, payload.admin_password)
    p.is_present = payload.present
    p.checked_in_at = datetime.now(timezone.utc) if payload.present else None
    db.commit()
    db.refresh(p)
    # The lone write path for is_present (individual toggle and bulk import
    # both funnel through here) — nudge the Fixture creation window so
    # another organizer's attendance change shows up there live.
    broadcast_roster_change_sync("participant_attendance")
    return p


@router.post("/{participant_id}/weight", response_model=schemas.ParticipantRead)
def set_weight(participant_id: int, payload: schemas.WeightUpdate, db: Session = Depends(get_db)):
    """Records a weigh-in — independent of is_present/attendance/billing
    (see module docstring); only feeds matches.py's match/pool/fixture
    eligibility check. The first save (currently unset) needs no password;
    changing an already-recorded weight (correcting a bad reading, or
    clearing it) needs an admin password, same shape as set_attendance's
    manual un-mark."""
    p = db.get(models.Participant, participant_id)
    if not p:
        raise HTTPException(404, "Participant not found")
    if payload.weight is not None and payload.weight <= 0:
        raise HTTPException(400, "Weight must be a positive number")
    if p.weight is not None and payload.weight != p.weight:
        _require_admin_password(db, payload.admin_password, action="change an already-recorded weigh-in")
    p.weight = payload.weight
    db.commit()
    db.refresh(p)
    # Weight now feeds match/pool/fixture eligibility (matches.py), so the
    # Matches builder's live eligible-count view still needs the nudge.
    broadcast_roster_change_sync("participant_attendance")
    return p


@router.post("/{participant_id}/active", response_model=schemas.ParticipantRead)
def set_active(participant_id: int, payload: schemas.ActiveUpdate, db: Session = Depends(get_db)):
    """Activates/deactivates a participant — gated by an admin password in
    both directions (unlike set_attendance's one-way gate above), since
    either transition changes whether their ID card renders at all: turning
    a participant inactive drops them from every ID-card export
    (id_card.py's callers in routers/exports.py all filter on this), e.g.
    for someone disqualified or withdrawn after registration; reactivating
    puts them straight back into every export. Never affects is_present,
    weight, billing, or match/pool eligibility — this is purely an ID-card
    opt-out, not a roster removal."""
    p = db.get(models.Participant, participant_id)
    if not p:
        raise HTTPException(404, "Participant not found")
    if payload.is_active != p.is_active:
        _require_admin_password(
            db, payload.admin_password,
            action=f"mark this participant {'active' if payload.is_active else 'inactive'}",
        )
    p.is_active = payload.is_active
    db.commit()
    db.refresh(p)
    return p


@coach_router.post("/{coach_id}/attendance", response_model=schemas.CoachRead)
def set_coach_attendance(coach_id: int, payload: schemas.AttendanceUpdate, db: Session = Depends(get_db)):
    c = db.get(models.Coach, coach_id)
    if not c:
        raise HTTPException(404, "Coach not found")
    if c.is_present and not payload.present:
        _require_admin_password(db, payload.admin_password)
    c.is_present = payload.present
    c.checked_in_at = datetime.now(timezone.utc) if payload.present else None
    db.commit()
    db.refresh(c)
    # Coaches never feed fixture eligibility/present-count logic, so unlike
    # the participant event above this has nothing downstream to nudge —
    # broadcast anyway, under its own event name, in case something else
    # (e.g. a future attendance dashboard) wants to listen for it.
    broadcast_roster_change_sync("coach_attendance")
    return c
