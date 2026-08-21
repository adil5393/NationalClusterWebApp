"""Public, read-only endpoints. These expose ONLY non-sensitive fields and never
leak internal organizer data (procurement, knowledge base, contacts, notes)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/teams", response_model=list[schemas.TeamPublic])
def public_teams(db: Session = Depends(get_db)):
    return db.query(models.Team).order_by(models.Team.name).all()


@router.get("/announcements", response_model=list[schemas.AnnouncementRead])
def public_announcements(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    items = (
        db.query(models.Announcement)
        .filter(models.Announcement.is_published.is_(True))
        .filter(
            (models.Announcement.audience.in_(["everyone", "coaches"]))
        )
        .order_by(models.Announcement.published_at.desc().nullslast())
        .all()
    )
    return [a for a in items if not a.expires_at or a.expires_at > now]
