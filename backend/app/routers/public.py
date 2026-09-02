"""Public, read-only endpoints. These expose ONLY non-sensitive fields and never
leak internal organizer data (procurement, knowledge base, contacts, notes)."""
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth_utils import verify_password
from ..database import get_db

router = APIRouter(prefix="/api/public", tags=["public"])

_DRIVE_ID_RE = re.compile(r"(?:id=|/d/)([\w-]{25,})")


def _drive_urls(raw: "str | None") -> "tuple[str | None, str | None]":
    """A raw Google Drive "share" link (drive.google.com/open?id=... or
    /file/d/<id>/view) can't be hotlinked as an <img src> directly — Drive's
    /thumbnail endpoint can, PROVIDED the file is shared "anyone with the
    link"; if it's not, that endpoint silently redirects to an HTML
    permission page instead of image bytes, so the <img> just fails to load.
    Returns (thumbnail_url_for_img, normal_drive_view_url_for_a_fallback_link)
    — the frontend falls back to the second one if the first fails to load."""
    if not raw:
        return None, None
    m = _DRIVE_ID_RE.search(raw)
    if not m:
        return raw, raw
    file_id = m.group(1)
    return f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000", f"https://drive.google.com/file/d/{file_id}/view"


@router.get("/teams", response_model=list[schemas.TeamPublic])
def public_teams(db: Session = Depends(get_db)):
    teams = db.query(models.Team).order_by(models.Team.name).all()
    result = []
    for t in teams:
        photos = []
        for p in t.photos:
            thumbnail, view = _drive_urls(p.url)
            photos.append({"thumbnail": thumbnail, "view": view})
        result.append({
            "id": t.id,
            "name": t.name,
            "school": t.school,
            "school_code": t.school_code,
            "region": t.region,
            "country": t.country,
            "member_count": t.member_count,
            "photos": photos,
        })
    return result


@router.get("/schedule")
def public_schedule(db: Session = Depends(get_db)):
    """The tournament-wide schedule shown on the public site — unlike
    /api/schedule (organizer-only, gated behind the "schedule" module), this
    has no auth so visitors can see it. Every event, not just team-linked
    ones: an event with no team is a general/all-delegations one."""
    rows = db.query(models.ScheduleEvent).order_by(models.ScheduleEvent.start_time.asc().nullslast()).all()
    result = []
    for s in rows:
        team = db.get(models.Team, s.team_id) if s.team_id else None
        venue = db.get(models.Venue, s.venue_id) if s.venue_id else None
        result.append({
            "id": s.id,
            "title": s.title,
            "team_name": team.name if team else None,
            "venue_name": venue.name if venue else None,
            "start_time": s.start_time.isoformat() if s.start_time else None,
            "end_time": s.end_time.isoformat() if s.end_time else None,
            "description": s.description,
        })
    return result


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
        "source_pool_a_name": m.source_pool_a.name if m.source_pool_a else None,
        "source_pool_a_rank": m.source_pool_a_rank,
        "source_pool_b_name": m.source_pool_b.name if m.source_pool_b else None,
        "source_pool_b_rank": m.source_pool_b_rank,
        "venue_name": venue.name if venue else None,
        "scheduled_at": m.scheduled_at.isoformat() if m.scheduled_at else None,
        "status": m.status,
        "team_a_score": m.team_a_score,
        "team_b_score": m.team_b_score,
        "winner_team_id": m.winner_team_id,
        "winner_team_name": _public_team_name(db, m.winner_team_id),
        "forfeited_team_id": m.forfeited_team_id,
        "forfeited_team_name": _public_team_name(db, m.forfeited_team_id),
        "started_at": m.started_at.isoformat() if m.started_at else None,
        "ended_at": m.ended_at.isoformat() if m.ended_at else None,
        "notes": m.notes,
    }


@router.get("/tournaments")
def public_tournaments(db: Session = Depends(get_db)):
    rows = db.query(models.Tournament).filter(models.Tournament.status != "draft").order_by(models.Tournament.name).all()
    return [{"id": t.id, "name": t.name, "sport": t.sport, "status": t.status} for t in rows]


