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
