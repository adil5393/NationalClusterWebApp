"""Public, read-only endpoints. These expose ONLY non-sensitive fields and never
leak internal organizer data (procurement, knowledge base, contacts, notes)."""
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth_utils import verify_password
from ..database import get_db
from ..face_crop import suggest_crop
from ..image_utils import optimize_image

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
            "affiliation_number": t.affiliation_number,
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


@router.get("/accommodation")
def public_accommodation(db: Session = Depends(get_db)):
    """Hostel blocks shown on the public /accommodation page — structural
    info only (name, code, description, room/capacity counts). No occupancy
    or who's-assigned-where: that's per-team and only shown on that team's
    own portal (see public_team_detail's "accommodation" key)."""
    result = []
    for b in db.query(models.Building).order_by(models.Building.name).all():
        rooms = [r for f in b.floors for r in f.rooms]
        room_types = sorted({r.room_type for r in rooms if r.room_type})
        result.append({
            "id": b.id,
            "name": b.name,
            "code": b.code,
            "description": b.description,
            "floor_count": len(b.floors),
            "room_count": len(rooms),
            "capacity": sum(r.capacity or 0 for r in rooms),
            "room_types": room_types,
        })
    return result


@router.get("/gallery", response_model=list[schemas.GalleryPhotoRead])
def public_gallery(db: Session = Depends(get_db)):
    """Day/group-tagged photos for the homepage's swiping card + full album
    view — a richer sibling of public_about_images below (which stays a
    flat untagged list, still used by the About page's flipbook)."""
    return (
        db.query(models.GalleryPhoto)
        .order_by(models.GalleryPhoto.tag.asc(), models.GalleryPhoto.created_at.asc())
        .all()
    )


@router.get("/accommodation-rules", response_model=list[schemas.AccommodationRuleRead])
def public_accommodation_rules(db: Session = Depends(get_db)):
    return (
        db.query(models.AccommodationRule)
        .filter(models.AccommodationRule.is_published.is_(True))
        .order_by(models.AccommodationRule.sequence.asc(), models.AccommodationRule.id.asc())
        .all()
    )


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


@router.get("/faqs", response_model=list[schemas.FaqRead])
def public_faqs(db: Session = Depends(get_db)):
    return (
        db.query(models.Faq)
        .filter(models.Faq.is_published.is_(True))
        .order_by(models.Faq.sequence.asc(), models.Faq.id.asc())
        .all()
    )


