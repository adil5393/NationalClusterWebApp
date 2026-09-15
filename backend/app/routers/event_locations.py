from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/event-locations", tags=["event-locations"])


def _event_location_dict(loc: models.EventLocation, db: Session) -> dict:
    duty_count = db.query(models.DutyAssignment).filter(models.DutyAssignment.location_id == loc.id).count()
    return {
        "id": loc.id,
        "name": loc.name,
        "location_type": loc.location_type,
        "description": loc.description,
        "is_active": loc.is_active,
        "sort_order": loc.sort_order,
        "duty_count": duty_count,
        "created_at": loc.created_at.isoformat() if loc.created_at else None,
        "updated_at": loc.updated_at.isoformat() if loc.updated_at else None,
    }


@router.get("", response_model=list[schemas.EventLocationRead])
def list_event_locations(
    active_only: bool | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.EventLocation)
    if active_only is not None:
        q = q.filter(models.EventLocation.is_active == active_only)
    rows = q.order_by(models.EventLocation.sort_order.asc(), models.EventLocation.name.asc()).all()
    return [_event_location_dict(loc, db) for loc in rows]


@router.get("/{location_id}", response_model=schemas.EventLocationRead)
def get_event_location(location_id: int, db: Session = Depends(get_db)):
    loc = db.get(models.EventLocation, location_id)
    if not loc:
        raise HTTPException(404, "Event location not found")
    return _event_location_dict(loc, db)


@router.post("", response_model=schemas.EventLocationRead, status_code=201)
def create_event_location(payload: schemas.EventLocationCreate, db: Session = Depends(get_db)):
    name_clean = payload.name.strip()
    if not name_clean:
        raise HTTPException(400, "Location name cannot be empty")

    # Case-insensitive duplicate check
    existing = db.query(models.EventLocation).filter(
        func.lower(models.EventLocation.name) == name_clean.lower()
    ).first()
    if existing:
        raise HTTPException(400, f"An event location with name '{name_clean}' already exists.")

    data = payload.model_dump()
    data["name"] = name_clean
    loc = models.EventLocation(**data)
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return _event_location_dict(loc, db)


@router.put("/{location_id}", response_model=schemas.EventLocationRead)
def update_event_location(location_id: int, payload: schemas.EventLocationUpdate, db: Session = Depends(get_db)):
    loc = db.get(models.EventLocation, location_id)
    if not loc:
        raise HTTPException(404, "Event location not found")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name_clean = data["name"].strip()
        if not name_clean:
            raise HTTPException(400, "Location name cannot be empty")
        existing = db.query(models.EventLocation).filter(
            func.lower(models.EventLocation.name) == name_clean.lower(),
            models.EventLocation.id != location_id,
        ).first()
        if existing:
            raise HTTPException(400, f"An event location with name '{name_clean}' already exists.")
        data["name"] = name_clean

    for k, val in data.items():
        setattr(loc, k, val)
    db.commit()
    db.refresh(loc)
    return _event_location_dict(loc, db)


@router.delete("/{location_id}", status_code=204)
def delete_event_location(location_id: int, db: Session = Depends(get_db)):
    loc = db.get(models.EventLocation, location_id)
    if not loc:
        raise HTTPException(404, "Event location not found")

    # Location Deletion Safety: Refuse if referenced by duties
    duty_count = db.query(models.DutyAssignment).filter(models.DutyAssignment.location_id == location_id).count()
    if duty_count > 0:
        raise HTTPException(
            409,
            "Location is used by existing duties. Deactivate it instead."
        )

    db.delete(loc)
    db.commit()
