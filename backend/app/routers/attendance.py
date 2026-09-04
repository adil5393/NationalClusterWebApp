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
from ..database import get_db
from ..ws import broadcast_roster_change_sync

router = APIRouter(prefix="/api/participants", tags=["attendance"])
coach_router = APIRouter(prefix="/api/coaches", tags=["attendance"])


@router.post("/{participant_id}/attendance", response_model=schemas.ParticipantRead)
def set_attendance(participant_id: int, payload: schemas.AttendanceUpdate, db: Session = Depends(get_db)):
    p = db.get(models.Participant, participant_id)
    if not p:
        raise HTTPException(404, "Participant not found")
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
