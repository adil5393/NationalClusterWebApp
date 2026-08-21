from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/announcements", tags=["announcements"])


@router.get("/meta")
def meta():
    return {
        "priorities": schemas.ANNOUNCEMENT_PRIORITIES,
        "audiences": schemas.ANNOUNCEMENT_AUDIENCES,
    }


@router.get("", response_model=list[schemas.AnnouncementRead])
def list_items(db: Session = Depends(get_db)):
    return (
        db.query(models.Announcement)
        .order_by(models.Announcement.published_at.desc().nullslast())
        .all()
    )


@router.post("", response_model=schemas.AnnouncementRead, status_code=201)
def create_item(payload: schemas.AnnouncementCreate, db: Session = Depends(get_db)):
    item = models.Announcement(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}", response_model=schemas.AnnouncementRead)
def update_item(item_id: int, payload: schemas.AnnouncementUpdate, db: Session = Depends(get_db)):
    item = db.get(models.Announcement, item_id)
    if not item:
        raise HTTPException(404, "Announcement not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(models.Announcement, item_id)
    if not item:
        raise HTTPException(404, "Announcement not found")
    db.delete(item)
    db.commit()
