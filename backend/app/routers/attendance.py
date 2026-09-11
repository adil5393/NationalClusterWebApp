"""Marking event-day attendance — deliberately its own module/permission (see
schemas.ORGANIZER_MODULES: "attendance"), separate from Teams & Participants
edit access. This lets check-in/gate staff be granted just this one narrow
capability without also being able to add, edit, or delete participant
records. (The generic participant edit endpoints can't touch is_present
anyway — it isn't part of ParticipantUpdate — so this is the only way in.)"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth_utils import verify_password
from ..database import get_db
from ..ws import broadcast_roster_change_sync

router = APIRouter(prefix="/api/participants", tags=["attendance"])
coach_router = APIRouter(prefix="/api/coaches", tags=["attendance"])


def _require_admin_password(db: Session, password: "str | None") -> None:
    """Un-marking an already-present member back to absent requires an admin
    account's password — same "type an admin password to unlock" shape as
    public.py's reveal_team_contacts, just gating a destructive
    organizer-portal action instead of a public reveal. Prevents a non-admin
    gate/check-in staff account (which can hold just the narrow "attendance"
    permission — see module docstring) from undoing another staff member's
    check-in, or silently dropping a member off the team's billed receipt
    total (see receipt.py) by mis-clicking."""
    if not password:
        raise HTTPException(401, "Admin password is required to mark a present member absent")
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
