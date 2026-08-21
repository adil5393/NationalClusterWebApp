"""Buildings -> Floors -> Rooms hierarchical structure."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api", tags=["structure"])


# ---- Buildings ----
@router.get("/buildings", response_model=list[schemas.BuildingRead])
def list_buildings(db: Session = Depends(get_db)):
    return db.query(models.Building).order_by(models.Building.name).all()


@router.post("/buildings", response_model=schemas.BuildingRead, status_code=201)
def create_building(payload: schemas.BuildingCreate, db: Session = Depends(get_db)):
    building = models.Building(**payload.model_dump())
    db.add(building)
    db.commit()
    db.refresh(building)
    return building


@router.delete("/buildings/{building_id}", status_code=204)
def delete_building(building_id: int, db: Session = Depends(get_db)):
    obj = db.get(models.Building, building_id)
    if not obj:
        raise HTTPException(404, "Building not found")
    db.delete(obj)
    db.commit()


# ---- Floors ----
@router.post("/buildings/{building_id}/floors", response_model=schemas.FloorRead, status_code=201)
def create_floor(building_id: int, payload: schemas.FloorCreate, db: Session = Depends(get_db)):
    if not db.get(models.Building, building_id):
        raise HTTPException(404, "Building not found")
    floor = models.Floor(building_id=building_id, **payload.model_dump())
    db.add(floor)
    db.commit()
    db.refresh(floor)
    return floor


@router.delete("/floors/{floor_id}", status_code=204)
def delete_floor(floor_id: int, db: Session = Depends(get_db)):
    obj = db.get(models.Floor, floor_id)
    if not obj:
        raise HTTPException(404, "Floor not found")
    db.delete(obj)
    db.commit()


# ---- Rooms ----
@router.post("/floors/{floor_id}/rooms", response_model=schemas.RoomRead, status_code=201)
def create_room(floor_id: int, payload: schemas.RoomCreate, db: Session = Depends(get_db)):
    if not db.get(models.Floor, floor_id):
        raise HTTPException(404, "Floor not found")
    room = models.Room(floor_id=floor_id, **payload.model_dump())
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


@router.delete("/rooms/{room_id}", status_code=204)
def delete_room(room_id: int, db: Session = Depends(get_db)):
    obj = db.get(models.Room, room_id)
    if not obj:
        raise HTTPException(404, "Room not found")
    db.delete(obj)
    db.commit()
