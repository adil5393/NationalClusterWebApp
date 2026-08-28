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
        "match_type": m.match_type,
        "pool_id": m.pool_id,
        "pool_name": m.pool.name if m.pool else None,
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
        "format": r.format,
        "source_round_id": r.source_round_id,
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


def _place_byes(team_ids: list[int], bye_team_ids: list[int]) -> list[tuple[str, int | None]]:
    """Validates bye_team_ids against team_ids and returns one round's leaf
    slots: bracket_size = smallest power of two >= len(team_ids) slots, each
    either ("team", team_id) or ("bye", None) — a bye slot is genuinely empty,
    paired against exactly the organizer-chosen team for that bye, which is
    how that team advances with no opponent. bye_team_ids must have exactly
    bracket_size - len(team_ids) entries, all drawn from team_ids. Byes are
    spread (>= 2 slots apart) so no two land in the same pairing — used by
    both generate_bracket (round 1 of a full auto-generated tree) and
    generate_next_round (a single round built from an advancing bucket)."""
    n = len(team_ids)
    bracket_size = 1
    while bracket_size < n:
        bracket_size *= 2
    num_byes = bracket_size - n

    bye_ids = list(dict.fromkeys(bye_team_ids))
    for bid in bye_ids:
        if bid not in team_ids:
            raise HTTPException(400, f"Bye team {bid} isn't in the selected team list")
    if len(bye_ids) != num_byes:
        if num_byes == 0:
            raise HTTPException(400, "Team count is already a power of two — no byes needed")
        raise HTTPException(400, f"Choose exactly {num_byes} team(s) to receive a Round 1 bye (got {len(bye_ids)})")

    bye_positions: set[int] = set()
    if num_byes:
        step = bracket_size / num_byes
        bye_positions = {int(i * step) for i in range(num_byes)}

    # bracket_size leaf slots hold only the n real teams — the other num_byes
    # slots are genuinely empty ("bye", None), each paired against one real
    # team's slot so that team advances with no opponent. The organizer's
    # chosen bye_ids go specifically into the slot partnered with an empty
    # one; every other slot gets a "playing" team. (bye_positions are always
    # >= 2 apart, so an empty slot's partner is never itself empty.)
    bye_set = set(bye_ids)
    playing_ids = [tid for tid in team_ids if tid not in bye_set]
    team_positions = [i for i in range(bracket_size) if i not in bye_positions]
    partner_positions = {p ^ 1 for p in bye_positions}

    bye_iter = iter(bye_ids)
    play_iter = iter(playing_ids)
    ordered: dict[int, int] = {
        pos: (next(bye_iter) if pos in partner_positions else next(play_iter))
        for pos in team_positions
    }
    return [
        ("bye", None) if i in bye_positions else ("team", ordered[i])
        for i in range(bracket_size)
    ]


