"""Tournaments -> Rounds -> Matches: fixture scheduling and live match tracking.

Organizer-only (gated centrally in main.py via require_module("matches")).
Public, read-only bracket/live views live in routers/public.py instead; the
WebSocket broadcast channel lives in routers/live_ws.py and is unauthenticated
by design (read-only fan-out — mutation always goes through the endpoints here).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, update
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import require_auth
from ..ws import broadcast_match_event_sync

router = APIRouter(tags=["matches"])


# ---------- display helpers (denormalized dicts, like schedule.py/staff.py) ----------
def _team_name(db: Session, team_id: int | None) -> str | None:
    if not team_id:
        return None
    t = db.get(models.Team, team_id)
    return t.name if t else None


def _match_dict(m: models.Match, db: Session) -> dict:
    venue = db.get(models.Venue, m.venue_id) if m.venue_id else None
    return {
        "id": m.id,
        "tournament_id": m.tournament_id,
        "tournament_name": m.tournament.name if m.tournament else None,
        "sport": m.tournament.sport if m.tournament else None,
        "age_group": m.tournament.age_group if m.tournament else None,
        "round_id": m.round_id,
        "round_name": m.round.name if m.round else None,
        "team_a_id": m.team_a_id,
        "team_a_name": _team_name(db, m.team_a_id),
        "team_b_id": m.team_b_id,
        "team_b_name": _team_name(db, m.team_b_id),
        "source_match_a_id": m.source_match_a_id,
        "source_match_b_id": m.source_match_b_id,
        "venue_id": m.venue_id,
        "venue_name": venue.name if venue else None,
        "scheduled_at": m.scheduled_at.isoformat() if m.scheduled_at else None,
        "status": m.status,
        "team_a_score": m.team_a_score,
        "team_b_score": m.team_b_score,
        "winner_team_id": m.winner_team_id,
        "winner_team_name": _team_name(db, m.winner_team_id),
        "started_at": m.started_at.isoformat() if m.started_at else None,
        "ended_at": m.ended_at.isoformat() if m.ended_at else None,
        "notes": m.notes,
    }


def _round_dict(r: models.Round, db: Session) -> dict:
    return {
        "id": r.id,
        "tournament_id": r.tournament_id,
        "name": r.name,
        "sequence": r.sequence,
        "matches": [_match_dict(m, db) for m in r.matches],
    }


def _tournament_dict(t: models.Tournament, db: Session, with_rounds: bool = False) -> dict:
    d = {
        "id": t.id,
        "name": t.name,
        "sport": t.sport,
        "age_group": t.age_group,
        "status": t.status,
        "notes": t.notes,
        "round_count": len(t.rounds),
        "match_count": sum(len(r.matches) for r in t.rounds),
    }
    if with_rounds:
        d["rounds"] = [_round_dict(r, db) for r in t.rounds]
    return d


def _event_dict(e: models.MatchEvent) -> dict:
    return {
        "id": e.id,
        "event_type": e.event_type,
        "team_id": e.team_id,
        "component": e.component,
        "delta": e.delta,
        "team_a_score": e.team_a_score,
        "team_b_score": e.team_b_score,
        "created_at": e.created_at.isoformat(),
    }


def _check_team_age_group(db: Session, team_id: int, age_group: str | None) -> None:
    """Guards against scheduling a team into a tournament scoped to an age group
    it doesn't actually field players in — e.g. an Under-14-only school can't be
    dropped into an Under-17 fixture. A tournament with no age_group is open to
    any team."""
    if not age_group:
        return
    has_player = (
        db.query(models.Participant.id)
        .filter(models.Participant.team_id == team_id, models.Participant.age_group == age_group)
        .first()
    )
    if not has_player:
        team = db.get(models.Team, team_id)
        team_name = team.name if team else f"Team {team_id}"
        raise HTTPException(400, f"{team_name} has no registered players in age group '{age_group}' — can't schedule them into this tournament")


def _propagate_winner(db: Session, match: models.Match) -> None:
    """Fill in the next match's team slot(s) that were waiting on this match's winner."""
    if not match.winner_team_id:
        return
    dependents = (
        db.query(models.Match)
        .filter((models.Match.source_match_a_id == match.id) | (models.Match.source_match_b_id == match.id))
        .all()
    )
    for dep in dependents:
        if dep.source_match_a_id == match.id and dep.team_a_id is None:
            dep.team_a_id = match.winner_team_id
        if dep.source_match_b_id == match.id and dep.team_b_id is None:
            dep.team_b_id = match.winner_team_id


# ---------- Tournaments ----------
@router.get("/api/tournaments")
def list_tournaments(db: Session = Depends(get_db)):
    rows = db.query(models.Tournament).order_by(models.Tournament.id.desc()).all()
    return [_tournament_dict(t, db) for t in rows]


@router.post("/api/tournaments", status_code=201)
def create_tournament(payload: schemas.TournamentCreate, db: Session = Depends(get_db)):
    t = models.Tournament(**payload.model_dump())
    db.add(t)
    db.commit()
    db.refresh(t)
    return _tournament_dict(t, db)


@router.get("/api/tournaments/{tournament_id}")
def get_tournament(tournament_id: int, db: Session = Depends(get_db)):
    t = db.get(models.Tournament, tournament_id)
    if not t:
        raise HTTPException(404, "Tournament not found")
    return _tournament_dict(t, db, with_rounds=True)


@router.put("/api/tournaments/{tournament_id}")
def update_tournament(tournament_id: int, payload: schemas.TournamentUpdate, db: Session = Depends(get_db)):
    t = db.get(models.Tournament, tournament_id)
    if not t:
        raise HTTPException(404, "Tournament not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return _tournament_dict(t, db)


@router.delete("/api/tournaments/{tournament_id}", status_code=204)
def delete_tournament(tournament_id: int, db: Session = Depends(get_db)):
    t = db.get(models.Tournament, tournament_id)
    if not t:
        raise HTTPException(404, "Tournament not found")
    db.delete(t)
    db.commit()


@router.get("/api/tournaments/{tournament_id}/bracket")
def get_bracket(tournament_id: int, db: Session = Depends(get_db)):
    t = db.get(models.Tournament, tournament_id)
    if not t:
        raise HTTPException(404, "Tournament not found")
    return _tournament_dict(t, db, with_rounds=True)


def _create_bye_match(db: Session, tournament_id: int, round_id: int, team_id: int) -> models.Match:
    """A visible, auto-completed stand-in for a bye — so a round with byes
    still shows every slot instead of silently vanishing, and the next
    round's already-known team is traceable back to this instead of looking
    like it appeared with no round-1 result at all."""
    now = datetime.now(timezone.utc)
    m = models.Match(
        tournament_id=tournament_id,
        round_id=round_id,
        team_a_id=team_id,
        status="COMPLETED",
        winner_team_id=team_id,
        started_at=now,
        ended_at=now,
        notes="Bye",
    )
    db.add(m)
    db.flush()
    return m


def _bracket_round_name(match_count: int) -> str:
    if match_count == 1:
        return "Final"
    if match_count == 2:
        return "Semi Final"
    if match_count == 4:
        return "Quarter Final"
    return f"Round of {match_count * 2}"


@router.post("/api/tournaments/{tournament_id}/generate-bracket", status_code=201)
def generate_bracket(tournament_id: int, payload: schemas.GenerateBracketRequest, db: Session = Depends(get_db)):
    """Builds a full single-elimination bracket from a flat team list: Round 1
    pairs them up, every later round is auto-created with placeholder slots
    (source_match_a/b_id) wired to the two matches that feed it, all the way
    down to a 1-match Final — so completing a match later fills the next
    round's slot automatically (see _propagate_winner). If the team count
    isn't a power of two, the extra top-of-list teams get a bye straight into
    round 2, spread out so no two byes land on the same pairing."""
    t = db.get(models.Tournament, tournament_id)
    if not t:
        raise HTTPException(404, "Tournament not found")

    team_ids = list(dict.fromkeys(payload.team_ids))  # de-dupe, keep order
    if len(team_ids) < 2:
        raise HTTPException(400, "Pick at least 2 teams to generate a bracket")
    for team_id in team_ids:
        if not db.get(models.Team, team_id):
            raise HTTPException(404, f"Team {team_id} not found")
        _check_team_age_group(db, team_id, t.age_group)

    existing_rounds = db.query(models.Round).filter(models.Round.tournament_id == tournament_id).count()
    if existing_rounds > 0 and not payload.replace:
        raise HTTPException(409, "This tournament already has fixtures — confirm to delete them and regenerate")
    if existing_rounds > 0:
        db.query(models.Round).filter(models.Round.tournament_id == tournament_id).delete()
        db.flush()

    n = len(team_ids)
    bracket_size = 1
    while bracket_size < n:
        bracket_size *= 2
    num_byes = bracket_size - n

    bye_positions: set[int] = set()
    if num_byes:
        step = bracket_size / num_byes
        bye_positions = {int(i * step) for i in range(num_byes)}

    # Each slot is ("team", team_id) or ("bye", None), spread across bracket_size
    # leaf positions of the tree.
    team_iter = iter(team_ids)
    current: list[tuple[str, int | None]] = [
        ("bye", None) if i in bye_positions else ("team", next(team_iter))
        for i in range(bracket_size)
    ]

    round_index = 0
    while len(current) > 1:
        round_index += 1
        pairs = [current[i:i + 2] for i in range(0, len(current), 2)]
        round_ = models.Round(tournament_id=tournament_id, name=_bracket_round_name(len(pairs)), sequence=round_index)
        db.add(round_)
        db.flush()

        next_round: list[tuple[str, int | None]] = []
        for (kind_a, val_a), (kind_b, val_b) in pairs:
            # A bye still gets a real, visible match row — auto-completed with
            # the lone team as winner — so the round isn't silently missing
            # slots and the next round's already-known team is traceable back
            # to something ("Bye") instead of looking like it appeared from
            # nowhere.
            if kind_a == "bye":
                _create_bye_match(db, tournament_id, round_.id, val_b)
                next_round.append(("team", val_b))
                continue
            if kind_b == "bye":
                _create_bye_match(db, tournament_id, round_.id, val_a)
                next_round.append(("team", val_a))
                continue
            m = models.Match(
                tournament_id=tournament_id,
                round_id=round_.id,
                team_a_id=val_a if kind_a == "team" else None,
                team_b_id=val_b if kind_b == "team" else None,
                source_match_a_id=val_a if kind_a == "match" else None,
                source_match_b_id=val_b if kind_b == "match" else None,
            )
            db.add(m)
            db.flush()
            next_round.append(("match", m.id))
        current = next_round

    db.commit()
    return _tournament_dict(t, db, with_rounds=True)


# ---------- Rounds ----------
@router.post("/api/tournaments/{tournament_id}/rounds", status_code=201)
def create_round(tournament_id: int, payload: schemas.RoundCreate, db: Session = Depends(get_db)):
    if not db.get(models.Tournament, tournament_id):
        raise HTTPException(404, "Tournament not found")
    r = models.Round(tournament_id=tournament_id, **payload.model_dump())
    db.add(r)
    db.commit()
    db.refresh(r)
    return _round_dict(r, db)


@router.put("/api/rounds/{round_id}")
def update_round(round_id: int, payload: schemas.RoundUpdate, db: Session = Depends(get_db)):
    r = db.get(models.Round, round_id)
    if not r:
        raise HTTPException(404, "Round not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return _round_dict(r, db)


@router.delete("/api/rounds/{round_id}", status_code=204)
def delete_round(round_id: int, db: Session = Depends(get_db)):
    r = db.get(models.Round, round_id)
    if not r:
        raise HTTPException(404, "Round not found")
    db.delete(r)
    db.commit()


# ---------- Matches: fixtures ----------
@router.post("/api/rounds/{round_id}/matches", status_code=201)
def create_match(round_id: int, payload: schemas.MatchCreate, db: Session = Depends(get_db)):
    round_ = db.get(models.Round, round_id)
    if not round_:
        raise HTTPException(404, "Round not found")
    for team_id in (payload.team_a_id, payload.team_b_id):
        if team_id and not db.get(models.Team, team_id):
            raise HTTPException(404, f"Team {team_id} not found")
        if team_id:
            _check_team_age_group(db, team_id, round_.tournament.age_group)
    for source_id in (payload.source_match_a_id, payload.source_match_b_id):
        if source_id and not db.get(models.Match, source_id):
            raise HTTPException(404, f"Source match {source_id} not found")
    m = models.Match(tournament_id=round_.tournament_id, round_id=round_id, **payload.model_dump())
    db.add(m)
    db.commit()
    db.refresh(m)
    return _match_dict(m, db)


@router.get("/api/matches")
def list_matches(
    tournament_id: int | None = Query(None),
    round_id: int | None = Query(None),
    status: str | None = Query(None, description="Comma-separated, e.g. ONGOING,PAUSED"),
    db: Session = Depends(get_db),
):
    q = db.query(models.Match)
    if tournament_id:
        q = q.filter(models.Match.tournament_id == tournament_id)
    if round_id:
        q = q.filter(models.Match.round_id == round_id)
    if status:
        statuses = [s.strip().upper() for s in status.split(",") if s.strip()]
        q = q.filter(models.Match.status.in_(statuses))
    rows = q.order_by(models.Match.scheduled_at.asc().nullslast(), models.Match.id.asc()).all()
    return [_match_dict(m, db) for m in rows]


@router.get("/api/matches/{match_id}")
def get_match(match_id: int, db: Session = Depends(get_db)):
    m = db.get(models.Match, match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    d = _match_dict(m, db)
    d["events"] = [_event_dict(e) for e in m.events]
    return d


@router.put("/api/matches/{match_id}")
def update_match(match_id: int, payload: schemas.MatchUpdate, db: Session = Depends(get_db)):
    m = db.get(models.Match, match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    if m.status not in ("SCHEDULED", "POSTPONED"):
        raise HTTPException(409, "Only a scheduled or postponed match's fixture details can be edited")
    data = payload.model_dump(exclude_unset=True)
    for team_id in (data.get("team_a_id"), data.get("team_b_id")):
        if team_id and not db.get(models.Team, team_id):
            raise HTTPException(404, f"Team {team_id} not found")
        if team_id:
            _check_team_age_group(db, team_id, m.tournament.age_group)
    for k, v in data.items():
        setattr(m, k, v)
    if m.status == "POSTPONED" and "scheduled_at" in data:
        m.status = "SCHEDULED"  # rescheduling a postponed match puts it back on the calendar
    db.commit()
    db.refresh(m)
    return _match_dict(m, db)


@router.delete("/api/matches/{match_id}", status_code=204)
def delete_match(match_id: int, db: Session = Depends(get_db)):
    m = db.get(models.Match, match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    db.delete(m)
    db.commit()


# ---------- Match lifecycle actions ----------
def _log_event(db: Session, match: models.Match, event_type: str, current: models.OrganizerUser, **extra):
    db.add(models.MatchEvent(
        match_id=match.id, event_type=event_type,
        team_a_score=match.team_a_score, team_b_score=match.team_b_score,
        created_by_id=current.id, **extra,
    ))


@router.post("/api/matches/{match_id}/start")
def start_match(match_id: int, db: Session = Depends(get_db), current: models.OrganizerUser = Depends(require_auth)):
    m = db.get(models.Match, match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    if m.status != "SCHEDULED":
        raise HTTPException(409, f"Match is {m.status} — only a scheduled match can be started")
    if not m.team_a_id or not m.team_b_id:
        raise HTTPException(400, "Both teams must be set before starting this match")
    m.status = "ONGOING"
    m.started_at = datetime.now(timezone.utc)
    _log_event(db, m, "START", current)
    db.commit()
    db.refresh(m)
    broadcast_match_event_sync(m, "match_started")
    return _match_dict(m, db)


@router.post("/api/matches/{match_id}/score")
def update_score(match_id: int, payload: schemas.MatchScoreUpdate, db: Session = Depends(get_db), current: models.OrganizerUser = Depends(require_auth)):
    m = db.get(models.Match, match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    if m.status != "ONGOING":
        raise HTTPException(409, f"Match is {m.status} — score can only change while ONGOING")

    col_name = "team_a_score" if payload.team == "a" else "team_b_score"
    col = getattr(models.Match, col_name)
    # Atomic row-level increment (score = score + delta in one UPDATE) — this is what
    # makes two organizers scoring the same match concurrently safe: Postgres
    # serializes the two UPDATEs instead of either one clobbering a stale read.
    result = db.execute(
        update(models.Match)
        .where(models.Match.id == match_id)
        .values(**{col_name: func.greatest(col + payload.delta, 0)})
        .returning(models.Match.team_a_score, models.Match.team_b_score)
    )
    team_a_score, team_b_score = result.one()
    db.add(models.MatchEvent(
        match_id=m.id, event_type="SCORE",
        team_id=(m.team_a_id if payload.team == "a" else m.team_b_id),
        component=payload.component or "point", delta=payload.delta,
        team_a_score=team_a_score, team_b_score=team_b_score,
        created_by_id=current.id,
    ))
    db.commit()
    db.refresh(m)
    broadcast_match_event_sync(m, "match_score_updated")
    return _match_dict(m, db)


@router.post("/api/matches/{match_id}/pause")
def pause_match(match_id: int, db: Session = Depends(get_db), current: models.OrganizerUser = Depends(require_auth)):
    m = db.get(models.Match, match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    if m.status != "ONGOING":
        raise HTTPException(409, f"Match is {m.status} — only an ongoing match can be paused")
    m.status = "PAUSED"
    _log_event(db, m, "PAUSE", current)
    db.commit()
    db.refresh(m)
    broadcast_match_event_sync(m, "match_paused")
    return _match_dict(m, db)


@router.post("/api/matches/{match_id}/resume")
def resume_match(match_id: int, db: Session = Depends(get_db), current: models.OrganizerUser = Depends(require_auth)):
    m = db.get(models.Match, match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    if m.status != "PAUSED":
        raise HTTPException(409, f"Match is {m.status} — only a paused match can be resumed")
    m.status = "ONGOING"
    _log_event(db, m, "RESUME", current)
    db.commit()
    db.refresh(m)
    broadcast_match_event_sync(m, "match_resumed")
    return _match_dict(m, db)


@router.post("/api/matches/{match_id}/complete")
def complete_match(match_id: int, payload: schemas.MatchCompleteRequest, db: Session = Depends(get_db), current: models.OrganizerUser = Depends(require_auth)):
    m = db.get(models.Match, match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    if m.status not in ("ONGOING", "PAUSED"):
        raise HTTPException(409, f"Match is {m.status} — only an ongoing/paused match can be completed")

    winner_id = payload.winner_team_id
    if winner_id is None:
        if m.team_a_score == m.team_b_score:
            raise HTTPException(400, "Scores are tied — winner_team_id is required")
        winner_id = m.team_a_id if m.team_a_score > m.team_b_score else m.team_b_id
        if winner_id is None:
            raise HTTPException(400, "Can't auto-determine a winner — one team slot is still empty")
    elif winner_id not in (m.team_a_id, m.team_b_id):
        raise HTTPException(400, "winner_team_id must be one of the two teams in this match")

    m.status = "COMPLETED"
    m.winner_team_id = winner_id
    m.ended_at = datetime.now(timezone.utc)
    _log_event(db, m, "COMPLETE", current, team_id=winner_id)
    _propagate_winner(db, m)
    db.commit()
    db.refresh(m)
    broadcast_match_event_sync(m, "match_completed")
    return _match_dict(m, db)


@router.post("/api/matches/{match_id}/cancel")
def cancel_match(match_id: int, db: Session = Depends(get_db), current: models.OrganizerUser = Depends(require_auth)):
    m = db.get(models.Match, match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    if m.status == "COMPLETED":
        raise HTTPException(409, "A completed match can't be cancelled")
    m.status = "CANCELLED"
    _log_event(db, m, "CANCEL", current)
    db.commit()
    db.refresh(m)
    broadcast_match_event_sync(m, "match_cancelled")
    return _match_dict(m, db)


@router.post("/api/matches/{match_id}/postpone")
def postpone_match(match_id: int, db: Session = Depends(get_db), current: models.OrganizerUser = Depends(require_auth)):
    m = db.get(models.Match, match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    if m.status != "SCHEDULED":
        raise HTTPException(409, f"Match is {m.status} — only a scheduled match can be postponed")
    m.status = "POSTPONED"
    _log_event(db, m, "POSTPONE", current)
    db.commit()
    db.refresh(m)
    broadcast_match_event_sync(m, "match_postponed")
    return _match_dict(m, db)
