from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from .accommodation import _room_headcount

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    teams = db.query(func.count(models.Team.id)).scalar() or 0
    participants = db.query(func.count(models.Participant.id)).scalar() or 0
    member_sum = db.query(func.coalesce(func.sum(models.Team.member_count), 0)).scalar() or 0
    rooms_total = db.query(func.count(models.Room.id)).scalar() or 0
    rooms_capacity = db.query(func.coalesce(func.sum(models.Room.capacity), 0)).scalar() or 0
    rooms_occupied = (
        db.query(func.count(func.distinct(models.AccommodationAssignment.room_id))).scalar() or 0
    )
    # Real headcount per room (whole-team assignments count their actual roster,
    # not "1 row") — same basis as the accommodation capacity check, so a room
    # flagged here is the same one that would block a new over-capacity assignment.
    rooms_over_capacity = sum(
        1 for r in db.query(models.Room).all()
        if r.capacity and _room_headcount(db, r.id) > r.capacity
    )
    vehicles = db.query(func.count(models.TransportVehicle.id)).scalar() or 0
    transport_assignments = db.query(func.count(models.TransportAssignment.id)).scalar() or 0
    procurement_open = (
        db.query(func.count(models.ProcurementItem.id))
        .filter(models.ProcurementItem.status.notin_(["Received", "Cancelled"]))
        .scalar()
        or 0
    )
    tasks_pending = (
        db.query(func.count(models.Task.id)).filter(models.Task.status != "completed").scalar() or 0
    )
    tasks_completed = (
        db.query(func.count(models.Task.id)).filter(models.Task.status == "completed").scalar() or 0
    )

    recent_decisions = (
        db.query(models.KnowledgeItem)
        .order_by(models.KnowledgeItem.updated_at.desc())
        .limit(5)
        .all()
    )
    recent_announcements = (
        db.query(models.Announcement)
        .order_by(models.Announcement.published_at.desc().nullslast())
        .limit(5)
        .all()
    )

    return {
        "participants": {"total": participants, "expected": 800, "member_sum": int(member_sum)},
        "teams": {"total": teams},
        "rooms": {
            "total": rooms_total,
            "occupied": rooms_occupied,
            "available": max(rooms_total - rooms_occupied, 0),
            "capacity": int(rooms_capacity),
            "over_capacity": rooms_over_capacity,
        },
        "transport": {"vehicles": vehicles, "assignments": transport_assignments},
        "procurement": {"open": procurement_open},
        "tasks": {"pending": tasks_pending, "completed": tasks_completed},
        "decisions": [
            {
                "id": d.id,
                "title": d.title,
                "category": d.category,
                "status": d.status,
                "updated_at": d.updated_at.isoformat() if d.updated_at else None,
            }
            for d in recent_decisions
        ],
        "announcements": [
            {
                "id": a.id,
                "title": a.title,
                "priority": a.priority,
                "published_at": a.published_at.isoformat() if a.published_at else None,
            }
            for a in recent_announcements
        ],
    }
