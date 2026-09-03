"""Mat / Ground registry — organizer-managed list of playing surfaces
("Mat 1", "Ground A", ...), assigned to matches via a dropdown (Match.mat_id,
see routers/matches.py PUT /api/matches/{id}/mat). Deliberately separate from
venues.py's Venue registry, which models the whole-event location rather than
a fast-changing per-match assignment.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/mats", tags=["mats"])


@router.get("", response_model=list[schemas.MatRead])
def list_mats(db: Session = Depends(get_db)):
    return db.query(models.Mat).order_by(models.Mat.name).all()


@router.post("", response_model=schemas.MatRead, status_code=201)
def create_mat(payload: schemas.MatCreate, db: Session = Depends(get_db)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    mat = models.Mat(name=name)
    db.add(mat)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"A mat/ground named '{name}' already exists")
    db.refresh(mat)
    return mat


@router.put("/{mat_id}", response_model=schemas.MatRead)
def update_mat(mat_id: int, payload: schemas.MatUpdate, db: Session = Depends(get_db)):
    mat = db.get(models.Mat, mat_id)
    if not mat:
        raise HTTPException(404, "Mat/ground not found")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            raise HTTPException(400, "Name is required")
        data["name"] = name
    for k, v in data.items():
        setattr(mat, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, f"A mat/ground named '{data.get('name')}' already exists")
    db.refresh(mat)
    return mat


@router.delete("/{mat_id}", status_code=204)
def delete_mat(mat_id: int, db: Session = Depends(get_db)):
    mat = db.get(models.Mat, mat_id)
    if not mat:
        raise HTTPException(404, "Mat/ground not found")
    db.delete(mat)
    db.commit()
