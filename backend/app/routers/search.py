"""Simple cross-entity global search over admin data (Phase 1 foundation)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
def search(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    like = f"%{q}%"
    results = []

    for t in (
        db.query(models.Team)
        .filter(
            models.Team.name.ilike(like)
            | models.Team.school.ilike(like)
            | models.Team.region.ilike(like)
            | models.Team.country.ilike(like)
        )
        .limit(10)
        .all()
    ):
        results.append({"type": "team", "id": t.id, "label": t.name, "meta": t.region or t.country})

    for r in (
        db.query(models.Room)
        .filter(models.Room.name.ilike(like) | models.Room.room_type.ilike(like))
        .limit(10)
        .all()
    ):
        results.append({"type": "room", "id": r.id, "label": r.name, "meta": r.room_type})

    for k in (
        db.query(models.KnowledgeItem)
        .filter(
            models.KnowledgeItem.title.ilike(like)
            | models.KnowledgeItem.description.ilike(like)
            | models.KnowledgeItem.tags.ilike(like)
        )
        .limit(10)
        .all()
    ):
        results.append(
            {"type": "knowledge", "id": k.id, "label": k.title, "meta": f"{k.category} · {k.status}"}
        )

    for p in (
        db.query(models.ProcurementItem)
        .filter(models.ProcurementItem.title.ilike(like) | models.ProcurementItem.supplier.ilike(like))
        .limit(10)
        .all()
    ):
        results.append({"type": "procurement", "id": p.id, "label": p.title, "meta": p.status})

    for a in (
        db.query(models.Announcement)
        .filter(models.Announcement.title.ilike(like) | models.Announcement.message.ilike(like))
        .limit(10)
        .all()
    ):
        results.append({"type": "announcement", "id": a.id, "label": a.title, "meta": a.priority})

    return {"query": q, "count": len(results), "results": results}
