"""Transport: drivers, vehicles (buses) and team transport assignments."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/transport", tags=["transport"])


# ---------- Drivers ----------
@router.get("/drivers", response_model=list[schemas.DriverRead])
def list_drivers(db: Session = Depends(get_db)):
    return db.query(models.Driver).order_by(models.Driver.name).all()


@router.post("/drivers", response_model=schemas.DriverRead, status_code=201)
def create_driver(payload: schemas.DriverCreate, db: Session = Depends(get_db)):
    d = models.Driver(**payload.model_dump())
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


@router.delete("/drivers/{driver_id}", status_code=204)
def delete_driver(driver_id: int, db: Session = Depends(get_db)):
    d = db.get(models.Driver, driver_id)
    if not d:
        raise HTTPException(404, "Driver not found")
    db.delete(d)
    db.commit()


# ---------- Vehicles ----------
def _vehicle_dict(v: models.TransportVehicle):
    return {
        "id": v.id, "label": v.label, "vehicle_type": v.vehicle_type,
        "capacity": v.capacity, "driver_id": v.driver_id,
        "driver_name": v.driver.name if v.driver else None, "notes": v.notes,
    }


@router.get("/vehicles")
def list_vehicles(db: Session = Depends(get_db)):
    return [_vehicle_dict(v) for v in db.query(models.TransportVehicle).order_by(models.TransportVehicle.label).all()]


@router.post("/vehicles", status_code=201)
def create_vehicle(payload: schemas.VehicleCreate, db: Session = Depends(get_db)):
    if payload.driver_id and not db.get(models.Driver, payload.driver_id):
        raise HTTPException(404, "Driver not found")
    v = models.TransportVehicle(**payload.model_dump())
    db.add(v)
    db.commit()
    db.refresh(v)
    return _vehicle_dict(v)


@router.delete("/vehicles/{vehicle_id}", status_code=204)
def delete_vehicle(vehicle_id: int, db: Session = Depends(get_db)):
    v = db.get(models.TransportVehicle, vehicle_id)
    if not v:
        raise HTTPException(404, "Vehicle not found")
    db.delete(v)
    db.commit()


# ---------- Assignments ----------
def _assignment_dict(a: models.TransportAssignment):
    return {
        "id": a.id,
        "vehicle_id": a.vehicle_id,
        "vehicle_label": a.vehicle.label if a.vehicle else None,
        "team_id": a.team_id,
        "team_name": a.team.name if a.team else None,
        "pickup_location": a.pickup_location,
        "drop_location": a.drop_location,
        "pickup_time": a.pickup_time.isoformat() if a.pickup_time else None,
        "route": a.route,
        "notes": a.notes,
    }


@router.get("/assignments")
def list_assignments(db: Session = Depends(get_db)):
    rows = db.query(models.TransportAssignment).order_by(models.TransportAssignment.id.desc()).all()
    return [_assignment_dict(a) for a in rows]


@router.post("/assignments", status_code=201)
def create_assignment(payload: schemas.TransportAssignmentCreate, db: Session = Depends(get_db)):
    if not db.get(models.TransportVehicle, payload.vehicle_id):
        raise HTTPException(404, "Vehicle not found")
    if payload.team_id and not db.get(models.Team, payload.team_id):
        raise HTTPException(404, "Team not found")
    a = models.TransportAssignment(**payload.model_dump())
    db.add(a)
    db.commit()
    db.refresh(a)
    return _assignment_dict(a)


@router.delete("/assignments/{assignment_id}", status_code=204)
def delete_assignment(assignment_id: int, db: Session = Depends(get_db)):
    a = db.get(models.TransportAssignment, assignment_id)
    if not a:
        raise HTTPException(404, "Assignment not found")
    db.delete(a)
    db.commit()