def _create_one_knockout_round(db: Session, tournament_id: int, round_id: int, team_ids: list[int], bye_team_ids: list[int]) -> set[int]:
    """Pairs up team_ids into a single round of matches (no cascading further
    rounds — only used by the bucket flow, which builds one round at a time).
    Unlike generate_bracket's Round 1 — which must land on a clean power of
    two since it plans the whole tree upfront, so its byes are mandatory and
    exact — a bucket-built round is decided fresh each time it's created, so
    byes here are entirely optional: the organizer may pick any subset of
    team_ids to advance without playing. Whatever's left pairs up two at a
    time; if that leaves one team over (an odd remainder nobody picked a bye
    for), it's simply left out of this round rather than forcing a bye on it
    — the caller keeps it "pulled" in the bucket for a future create-round
    call once another odd-one-out shows up to pair with it. Returns the set
    of team_ids actually placed into a match this round, so the caller knows
    which bucket entries to mark "pushed" (and which one, if any, to leave)."""
    bye_ids = list(dict.fromkeys(bye_team_ids))
    for bid in bye_ids:
        if bid not in team_ids:
            raise HTTPException(400, f"Bye team {bid} isn't in the selected team list")

    bye_set = set(bye_ids)
    remaining = [tid for tid in team_ids if tid not in bye_set]
    if len(remaining) % 2 == 1:
        remaining.pop()  # left out of this round entirely — stays pulled, not pushed

    for bid in bye_ids:
        _create_bye_match(db, tournament_id, round_id, bid)
    for i in range(0, len(remaining), 2):
        db.add(models.Match(tournament_id=tournament_id, round_id=round_id, team_a_id=remaining[i], team_b_id=remaining[i + 1]))
    db.flush()

    return bye_set | set(remaining)


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
    """Builds a single-elimination bracket from a flat team list. Round 1
    always pairs the teams up right away. If `whole_season` (default True),
    every later round is auto-created too, with placeholder slots
    (source_match_a/b_id) wired to the two matches that feed it, all the way
    down to a 1-match Final — so completing a match later fills the next
    round's slot automatically (see _propagate_winner). If False, only Round 1
    is created; later rounds get built one at a time via the round-by-round
    advance flow (POST /tournaments/{id}/rounds/advance) once each round
    finishes. If the team count isn't a power of two, `bye_team_ids` must name
    exactly the teams that get a Round 1 bye — the organizer's call, not an
    automatic pick — spread out so no two byes land on the same pairing."""
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

    current: list[tuple[str, int | None]] = _place_byes(team_ids, payload.bye_team_ids)

    round_index = 0
    while len(current) > 1:
        round_index += 1
        pairs = [current[i:i + 2] for i in range(0, len(current), 2)]
        round_ = models.Round(tournament_id=tournament_id, name=_bracket_round_name(len(pairs)), sequence=round_index, format="KNOCKOUT")
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
        if not payload.whole_season:
            break  # Round 1 only — later rounds get built via the advance flow, once this one finishes

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


# ---------- Round-by-round advance flow ----------
# Once a round finishes — knockout (byes included) or league — its winners/
# qualifiers can be pulled into a Bucket (routers/buckets.py), which the
# organizer later turns into the next round in whichever format. This is the
# shared, read-only computation both the preview endpoint below and
# buckets.py build on; it never mutates anything itself.
def _standings_key(row: dict) -> tuple:
    # Points alone decide a tie for a qualifying spot — point differential and
    # points-for are only used to order the standings table, never silently
    # to break a tie here. Two teams level on points always need the
    # organizer's pick, regardless of differential.
    return (row["points"],)


