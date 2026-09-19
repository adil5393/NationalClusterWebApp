from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .public import ASSETS_PARTICIPANTS_DIR

router = APIRouter(prefix="/api/participants", tags=["participants"])


@router.get("", response_model=list[schemas.ParticipantRead])
def list_participants(team_id: int | None = Query(None), db: Session = Depends(get_db)):
    q = db.query(models.Participant)
    if team_id:
        q = q.filter(models.Participant.team_id == team_id)
    return q.order_by(models.Participant.full_name).all()


def _check_registration_no_free(db: Session, registration_no: "str | None", exclude_id: "int | None" = None) -> None:
    """registration_no is unique (models.Participant) — turn a would-be DB
    IntegrityError into a readable 409 the form can show."""
    if not registration_no:
        return
    q = db.query(models.Participant).filter(models.Participant.registration_no == registration_no)
    if exclude_id is not None:
        q = q.filter(models.Participant.id != exclude_id)
    if q.first():
        raise HTTPException(409, f"Registration No. {registration_no} is already assigned to another participant")


@router.post("", response_model=schemas.ParticipantRead, status_code=201)
def create_participant(payload: schemas.ParticipantCreate, db: Session = Depends(get_db)):
    if not db.get(models.Team, payload.team_id):
        raise HTTPException(404, "Team not found")
    _check_registration_no_free(db, payload.registration_no)
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
    data = payload.model_dump(exclude_unset=True)
    if data.get("team_id") is not None and not db.get(models.Team, data["team_id"]):
        raise HTTPException(404, "Team not found")
    if "registration_no" in data:
        _check_registration_no_free(db, data["registration_no"], exclude_id=p.id)
    for k, v in data.items():
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


@router.delete("/{participant_id}/photo", response_model=schemas.ParticipantRead)
def delete_participant_photo(participant_id: int, db: Session = Depends(get_db)):
    """Admin-side removal — e.g. a wrong/inappropriate photo uploaded via the
    public /public/participants/{id}/photo endpoint. Clears the DB reference
    and deletes the file from disk; safe to call even if the file is already
    gone (idempotent)."""
    p = db.get(models.Participant, participant_id)
    if not p:
        raise HTTPException(404, "Participant not found")
    if p.photo_filename:
        path = ASSETS_PARTICIPANTS_DIR / p.photo_filename
        if path.exists() and path.is_file():
            path.unlink()
        p.photo_filename = None
        db.commit()
        db.refresh(p)
    return p
