"""Public, read-only endpoints. These expose ONLY non-sensitive fields and never
leak internal organizer data (procurement, knowledge base, contacts, notes)."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
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


@router.get("/teams/{team_id}")
def public_team_detail(team_id: int, db: Session = Depends(get_db)):
    """Shareable team portal: room, coach, transport and schedule in one place."""
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")

    coaches = [
        {"full_name": c.full_name, "email": c.email, "phone": c.phone} for c in team.coaches
    ]
    participants = [
        {"full_name": p.full_name, "role": p.role, "age_group": p.age_group} for p in team.participants
    ]

    accommodation = []
    for a in team.accommodation:
        room = a.room
        floor = room.floor if room else None
        building = floor.building if floor else None
        accommodation.append({
            "room": room.name if room else None,
            "floor": floor.name if floor else None,
            "building": building.name if building else None,
            "notes": a.notes,
        })

    transport = []
    for t in team.transport:
        vehicle = t.vehicle
        transport.append({
            "vehicle": vehicle.label if vehicle else None,
            "pickup_location": t.pickup_location,
            "drop_location": t.drop_location,
            "pickup_time": t.pickup_time.isoformat() if t.pickup_time else None,
            "route": t.route,
        })

    schedule_rows = (
        db.query(models.ScheduleEvent)
        .filter(models.ScheduleEvent.team_id == team_id)
        .order_by(models.ScheduleEvent.start_time.asc().nullslast())
        .all()
    )
    schedule = []
    for s in schedule_rows:
        venue = db.get(models.Venue, s.venue_id) if s.venue_id else None
        schedule.append({
            "title": s.title,
            "venue": venue.name if venue else None,
            "start_time": s.start_time.isoformat() if s.start_time else None,
            "end_time": s.end_time.isoformat() if s.end_time else None,
        })

    return {
        "id": team.id,
        "name": team.name,
        "school": team.school,
        "region": team.region,
        "country": team.country,
        "member_count": team.member_count,
        "coaches": coaches,
        "participants": participants,
        "accommodation": accommodation,
        "transport": transport,
        "schedule": schedule,
    }