def _public_pool_dict(p: models.Pool) -> dict:
    # A cancelled match needs no result to count as resolved (same rule as
    # the organizer-side readiness check in routers/matches.py
    # _compute_advancing_teams) — so a pool with one cancelled match and the
    # rest completed is done, not stuck "in progress" forever.
    pending_count = sum(1 for m in p.matches if m.status not in ("COMPLETED", "CANCELLED"))
    return {
        "id": p.id,
        "name": p.name,
        "status": p.status,
        "team_count": len(p.teams),
        "match_count": len(p.matches),
        "pending_count": pending_count,
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
                "format": r.format,
                "source_round_id": r.source_round_id,
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
    # A school can field squads across several age groups — only list the
    # players actually in this match's tournament's age group, not the
    # team's whole roster (same "no age_group = open to everyone" convention
    # as routers/matches.py _check_team_age_group).
    age_group = m.tournament.age_group if m.tournament else None

    def _roster(team: "models.Team | None") -> list[dict]:
        if not team:
            return []
        participants = team.participants if not age_group else [p for p in team.participants if p.age_group == age_group]
        return [{"full_name": p.full_name, "role": p.role} for p in participants]

    d["team_a_roster"] = _roster(m.team_a)
    d["team_b_roster"] = _roster(m.team_b)
    return d


@router.get("/teams/{team_id}")
def public_team_detail(team_id: int, db: Session = Depends(get_db)):
    """Shareable team portal: room, coach, transport and schedule in one place."""
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")

    # Phone numbers are deliberately withheld here — a visitor has to pass the
    # /reveal-contacts check to get them, see below.
    coaches = [
        {"full_name": c.full_name, "role": c.role, "email": c.email} for c in team.coaches
    ]
    has_hidden_contacts = any(c.phone for c in team.coaches)
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

    photos = []
    for p in team.photos:
        thumbnail, view = _drive_urls(p.url)
        photos.append({"thumbnail": thumbnail, "view": view})

    return {
        "id": team.id,
        "name": team.name,
        "school": team.school,
        "region": team.region,
        "country": team.country,
        "member_count": team.member_count,
        "photos": photos,
        "coaches": coaches,
        "has_hidden_contacts": has_hidden_contacts,
        "participants": participants,
        "accommodation": accommodation,
        "transport": transport,
        "schedule": schedule,
    }


class RevealContactsRequest(BaseModel):
    password: str


@router.post("/teams/{team_id}/reveal-contacts")
def reveal_team_contacts(team_id: int, payload: RevealContactsRequest, db: Session = Depends(get_db)):
    """A public visitor proves they're staff by typing an admin account's
    password (not logging in — this stays a one-off unlock on this page) to
    see coach/manager phone numbers. Doesn't reveal which account matched, or
    whether the team even has any — same response shape either way."""
    is_admin_password = (
        db.query(models.OrganizerUser)
        .filter(models.OrganizerUser.is_active.is_(True), models.OrganizerUser.is_admin.is_(True))
        .all()
    )
    if not any(verify_password(payload.password, u.password_hash) for u in is_admin_password):
        raise HTTPException(401, "Incorrect password")

    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    return {"coaches": [{"full_name": c.full_name, "role": c.role, "phone": c.phone} for c in team.coaches]}


import re
from pathlib import Path

VALID_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ASSETS_ABOUT_DIR = Path(__file__).resolve().parent.parent.parent / "assets" / "about"


def _natural_sort_key(p: Path):
    """Sort filenames numerically (1.jpg, 2.jpg, 10.jpg) rather than lexical."""
    parts = re.split(r"(\d+)", p.name.lower())
    return [int(part) if part.isdigit() else part for part in parts]


@router.get("/about-images", response_model=list[str])
def public_about_images():
    """Discover and return event photographs from backend/assets/about/ sorted numerically."""
    if not ASSETS_ABOUT_DIR.exists() or not ASSETS_ABOUT_DIR.is_dir():
        return []

    images = [
        f
        for f in ASSETS_ABOUT_DIR.iterdir()
        if f.is_file() and f.suffix.lower() in VALID_IMAGE_EXTENSIONS and not f.name.startswith(".")
    ]
    images.sort(key=_natural_sort_key)
    return [f"/assets/about/{img.name}" for img in images]

