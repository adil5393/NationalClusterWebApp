"""Schedule: fixtures & ceremonies, optionally tied to a team; shown on team portals."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


def _dict(s: models.ScheduleEvent, db: Session):
    team = db.get(models.Team, s.team_id) if s.team_id else None
    venue = db.get(models.Venue, s.venue_id) if s.venue_id else None
    return {
        "id": s.id,
        "title": s.title,
        "team_id": s.team_id,
        "team_name": team.name if team else None,
        "venue_id": s.venue_id,
        "venue_name": venue.name if venue else None,
        "start_time": s.start_time.isoformat() if s.start_time else None,
        "end_time": s.end_time.isoformat() if s.end_time else None,
        "description": s.description,
    }


@router.get("")
def list_events(team_id: int | None = Query(None), db: Session = Depends(get_db)):
    q = db.query(models.ScheduleEvent)
    if team_id:
        q = q.filter(models.ScheduleEvent.team_id == team_id)
    rows = q.order_by(models.ScheduleEvent.start_time.asc().nullslast()).all()
    return [_dict(s, db) for s in rows]


@router.post("", status_code=201)
def create_event(payload: schemas.ScheduleEventCreate, db: Session = Depends(get_db)):
    if payload.team_id and not db.get(models.Team, payload.team_id):
        raise HTTPException(404, "Team not found")
    s = models.ScheduleEvent(**payload.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return _dict(s, db)


@router.put("/{event_id}")
def update_event(event_id: int, payload: schemas.ScheduleEventUpdate, db: Session = Depends(get_db)):
    s = db.get(models.ScheduleEvent, event_id)
    if not s:
        raise HTTPException(404, "Event not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return _dict(s, db)


@router.delete("/{event_id}", status_code=204)
def delete_event(event_id: int, db: Session = Depends(get_db)):
    s = db.get(models.ScheduleEvent, event_id)
    if not s:
        raise HTTPException(404, "Event not found")
    db.delete(s)
    db.commit()
