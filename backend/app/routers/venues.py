from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/venues", tags=["venues"])


@router.get("", response_model=list[schemas.VenueRead])
def list_venues(db: Session = Depends(get_db)):
    return db.query(models.Venue).order_by(models.Venue.name).all()


@router.post("", response_model=schemas.VenueRead, status_code=201)
def create_venue(payload: schemas.VenueCreate, db: Session = Depends(get_db)):
    v = models.Venue(**payload.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@router.put("/{venue_id}", response_model=schemas.VenueRead)
def update_venue(venue_id: int, payload: schemas.VenueUpdate, db: Session = Depends(get_db)):
    v = db.get(models.Venue, venue_id)
    if not v:
        raise HTTPException(404, "Venue not found")
    for k, val in payload.model_dump(exclude_unset=True).items():
        setattr(v, k, val)
    db.commit()
    db.refresh(v)
    return v


@router.delete("/{venue_id}", status_code=204)
def delete_venue(venue_id: int, db: Session = Depends(get_db)):
    v = db.get(models.Venue, venue_id)
    if not v:
        raise HTTPException(404, "Venue not found")

    match_count = db.query(models.Match).filter(models.Match.venue_id == venue_id).count()
    schedule_count = db.query(models.ScheduleEvent).filter(models.ScheduleEvent.venue_id == venue_id).count()
    if match_count > 0 or schedule_count > 0:
        raise HTTPException(
            409,
            f"'{v.name}' is referenced by {match_count} match(es) and {schedule_count} schedule event(s) and cannot be deleted.",
        )

    db.delete(v)
    db.commit()
