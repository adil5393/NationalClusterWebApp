from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/procurement", tags=["procurement"])


@router.get("/meta")
def meta():
    return {"statuses": schemas.PROCUREMENT_STATUSES, "categories": schemas.KNOWLEDGE_CATEGORIES}


@router.get("", response_model=list[schemas.ProcurementRead])
def list_items(db: Session = Depends(get_db)):
    return db.query(models.ProcurementItem).order_by(models.ProcurementItem.updated_at.desc()).all()


@router.post("", response_model=schemas.ProcurementRead, status_code=201)
def create_item(payload: schemas.ProcurementCreate, db: Session = Depends(get_db)):
    item = models.ProcurementItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}", response_model=schemas.ProcurementRead)
def update_item(item_id: int, payload: schemas.ProcurementUpdate, db: Session = Depends(get_db)):
    item = db.get(models.ProcurementItem, item_id)
    if not item:
        raise HTTPException(404, "Procurement item not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(models.ProcurementItem, item_id)
    if not item:
        raise HTTPException(404, "Procurement item not found")
    db.delete(item)
    db.commit()
