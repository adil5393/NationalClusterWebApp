from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/participants", tags=["participants"])


@router.get("", response_model=list[schemas.ParticipantRead])
def list_participants(team_id: int | None = Query(None), db: Session = Depends(get_db)):
    q = db.query(models.Participant)
    if team_id:
        q = q.filter(models.Participant.team_id == team_id)
    return q.order_by(models.Participant.full_name).all()


@router.post("/{participant_id}/attendance", response_model=schemas.ParticipantRead)
def set_attendance(participant_id: int, payload: schemas.AttendanceUpdate, db: Session = Depends(get_db)):
    p = db.get(models.Participant, participant_id)
    if not p:
        raise HTTPException(404, "Participant not found")
    p.is_present = payload.present
    p.checked_in_at = datetime.now(timezone.utc) if payload.present else None
    db.commit()
    db.refresh(p)
    return p


@router.post("", response_model=schemas.ParticipantRead, status_code=201)
def create_participant(payload: schemas.ParticipantCreate, db: Session = Depends(get_db)):
    if not db.get(models.Team, payload.team_id):
        raise HTTPException(404, "Team not found")
    p = models.Participant(**payload.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.put("/{participant_id}", response_model=schemas.ParticipantRead)
def update_participant(participant_id: int, payload: schemas.ParticipantUpdate, db: Session = Depends(get_db)):
    p = db.get(models.Participant, participant_id)
    if not p:
        raise HTTPException(404, "Participant not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{participant_id}", status_code=204)
def delete_participant(participant_id: int, db: Session = Depends(get_db)):
    p = db.get(models.Participant, participant_id)
    if not p:
        raise HTTPException(404, "Participant not found")
    db.delete(p)
    db.commit()
