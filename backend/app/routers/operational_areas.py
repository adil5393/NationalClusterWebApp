"""CRUD for OperationalArea — the stable shift-wise reporting/team
classification duties are grouped under (see models.OperationalArea for why
this exists separately from DutyAssignment.duty_type). Same small-lookup
shape and conventions as routers/event_locations.py."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/operational-areas", tags=["operational-areas"])


def _area_dict(area: models.OperationalArea, db: Session) -> dict:
    duty_count = db.query(models.DutyAssignment).filter(models.DutyAssignment.operational_area_id == area.id).count()
    return {
        "id": area.id,
        "code": area.code,
        "name": area.name,
        "description": area.description,
        "is_active": area.is_active,
        "sort_order": area.sort_order,
        "duty_count": duty_count,
        "created_at": area.created_at.isoformat() if area.created_at else None,
        "updated_at": area.updated_at.isoformat() if area.updated_at else None,
    }


@router.get("", response_model=list[schemas.OperationalAreaRead])
def list_operational_areas(
    active_only: bool | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.OperationalArea)
    if active_only is not None:
        q = q.filter(models.OperationalArea.is_active == active_only)
    rows = q.order_by(models.OperationalArea.sort_order.asc(), models.OperationalArea.name.asc()).all()
    return [_area_dict(a, db) for a in rows]


@router.get("/{area_id}", response_model=schemas.OperationalAreaRead)
def get_operational_area(area_id: int, db: Session = Depends(get_db)):
    area = db.get(models.OperationalArea, area_id)
    if not area:
        raise HTTPException(404, "Operational area not found")
    return _area_dict(area, db)


@router.post("", response_model=schemas.OperationalAreaRead, status_code=201)
def create_operational_area(payload: schemas.OperationalAreaCreate, db: Session = Depends(get_db)):
    name_clean = payload.name.strip()
    code_clean = payload.code.strip().upper()
    if not name_clean:
        raise HTTPException(400, "Area name cannot be empty")
    if not code_clean:
        raise HTTPException(400, "Area code cannot be empty")

    if db.query(models.OperationalArea).filter(func.lower(models.OperationalArea.name) == name_clean.lower()).first():
        raise HTTPException(400, f"An operational area with name '{name_clean}' already exists.")
    if db.query(models.OperationalArea).filter(func.upper(models.OperationalArea.code) == code_clean).first():
        raise HTTPException(400, f"An operational area with code '{code_clean}' already exists.")

    data = payload.model_dump()
    data["name"] = name_clean
    data["code"] = code_clean
    area = models.OperationalArea(**data)
    db.add(area)
    db.commit()
    db.refresh(area)
    return _area_dict(area, db)


@router.put("/{area_id}", response_model=schemas.OperationalAreaRead)
def update_operational_area(area_id: int, payload: schemas.OperationalAreaUpdate, db: Session = Depends(get_db)):
    area = db.get(models.OperationalArea, area_id)
    if not area:
        raise HTTPException(404, "Operational area not found")

    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name_clean = data["name"].strip()
        if not name_clean:
            raise HTTPException(400, "Area name cannot be empty")
        existing = db.query(models.OperationalArea).filter(
            func.lower(models.OperationalArea.name) == name_clean.lower(),
            models.OperationalArea.id != area_id,
        ).first()
        if existing:
            raise HTTPException(400, f"An operational area with name '{name_clean}' already exists.")
        data["name"] = name_clean

    if "code" in data and data["code"] is not None:
        code_clean = data["code"].strip().upper()
        if not code_clean:
            raise HTTPException(400, "Area code cannot be empty")
        existing = db.query(models.OperationalArea).filter(
            func.upper(models.OperationalArea.code) == code_clean,
            models.OperationalArea.id != area_id,
        ).first()
        if existing:
            raise HTTPException(400, f"An operational area with code '{code_clean}' already exists.")
        data["code"] = code_clean

    for k, val in data.items():
        setattr(area, k, val)
    db.commit()
    db.refresh(area)
    return _area_dict(area, db)


@router.delete("/{area_id}", status_code=204)
def delete_operational_area(area_id: int, db: Session = Depends(get_db)):
    area = db.get(models.OperationalArea, area_id)
    if not area:
        raise HTTPException(404, "Operational area not found")

    duty_count = db.query(models.DutyAssignment).filter(models.DutyAssignment.operational_area_id == area_id).count()
    incharge_count = (
        db.query(models.ShiftOperationalIncharge)
        .filter(models.ShiftOperationalIncharge.operational_area_id == area_id)
        .count()
    )
    if duty_count > 0 or incharge_count > 0:
        raise HTTPException(
            409,
            "Operational area is used by existing duties or in-charge assignments. Deactivate it instead.",
        )

    db.delete(area)
    db.commit()