@router.post("/faq-questions", response_model=schemas.FaqQuestionRead, status_code=201)
def submit_faq_question(payload: schemas.FaqQuestionCreate, db: Session = Depends(get_db)):
    """The public FAQ page's "Ask a question" form — no auth, anyone can
    submit. Lands in the FAQ admin page's inbox (routers/faq.py) for an
    organizer to answer and promote, or dismiss."""
    if not payload.question.strip():
        raise HTTPException(400, "Question can't be empty")
    item = models.FaqQuestion(
        name=(payload.name or "").strip() or None,
        email=(payload.email or "").strip() or None,
        question=payload.question.strip(),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


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
        "age_group": m.tournament.age_group if m.tournament else None,
        "round_id": m.round_id,
        "round_name": m.round.name if m.round else None,
        "pool_id": m.pool_id,
        "pool_name": m.pool.name if m.pool else None,
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
        "mat_name": m.mat.name if m.mat else None,
        "scheduled_at": m.scheduled_at.isoformat() if m.scheduled_at else None,
        "scheduled_end_at": m.scheduled_end_at.isoformat() if m.scheduled_end_at else None,
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


@router.get("/matches/schedule")
def public_match_schedule(db: Session = Depends(get_db)):
    """Every match considered "Scheduled" for the public Schedule page's
    Match Schedule tab: has both a mat AND a date/time assigned — the same
    "mat + day + time" rule the organizer applies when working the Fixtures
    page (see routers/matches.py, MatGroundAssignment.tsx). Includes every
    status (not just upcoming) so a completed or live match still shows its
    slot/result in the day's programme, not just what's still ahead. Draft
    tournaments are excluded, same as every other public tournament-scoped
    endpoint (see public_tournaments above)."""
    rows = (
        db.query(models.Match)
        .join(models.Tournament, models.Match.tournament_id == models.Tournament.id)
        .filter(models.Tournament.status != "draft")
        .filter(models.Match.scheduled_at.isnot(None))
        .filter(models.Match.mat_id.isnot(None))
        .order_by(models.Match.scheduled_at.asc())
        .all()
    )
    return [_public_match_dict(m, db) for m in rows]


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
    # /reveal-contacts check to get them, see below. aadhaar_no is withheld
    # too — it's only ever baked into the rendered PDF, never sent to a client.
    coaches = [
        {
            "id": c.id, "full_name": c.full_name, "role": c.role, "email": c.email, "photo_url": c.photo_url,
            "photo_uploads_locked": c.photo_uploads_locked_effective,
        }
        for c in team.coaches
    ]
    has_hidden_contacts = any(c.phone for c in team.coaches)
    participants = [
        {
            "id": p.id,
            "full_name": p.full_name,
            "role": p.role,
            "age_group": p.age_group,
            "photo_url": p.photo_url,
            "photo_finalized": p.photo_finalized,
            "photo_uploads_locked": p.photo_uploads_locked_effective,
        }
        for p in team.participants
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
        "photo_uploads_locked": team.photo_uploads_locked_effective,
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
    return {
        "coaches": [
            {"id": c.id, "full_name": c.full_name, "role": c.role, "email": c.email, "phone": c.phone, "photo_url": c.photo_url}
            for c in team.coaches
        ]
    }


import re
from pathlib import Path

VALID_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ASSETS_ABOUT_DIR = Path(__file__).resolve().parent.parent.parent / "assets" / "about"
ASSETS_PARTICIPANTS_DIR = Path(__file__).resolve().parent.parent.parent / "assets" / "participants"


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
    # /api/assets/..., not the bare /assets/... mount — production's nginx only
    # proxies /api/* to the backend; a bare /assets/ request never leaves nginx
    # (it tries to serve from the static frontend build and 404s there).
    return [f"/api/assets/about/{img.name}" for img in images]


# Wrong-date-of-birth OR wrong-admin-password attempts per participant_id,
# in-memory only (fine at this app's scale, and resets on restart — same
# "no persistence needed" tradeoff already accepted by reveal_team_contacts
# above having no limiter at all). Guards the one new unauthenticated
# disk-write surface this file exposes: without it, someone could brute-force
# a participant's date of birth (for a first upload) or an admin password
# (to replace an existing photo).
_PHOTO_UPLOAD_WINDOW_SECONDS = 15 * 60
_PHOTO_UPLOAD_MAX_ATTEMPTS = 5
_failed_photo_attempts: dict[int, list[float]] = {}


def _photo_upload_rate_limited(participant_id: int) -> bool:
    now = time.time()
    attempts = [t for t in _failed_photo_attempts.get(participant_id, []) if now - t < _PHOTO_UPLOAD_WINDOW_SECONDS]
    _failed_photo_attempts[participant_id] = attempts
    return len(attempts) >= _PHOTO_UPLOAD_MAX_ATTEMPTS


def _record_failed_photo_attempt(participant_id: int) -> int:
    """Records the attempt and returns how many more are allowed before the
    rate limiter kicks in, so callers can warn the user before they're locked out."""
    attempts = _failed_photo_attempts.setdefault(participant_id, [])
    attempts.append(time.time())
    return max(0, _PHOTO_UPLOAD_MAX_ATTEMPTS - len(attempts))


def _verify_any_admin_password(db: Session, password: str) -> bool:
    admins = (
        db.query(models.OrganizerUser)
        .filter(models.OrganizerUser.is_active.is_(True), models.OrganizerUser.is_admin.is_(True))
        .all()
    )
    return any(verify_password(password, u.password_hash) for u in admins)


_MAX_CROP_SUGGESTION_BYTES = 20 * 1024 * 1024


@router.post("/participants/photo-crop-suggestion")
async def photo_crop_suggestion(file: UploadFile = File(...)):
    """Runs face detection on a not-yet-uploaded photo and returns a
    suggested crop box (as 0-1 fractions of the image) for the manual
    cropper in the upload dialog to start from — this never saves or
    validates anything about the participant, it's a stateless preview step
    the frontend calls before the real POST /participants/{id}/photo."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in VALID_IMAGE_EXTENSIONS:
        raise HTTPException(400, "Unsupported file type (use JPG, PNG, or WEBP)")

    content = await file.read()
    if len(content) > _MAX_CROP_SUGGESTION_BYTES:
        raise HTTPException(400, "Image is too large")

    return suggest_crop(content)


@router.post("/participants/{participant_id}/photo")
async def upload_participant_photo(
    participant_id: int,
    date_of_birth: "str | None" = Form(None),
    admin_password: "str | None" = Form(None),
    cropped: bool = Form(False),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """A coach/manager uploads a participant's FIRST photo by typing that
    participant's date of birth (dd/mm/yyyy) — no login. Once a photo
    exists, it's locked: replacing it needs an admin account's password
    instead (same "type an admin password to unlock" shape as
    reveal_team_contacts above) — otherwise anyone who merely knows the DOB
    (which isn't especially secret — classmates, other parents) could keep
    swapping the photo out after the fact."""
    participant = db.get(models.Participant, participant_id)
    if not participant:
        raise HTTPException(404, "Participant not found")
    if participant.photo_uploads_locked_effective:
        raise HTTPException(423, "Photo uploads are currently locked by the organizers.")

    if _photo_upload_rate_limited(participant_id):
        raise HTTPException(429, "Too many attempts — try again later")

    if participant.photo_filename:
        if not admin_password or not _verify_any_admin_password(db, admin_password):
            remaining = _record_failed_photo_attempt(participant_id)
            raise HTTPException(
                401,
                {
                    "message": "This participant already has a photo — an admin password is required to replace it.",
                    "attempts_remaining": remaining,
                },
            )
    else:
        if not date_of_birth:
            raise HTTPException(400, "date_of_birth is required to upload a participant's first photo")
        try:
            submitted_dob = datetime.strptime(date_of_birth.strip(), "%d/%m/%Y").date()
        except ValueError:
            remaining = _record_failed_photo_attempt(participant_id)
            raise HTTPException(400, {"message": "Date of birth must be in dd/mm/yyyy format", "attempts_remaining": remaining})

        if not participant.date_of_birth or submitted_dob != participant.date_of_birth:
            remaining = _record_failed_photo_attempt(participant_id)
            raise HTTPException(401, {"message": "Date of birth does not match", "attempts_remaining": remaining})

    ext = Path(file.filename or "").suffix.lower()
    if ext not in VALID_IMAGE_EXTENSIONS:
        raise HTTPException(400, "Unsupported file type (use JPG, PNG, or WEBP)")

    ASSETS_PARTICIPANTS_DIR.mkdir(parents=True, exist_ok=True)
    content = optimize_image(await file.read(), ext)
    name = f"participant-{participant_id}-{uuid.uuid4().hex[:8]}{ext}"

    old_filename = participant.photo_filename
    (ASSETS_PARTICIPANTS_DIR / name).write_bytes(content)
    participant.photo_filename = name
    # `cropped` is only true when the file already went through the manual
    # crop-confirm dialog client-side — that's the one signal that tells a
    # deliberately-framed photo apart from a raw/legacy upload.
    participant.photo_finalized = cropped
    db.commit()

    if old_filename:
        old_path = ASSETS_PARTICIPANTS_DIR / old_filename
        if old_path.exists() and old_path.is_file():
            old_path.unlink()

    return {"photo_url": participant.photo_url, "photo_finalized": participant.photo_finalized}


# ---------- Coach / Manager self-service (photo + ID card) ----------------
# Same no-login shape as the participant photo flow above, just gated by the
# coach/manager's own registered phone number instead of a participant's date
# of birth (Coach has no DOB field) — and its own attempt-limiter dict so a
# coach_id and a participant_id sharing a numeric value can never collide.
ASSETS_COACHES_DIR = Path(__file__).resolve().parent.parent.parent / "assets" / "coaches"
_failed_coach_photo_attempts: dict[int, list[float]] = {}


def _coach_photo_upload_rate_limited(coach_id: int) -> bool:
    now = time.time()
    attempts = [t for t in _failed_coach_photo_attempts.get(coach_id, []) if now - t < _PHOTO_UPLOAD_WINDOW_SECONDS]
    _failed_coach_photo_attempts[coach_id] = attempts
    return len(attempts) >= _PHOTO_UPLOAD_MAX_ATTEMPTS


def _record_failed_coach_photo_attempt(coach_id: int) -> int:
    attempts = _failed_coach_photo_attempts.setdefault(coach_id, [])
    attempts.append(time.time())
    return max(0, _PHOTO_UPLOAD_MAX_ATTEMPTS - len(attempts))


def _digits_only(raw: str) -> str:
    return re.sub(r"\D", "", raw)


def _global_photo_uploads_locked(db: Session) -> bool:
    """The admin-panel-wide kill-switch (routers/teams.py's
    get_photo_uploads_lock/set_photo_uploads_lock) — ORed with each team's own
    Team.photo_uploads_locked wherever uploads are gated or the lock state is
    reported to a client."""
    settings_row = db.get(models.AppSettings, 1)
    return bool(settings_row and settings_row.global_photo_uploads_locked)


@router.post("/coaches/{coach_id}/photo")
async def upload_coach_photo(
    coach_id: int,
    phone: "str | None" = Form(None),
    admin_password: "str | None" = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """A coach/manager uploads a first photo — for themselves OR their
    counterpart — by typing ANY phone number registered to that team's
    coaching staff (Coach or Manager), no login. This is deliberately not
    limited to this coach's own phone: a team may only have one number on
    file (e.g. the Coach's, with the Manager's left blank), and either of
    them should still be able to authorize either person's photo upload with
    whatever number the team actually has registered. Same "first upload is
    self-service, replacing an existing one needs an admin password" shape
    as upload_participant_photo above."""
    coach = db.get(models.Coach, coach_id)
    if not coach:
        raise HTTPException(404, "Coach not found")
    if coach.photo_uploads_locked_effective:
        raise HTTPException(423, "Photo uploads are currently locked by the organizers.")

    if _coach_photo_upload_rate_limited(coach_id):
        raise HTTPException(429, "Too many attempts — try again later")

    if coach.photo_filename:
        if not admin_password or not _verify_any_admin_password(db, admin_password):
            remaining = _record_failed_coach_photo_attempt(coach_id)
            raise HTTPException(
                401,
                {
                    "message": "This coach/manager already has a photo — an admin password is required to replace it.",
                    "attempts_remaining": remaining,
                },
            )
    else:
        team_phones = {_digits_only(c.phone) for c in coach.team.coaches if c.phone}
        if not phone or not team_phones or _digits_only(phone) not in team_phones:
            remaining = _record_failed_coach_photo_attempt(coach_id)
            raise HTTPException(401, {"message": "Phone number does not match", "attempts_remaining": remaining})

    ext = Path(file.filename or "").suffix.lower()
    if ext not in VALID_IMAGE_EXTENSIONS:
        raise HTTPException(400, "Unsupported file type (use JPG, PNG, or WEBP)")

    ASSETS_COACHES_DIR.mkdir(parents=True, exist_ok=True)
    content = optimize_image(await file.read(), ext)
    name = f"coach-{coach_id}-{uuid.uuid4().hex[:8]}{ext}"

    old_filename = coach.photo_filename
    (ASSETS_COACHES_DIR / name).write_bytes(content)
    coach.photo_filename = name
    db.commit()

    if old_filename:
        old_path = ASSETS_COACHES_DIR / old_filename
        if old_path.exists() and old_path.is_file():
            old_path.unlink()

    return {"photo_url": coach.photo_url}


@router.get("/contacts", response_model=list[schemas.ContactGroupRead])
def public_contacts(db: Session = Depends(get_db)):
    """Public helpline and emergency contacts directory for visiting state delegations."""
    from sqlalchemy.orm import joinedload
    from .contacts import _serialize_group

    groups = (
        db.query(models.ContactGroup)
        .options(
            joinedload(models.ContactGroup.operational_category),
            joinedload(models.ContactGroup.operational_area),
            joinedload(models.ContactGroup.lead_staff),
            joinedload(models.ContactGroup.staff_associations).joinedload(models.ContactGroupStaff.staff),
            joinedload(models.ContactGroup.external_contacts),
        )
        .filter(models.ContactGroup.is_active == True, models.ContactGroup.is_public == True)
        .order_by(models.ContactGroup.display_order, models.ContactGroup.id)
        .all()
    )
    return [_serialize_group(g, db, include_category_staff=False) for g in groups]



