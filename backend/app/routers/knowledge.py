from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


def _to_read(item: models.KnowledgeItem) -> schemas.KnowledgeRead:
    return schemas.KnowledgeRead.model_validate(item)


@router.get("/meta")
def meta():
    return {
        "categories": schemas.KNOWLEDGE_CATEGORIES,
        "statuses": schemas.KNOWLEDGE_STATUSES,
    }


@router.get("", response_model=list[schemas.KnowledgeRead])
def list_items(
    db: Session = Depends(get_db),
    category: str | None = Query(None),
    status: str | None = Query(None),
    q: str | None = Query(None),
):
    query = db.query(models.KnowledgeItem)
    if category:
        query = query.filter(models.KnowledgeItem.category == category)
    if status:
        query = query.filter(models.KnowledgeItem.status == status)
    if q:
        like = f"%{q}%"
        query = query.filter(
            models.KnowledgeItem.title.ilike(like) | models.KnowledgeItem.description.ilike(like)
        )
    items = query.order_by(models.KnowledgeItem.updated_at.desc()).all()
    return [_to_read(i) for i in items]


@router.post("", response_model=schemas.KnowledgeRead, status_code=201)
def create_item(payload: schemas.KnowledgeCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    data["tags"] = ",".join(data.get("tags") or [])
    item = models.KnowledgeItem(**data)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_read(item)


@router.get("/{item_id}", response_model=schemas.KnowledgeRead)
def get_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(models.KnowledgeItem, item_id)
    if not item:
        raise HTTPException(404, "Knowledge item not found")
    return _to_read(item)


@router.put("/{item_id}", response_model=schemas.KnowledgeRead)
def update_item(item_id: int, payload: schemas.KnowledgeUpdate, db: Session = Depends(get_db)):
    item = db.get(models.KnowledgeItem, item_id)
    if not item:
        raise HTTPException(404, "Knowledge item not found")
    data = payload.model_dump(exclude_unset=True)
    if "tags" in data:
        data["tags"] = ",".join(data.get("tags") or [])
    for key, value in data.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return _to_read(item)


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(models.KnowledgeItem, item_id)
    if not item:
        raise HTTPException(404, "Knowledge item not found")
    db.delete(item)
    db.commit()
