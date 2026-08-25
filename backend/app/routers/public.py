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


def _public_team_name(db: Session, team_id):
    if not team_id:
        return None
    t = db.get(models.Team, team_id)
    return t.name if t else None


def _public_match_dict(m: models.Match, db: Session) -> dict:
    venue = db.get(models.Venue, m.venue_id) if m.venue_id else None
    return {
        "id": m.id,
        "tournament_id": m.tournament_id,
        "tournament_name": m.tournament.name if m.tournament else None,
        "sport": m.tournament.sport if m.tournament else None,
        "round_id": m.round_id,
        "round_name": m.round.name if m.round else None,
        "team_a_id": m.team_a_id,
        "team_a_name": _public_team_name(db, m.team_a_id),
        "team_b_id": m.team_b_id,
        "team_b_name": _public_team_name(db, m.team_b_id),
        "source_match_a_id": m.source_match_a_id,
        "source_match_b_id": m.source_match_b_id,
        "venue_name": venue.name if venue else None,
        "scheduled_at": m.scheduled_at.isoformat() if m.scheduled_at else None,
        "status": m.status,
        "team_a_score": m.team_a_score,
        "team_b_score": m.team_b_score,
        "winner_team_id": m.winner_team_id,
        "winner_team_name": _public_team_name(db, m.winner_team_id),
        "started_at": m.started_at.isoformat() if m.started_at else None,
        "ended_at": m.ended_at.isoformat() if m.ended_at else None,
        "notes": m.notes,
    }


@router.get("/tournaments")
def public_tournaments(db: Session = Depends(get_db)):
    rows = db.query(models.Tournament).filter(models.Tournament.status != "draft").order_by(models.Tournament.name).all()
    return [{"id": t.id, "name": t.name, "sport": t.sport, "status": t.status} for t in rows]


def _public_pool_dict(p: models.Pool) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "status": p.status,
        "team_count": len(p.teams),
        "match_count": len(p.matches),
        "teams": [{"id": t.id, "name": t.name} for t in p.teams],
    }


@router.get("/tournaments/{tournament_id}/bracket")
def public_bracket(tournament_id: int, db: Session = Depends(get_db)):
    t = db.get(models.Tournament, tournament_id)
    if not t or t.status == "draft":
        raise HTTPException(404, "Tournament not found")
    has_pools = any(r.pools for r in t.rounds)
    return {
        "id": t.id,
        "name": t.name,
        "sport": t.sport,
        "status": t.status,
        "has_pools": has_pools,
        "rounds": [
            {
                "id": r.id,
                "name": r.name,
                "sequence": r.sequence,
                # Knockout tree matches only here — pool/league matches live under
                # this round's "pools" instead, each with its own round-robin set.
                "matches": [_public_match_dict(m, db) for m in r.matches if m.match_type == "KNOCKOUT"],
                "pools": [_public_pool_dict(p) for p in r.pools],
            }
            for r in t.rounds
        ],
    }


@router.get("/pools/{pool_id}")
def public_pool_detail(pool_id: int, db: Session = Depends(get_db)):
    p = db.get(models.Pool, pool_id)
    if not p:
        raise HTTPException(404, "Pool not found")
    return {
        **_public_pool_dict(p),
        "tournament_id": p.tournament_id,
        "round_id": p.round_id,
        "matches": [_public_match_dict(m, db) for m in p.matches],
    }


@router.get("/pools/{pool_id}/standings")
def public_pool_standings(pool_id: int, db: Session = Depends(get_db)):
    from .pools import compute_standings  # local import: avoids a hard import-order dependency between routers

    p = db.get(models.Pool, pool_id)
    if not p:
        raise HTTPException(404, "Pool not found")
    return compute_standings(p)


@router.get("/matches/live")
def public_live_matches(db: Session = Depends(get_db)):
    rows = (
        db.query(models.Match)
        .filter(models.Match.status.in_(["ONGOING", "PAUSED"]))
        .order_by(models.Match.started_at.asc().nullslast())
        .all()
    )
    return [_public_match_dict(m, db) for m in rows]


@router.get("/matches/{match_id}")
def public_match_detail(match_id: int, db: Session = Depends(get_db)):
    m = db.get(models.Match, match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    d = _public_match_dict(m, db)
    d["events"] = [
        {
            "event_type": e.event_type,
            "team_id": e.team_id,
            "delta": e.delta,
            "team_a_score": e.team_a_score,
            "team_b_score": e.team_b_score,
            "created_at": e.created_at.isoformat(),
        }
        for e in m.events[-30:]  # recent history only — this isn't a full audit export
    ]
    d["team_a_roster"] = [{"full_name": p.full_name, "role": p.role} for p in m.team_a.participants] if m.team_a else []
    d["team_b_roster"] = [{"full_name": p.full_name, "role": p.role} for p in m.team_b.participants] if m.team_b else []
    return d


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