def _compute_advancing_teams(db: Session, round_: models.Round) -> dict:
    """What teams would form the next round's bucket, given this round's
    format. KNOCKOUT: every completed match's winner (bye matches already
    auto-complete with one — see _create_bye_match). LEAGUE: top 2 per pool
    by standings, grouping teams tied on points (see _standings_key) so a
    genuine tie for a qualifying spot surfaces for the organizer to break
    instead of being silently resolved by row order."""
    fmt = round_.format
    if fmt is None:
        # Legacy round with no explicit format — infer it the same way the
        # rest of the app already tells knockout and league matches apart.
        sample = round_.matches[0] if round_.matches else None
        fmt = sample.match_type if sample else None

    if fmt == "LEAGUE":
        from .pools import compute_standings  # local import: avoids a hard import-order dependency between routers

        pools = round_.pools
        if not pools:
            raise HTTPException(400, "This round has no pools yet")

        pool_results = []
        teams: list[dict] = []
        has_unresolved_ties = False
        pools_ready = 0
        pools_pending = 0
        for p in pools:
            # Per-pool readiness — a pool that's finished doesn't have to
            # wait on its slower siblings; its qualifiers join the bucket as
            # soon as it's finalized and every one of its matches completes.
            pool_ready = p.status == "finalized" and bool(p.matches) and all(m.status == "COMPLETED" for m in p.matches)
            standings = compute_standings(p) if pool_ready else []
            need = min(2, len(p.teams))
            qualifiers: list[dict] = []
            tie_candidates: list[dict] = []
            tie_need = 0
            i = 0
            while pool_ready and i < len(standings) and len(qualifiers) < need:
                key = _standings_key(standings[i])
                group = [standings[i]]
                j = i + 1
                while j < len(standings) and _standings_key(standings[j]) == key:
                    group.append(standings[j])
                    j += 1
                if len(qualifiers) + len(group) <= need:
                    qualifiers.extend(group)
                    i = j
                else:
                    tie_candidates = group
                    tie_need = need - len(qualifiers)
                    break
            needs_tiebreak = len(tie_candidates) > 0
            if pool_ready:
                pools_ready += 1
                if needs_tiebreak:
                    has_unresolved_ties = True
                else:
                    teams.extend({"id": r["team_id"], "name": r["team_name"]} for r in qualifiers)
            else:
                pools_pending += 1
            pool_results.append({
                "pool_id": p.id,
                "pool_name": p.name,
                "ready": pool_ready,
                "team_ids": [t.id for t in p.teams],  # full roster, regardless of readiness — lets generate_next_round reject a team from a still-in-progress pool
                "standings": standings,
                "qualifiers": [{"id": r["team_id"], "name": r["team_name"]} for r in qualifiers],
                "needs_tiebreak": needs_tiebreak,
                "tie_candidates": [{"id": r["team_id"], "name": r["team_name"]} for r in tie_candidates],
                "tie_need": tie_need,
            })

        ready = pools_ready > 0  # at least one finished pool is enough to advance — no need to wait on the rest
        return {
            "round_id": round_.id,
            "format": "LEAGUE",
            "ready": ready,
            "blocking": None if ready else f"{pools_pending} pool(s) still in progress",
            "has_unresolved_ties": has_unresolved_ties,
            "pools": pool_results,
            "teams": teams if ready and not has_unresolved_ties else None,
        }

    # KNOCKOUT (or a legacy round with no matches at all yet)
    matches = round_.matches
    if not matches:
        raise HTTPException(400, "This round has no matches yet")
    incomplete = [m for m in matches if m.status != "COMPLETED"]
    ready = not incomplete
    teams = []
    if ready:
        for m in matches:
            if m.winner_team_id:
                team = db.get(models.Team, m.winner_team_id)
                teams.append({"id": m.winner_team_id, "name": team.name if team else None})
    return {
        "round_id": round_.id,
        "format": "KNOCKOUT",
        "ready": ready,
        "blocking": None if ready else f"{len(incomplete)} match(es) still in progress",
        "has_unresolved_ties": False,
        "pools": None,
        "teams": teams if ready else None,
    }


@router.get("/api/rounds/{round_id}/advancing-teams")
def get_advancing_teams(round_id: int, db: Session = Depends(get_db)):
    r = db.get(models.Round, round_id)
    if not r:
        raise HTTPException(404, "Round not found")
    return _compute_advancing_teams(db, r)


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


def _free_pushed_bucket_entries(db: Session, round_id: int | None, team_ids: list[int | None]) -> None:
    """A knockout round's bucket entries are marked "pushed" the moment
    create-round places them into a real match. If that match is later
    cancelled or deleted, the team is free again — pulled, not pushed —
    so it's eligible for a future create-round call from the same bucket.
    (A league round's entrants aren't tied to one match this way; they stay
    pushed until the round itself is deleted, which already frees them via
    ON DELETE SET NULL on pushed_round_id.)"""
    ids = [t for t in team_ids if t]
    if not ids or round_id is None:
        return
    db.query(models.BucketTeam).filter(
        models.BucketTeam.pushed_round_id == round_id,
        models.BucketTeam.team_id.in_(ids),
    ).update({"pushed_round_id": None}, synchronize_session=False)


@router.delete("/api/matches/{match_id}", status_code=204)
def delete_match(match_id: int, db: Session = Depends(get_db)):
    m = db.get(models.Match, match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    round_id, team_ids = m.round_id, [m.team_a_id, m.team_b_id]
    db.delete(m)
    _free_pushed_bucket_entries(db, round_id, team_ids)
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
    _free_pushed_bucket_entries(db, m.round_id, [m.team_a_id, m.team_b_id])
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
