from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .public import ASSETS_COACHES_DIR

router = APIRouter(prefix="/api/coaches", tags=["coaches"])


@router.get("", response_model=list[schemas.CoachRead])
def list_coaches(team_id: int | None = Query(None), db: Session = Depends(get_db)):
    q = db.query(models.Coach)
    if team_id:
        q = q.filter(models.Coach.team_id == team_id)
    return q.order_by(models.Coach.full_name).all()


@router.post("", response_model=schemas.CoachRead, status_code=201)
def create_coach(payload: schemas.CoachCreate, db: Session = Depends(get_db)):
    if not db.get(models.Team, payload.team_id):
        raise HTTPException(404, "Team not found")
    c = models.Coach(**payload.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.put("/{coach_id}", response_model=schemas.CoachRead)
def update_coach(coach_id: int, payload: schemas.CoachUpdate, db: Session = Depends(get_db)):
    c = db.get(models.Coach, coach_id)
    if not c:
        raise HTTPException(404, "Coach not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/{coach_id}", status_code=204)
def delete_coach(coach_id: int, db: Session = Depends(get_db)):
    c = db.get(models.Coach, coach_id)
    if not c:
        raise HTTPException(404, "Coach not found")
    db.delete(c)
    db.commit()


@router.delete("/{coach_id}/photo", response_model=schemas.CoachRead)
def delete_coach_photo(coach_id: int, db: Session = Depends(get_db)):
    """Admin-side removal — e.g. a wrong/inappropriate photo uploaded via the
    public /public/coaches/{id}/photo endpoint. Mirrors
    participants.py's delete_participant_photo."""
    c = db.get(models.Coach, coach_id)
    if not c:
        raise HTTPException(404, "Coach not found")
    if c.photo_filename:
        path = ASSETS_COACHES_DIR / c.photo_filename
        if path.exists() and path.is_file():
            path.unlink()
        c.photo_filename = None
        db.commit()
        db.refresh(c)
    return c
