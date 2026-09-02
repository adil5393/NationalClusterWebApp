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
        "source_pool_a_id": m.source_pool_a_id,
        "source_pool_a_name": m.source_pool_a.name if m.source_pool_a else None,
        "source_pool_a_rank": m.source_pool_a_rank,
        "source_pool_b_id": m.source_pool_b_id,
        "source_pool_b_name": m.source_pool_b.name if m.source_pool_b else None,
        "source_pool_b_rank": m.source_pool_b_rank,
        "venue_id": m.venue_id,
        "venue_name": venue.name if venue else None,
        "scheduled_at": m.scheduled_at.isoformat() if m.scheduled_at else None,
        "status": m.status,
        "team_a_score": m.team_a_score,
        "team_b_score": m.team_b_score,
        "winner_team_id": m.winner_team_id,
        "winner_team_name": _team_name(db, m.winner_team_id),
        "forfeited_team_id": m.forfeited_team_id,
        "forfeited_team_name": _team_name(db, m.forfeited_team_id),
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
        "min_present_players": t.min_present_players,
        "league_advance_count": t.league_advance_count,
        "bracket_mode": t.bracket_mode,
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


def _team_unplayable_reason(db: Session, team: models.Team, tournament: models.Tournament) -> str | None:
    """None if the team can be placed into a match/pool in this tournament,
    otherwise the reason it can't — either benched manually (Team.is_active)
    or automatically, because too few of its players in this tournament's age
    group have checked in (Tournament.min_present_players; 0 disables this
    half of the check)."""
    if not team.is_active:
        return f"{team.name} is marked inactive"
    if tournament.min_present_players > 0 and tournament.age_group:
        present = (
            db.query(models.Participant.id)
            .filter(
                models.Participant.team_id == team.id,
                models.Participant.age_group == tournament.age_group,
                models.Participant.is_present.is_(True),
            )
            .count()
        )
        if present < tournament.min_present_players:
            return f"{team.name} only has {present} of {tournament.min_present_players} required players present"
    return None


def _check_team_playable(db: Session, team_id: int, tournament: models.Tournament) -> None:
    """Guards against placing a team into a match/pool while it's unplayable
    (see _team_unplayable_reason). Never filters a team out of a selection
    list (see Matches.tsx/Teams.tsx) — only blocks the actual placement, with
    a clear reason."""
    team = db.get(models.Team, team_id)
    if not team:
        return  # caller already 404s on a missing team; nothing to check here
    reason = _team_unplayable_reason(db, team, tournament)
    if reason:
        raise HTTPException(400, f"{reason} — can't be scheduled")


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
        _try_walkover(db, dep)


def _try_walkover(db: Session, dep: models.Match) -> None:
    """A cancelled knockout match voids the slot it was going to fill — the
    team on the *other* side of whatever match it was feeding simply advances
    without playing, same as a Round 1 bye (see _create_bye_match). Fires
    from both directions: right after cancel_match cancels a match (see
    _propagate_cancellation below), and right after _propagate_winner fills
    the surviving slot in later (the cancel may well have happened first,
    before the other side even had a winner yet). No-op unless dep has
    exactly one team seated and the empty slot's source match is CANCELLED
    with no winner coming."""
    if dep.status != "SCHEDULED":
        return
    if dep.team_a_id and dep.team_b_id:
        return
    winner = None
    if dep.team_a_id and dep.team_b_id is None and dep.source_match_b_id is not None:
        src = db.get(models.Match, dep.source_match_b_id)
        if src and src.status == "CANCELLED":
            winner = dep.team_a_id
    elif dep.team_b_id and dep.team_a_id is None and dep.source_match_a_id is not None:
        src = db.get(models.Match, dep.source_match_a_id)
        if src and src.status == "CANCELLED":
            winner = dep.team_b_id
    if not winner:
        return
    dep.status = "COMPLETED"
    dep.winner_team_id = winner
    dep.ended_at = datetime.now(timezone.utc)
    dep.notes = "Bye"
    _propagate_winner(db, dep)


def _propagate_cancellation(db: Session, match: models.Match) -> None:
    """The cancel-side trigger for _try_walkover — mirrors _propagate_winner
    but for a match that was voided instead of decided. Only relevant for a
    knockout match with a real dependent (source_match_a/b_id); a league pool
    match's cancellation is instead handled by _propagate_pool_qualifiers."""
    dependents = (
        db.query(models.Match)
        .filter((models.Match.source_match_a_id == match.id) | (models.Match.source_match_b_id == match.id))
        .all()
    )
    for dep in dependents:
        _try_walkover(db, dep)


def _propagate_pool_qualifiers(db: Session, pool: models.Pool) -> None:
    """The League-round equivalent of _propagate_winner: once a pool's
    standings are final (every match COMPLETED/CANCELLED) and unambiguous
    (no tie for the qualifying spot — see _compute_advancing_teams), fill in
    any pre-planned Knockout match slot waiting on this pool's qualifier at a
    given rank (1 = winner, 2 = runner-up; see Match.source_pool_a/b_id, set
    up by generate_bracket's whole-season League planning). A tied pool is
    simply left alone here — nothing fires until the organizer resolves it
    (same tie-break UI the manual bucket flow already uses), same as this
    function just not running yet rather than guessing."""
    dependents = (
        db.query(models.Match)
        .filter((models.Match.source_pool_a_id == pool.id) | (models.Match.source_pool_b_id == pool.id))
        .all()
    )
    if not dependents:
        return  # not a whole-season League pool — nothing pre-wired to it

    advancing = _compute_advancing_teams(db, pool.round)
    pool_info = next((p for p in advancing["pools"] if p["pool_id"] == pool.id), None)
    if not pool_info or not pool_info["ready"] or pool_info["needs_tiebreak"]:
        return
    qualifier_by_rank = {i + 1: q["id"] for i, q in enumerate(pool_info["qualifiers"])}

    for dep in dependents:
        if dep.source_pool_a_id == pool.id and dep.team_a_id is None:
            dep.team_a_id = qualifier_by_rank.get(dep.source_pool_a_rank)
        if dep.source_pool_b_id == pool.id and dep.team_b_id is None:
            dep.team_b_id = qualifier_by_rank.get(dep.source_pool_b_rank)


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


def _plan_knockout_rounds(
    db: Session, tournament_id: int, start_index: int, current: list[tuple[str, int | None]], whole_season: bool,
) -> None:
    """Builds Round `start_index`, `start_index + 1`, ... through the Final by
    repeatedly pairing up `current` two at a time — each entry either
    ("team", id) (already known), ("bye", id), or ("match", match_id) (a
    placeholder resolved once that match completes, via _propagate_winner) —
    stopping after the first round built unless whole_season. Shared by
    generate_bracket's own Round-1-onward Knockout tree (current seeded from
    _place_byes) and its whole-season League planning (current seeded from
    Round 2's pool-pair matches, already created by the caller with
    source_pool_a/b_id wiring instead of source_match_a/b_id)."""
    round_index = start_index
    while len(current) > 1:
        pairs = [current[i:i + 2] for i in range(0, len(current), 2)]
        round_ = models.Round(tournament_id=tournament_id, name=_bracket_round_name(len(pairs)), sequence=round_index, format="KNOCKOUT")
        db.add(round_)
        db.flush()

        next_round: list[tuple[str, int | None]] = []
        for (kind_a, val_a), (kind_b, val_b) in pairs:
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
        round_index += 1
        if not whole_season:
            break  # this round only — later rounds get built via the advance flow, once it finishes


@router.post("/api/tournaments/{tournament_id}/generate-bracket", status_code=201)
def generate_bracket(tournament_id: int, payload: schemas.GenerateBracketRequest, db: Session = Depends(get_db)):
    """Builds Round 1 from a flat team list. format == "KNOCKOUT" (default):
    Round 1 always pairs the teams up right away. If `whole_season` (default
    True), every later round is auto-created too, with placeholder slots
    (source_match_a/b_id) wired to the two matches that feed it, all the way
    down to a 1-match Final — so completing a match later fills the next
    round's slot automatically (see _propagate_winner). If False, only Round 1
    is created; later rounds get built one at a time via the bucket flow
    once each round finishes. If the team count isn't a power of two,
    `bye_team_ids` must name exactly the teams that get a Round 1 bye — the
    organizer's call, not an automatic pick — spread out so no two byes land
    on the same pairing.

    format == "LEAGUE", whole_season False (or omitted): Round 1 is created
    with the non-bye teams as its entrant roster (pools built afterward by
    hand, same as any League round); bye_team_ids is optional and any count —
    those teams skip Round 1's pools entirely and are immediately pullable
    into a bucket for Round 2 via _compute_advancing_teams's bye_teams.

    format == "LEAGUE", whole_season True: the whole season, League Round 1
    through the Knockout Final, planned in one shot — every selected team
    plays Round 1's pools (byes aren't supported here, see below), pools
    auto-distributed by teams_per_pool the same way auto-create-pools does,
    Round 2 pre-built with each match wired to a specific pool pair's
    qualifier(s) (source_pool_a/b_id — Tournament.league_advance_count decides
    1 or 2 qualifiers per pool and how they cross, see
    routers/buckets.py's _seed_league_pool_pairs for the same math applied
    live instead of upfront), and Round 3 through the Final pre-built exactly
    like the pure-Knockout case above. _propagate_pool_qualifiers fills in
    Round 2's slots automatically once a pool's standings are final and
    unambiguous — no manual bucket step needed unless a pool ties. Requires
    the pool count itself to land on a power of two, for the same reason
    Round 1 of a pure Knockout tree does."""
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
        _check_team_playable(db, team_id, t)

    existing_rounds = db.query(models.Round).filter(models.Round.tournament_id == tournament_id).count()
    if existing_rounds > 0 and not payload.replace:
        raise HTTPException(409, "This tournament already has fixtures — confirm to delete them and regenerate")
    if existing_rounds > 0:
        db.query(models.Round).filter(models.Round.tournament_id == tournament_id).delete()
        db.flush()

    t.bracket_mode = "AUTO" if payload.whole_season else "MANUAL"

    if payload.format == "LEAGUE":
        bye_ids = list(dict.fromkeys(payload.bye_team_ids))
        for bid in bye_ids:
            if bid not in team_ids:
                raise HTTPException(400, f"Bye team {bid} isn't in the selected team list")
        playing_ids = [tid for tid in team_ids if tid not in set(bye_ids)]
        if len(playing_ids) < 2:
            raise HTTPException(400, "At least 2 teams must play Round 1 — pick fewer byes")

        round_ = models.Round(tournament_id=tournament_id, name="Round 1", sequence=1, format="LEAGUE")
        db.add(round_)
        db.flush()

        if not payload.whole_season:
            round_.entrants = [db.get(models.Team, tid) for tid in playing_ids]
            for bid in bye_ids:
                _create_bye_match(db, tournament_id, round_.id, bid)
            db.commit()
            return _tournament_dict(t, db, with_rounds=True)

        if bye_ids:
            raise HTTPException(400, "Byes aren't supported for a whole-season League plan — every team plays Round 1's pools")

        from ..pool_logic import MIN_POOL_SIZE, distribute_pool_sizes
        from .pools import _generate_pool_matches

        try:
            sizes = distribute_pool_sizes(len(playing_ids), payload.teams_per_pool or MIN_POOL_SIZE)
        except ValueError as e:
            raise HTTPException(400, str(e))
        pool_count = len(sizes)
        if pool_count < 2 or (pool_count & (pool_count - 1)) != 0:
            raise HTTPException(
                400,
                f"{pool_count} pools isn't a power of two — adjust the team count or teams-per-pool "
                "so Round 1 lands on 2, 4, 8, etc. pools",
            )

        round_.entrants = [db.get(models.Team, tid) for tid in playing_ids]
        pools: list[models.Pool] = []
        cursor = 0
        for i, size in enumerate(sizes):
            chunk = playing_ids[cursor:cursor + size]
            cursor += size
            pool = models.Pool(tournament_id=tournament_id, round_id=round_.id, name=f"Pool {chr(65 + i)}")
            db.add(pool)
            db.flush()
            pool.teams = [db.get(models.Team, tid) for tid in chunk]
            db.flush()
            _generate_pool_matches(db, pool)
            pool.status = "finalized"
            pools.append(pool)

        bracket_size = pool_count * t.league_advance_count
        round2 = models.Round(
            tournament_id=tournament_id, name=_bracket_round_name(bracket_size // 2), sequence=2, format="KNOCKOUT",
            source_round_id=round_.id,
        )
        db.add(round2)
        db.flush()

        current: list[tuple[str, int | None]] = []
        for i in range(pool_count // 2):
            pool_a, pool_b = pools[i], pools[pool_count - 1 - i]
            pairs_for_this_pool_pair = (
                [(pool_a, 1, pool_b, 1)]
                if t.league_advance_count == 1
                else [(pool_a, 1, pool_b, 2), (pool_b, 1, pool_a, 2)]
            )
            for src_a, rank_a, src_b, rank_b in pairs_for_this_pool_pair:
                m = models.Match(
                    tournament_id=tournament_id, round_id=round2.id,
                    source_pool_a_id=src_a.id, source_pool_a_rank=rank_a,
                    source_pool_b_id=src_b.id, source_pool_b_rank=rank_b,
                )
                db.add(m)
                db.flush()
                current.append(("match", m.id))

        _plan_knockout_rounds(db, tournament_id, 3, current, whole_season=True)
        db.commit()
        return _tournament_dict(t, db, with_rounds=True)

    current: list[tuple[str, int | None]] = _place_byes(team_ids, payload.bye_team_ids)
    _plan_knockout_rounds(db, tournament_id, 1, current, payload.whole_season)

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


def _round_format(round_: models.Round) -> "str | None":
    """round_.format, falling back to inferring it from a sample match for a
    legacy round created before that column existed — the one place both
    _compute_advancing_teams and buckets.py's pool-mirror seeding tell
    knockout and league rounds apart."""
    fmt = round_.format
    if fmt is None:
        sample = round_.matches[0] if round_.matches else None
        fmt = sample.match_type if sample else None
    return fmt


def _compute_advancing_teams(db: Session, round_: models.Round) -> dict:
    """What teams would form the next round's bucket, given this round's
    format. KNOCKOUT: every completed match's winner (bye matches already
    auto-complete with one — see _create_bye_match). LEAGUE: top N per pool
    (Tournament.league_advance_count) by standings, grouping teams tied on
    points (see _standings_key) so a genuine tie for a qualifying spot
    surfaces for the organizer to break instead of being silently resolved
    by row order."""
    fmt = _round_format(round_)

    if fmt == "LEAGUE":
        from .pools import compute_standings  # local import: avoids a hard import-order dependency between routers

        # Bye teams (organizer-designated — e.g. at Round 1's Generate
        # Bracket, or any later League round built via the bucket flow) skip
        # this round's pools entirely and are always immediately ready —
        # surfaced separately from per-pool qualifiers, the League-side
        # equivalent of a Knockout source's winners list.
        bye_teams = [
            {"id": m.team_a_id, "name": m.team_a.name}
            for m in round_.matches
            if m.pool_id is None and m.notes == "Bye" and m.status == "COMPLETED" and m.team_a_id
        ]

        pools = round_.pools
        if not pools and not bye_teams:
            raise HTTPException(400, "This round has no pools yet")

        pool_results = []
        teams: list[dict] = list(bye_teams)
        has_unresolved_ties = False
        pools_ready = 0
        pools_pending = 0
        for p in pools:
            # Per-pool readiness — a pool that's finished doesn't have to
            # wait on its slower siblings; its qualifiers join the bucket as
            # soon as it's finalized and every one of its matches completes.
            pool_ready = p.status == "finalized" and bool(p.matches) and all(m.status in ("COMPLETED", "CANCELLED") for m in p.matches)
            standings = compute_standings(p) if pool_ready else []
            need = min(round_.tournament.league_advance_count, len(p.teams))
            qualifiers: list[dict] = []
            tie_candidates: list[dict] = []
            tie_need = 0
            if pool_ready and p.manual_qualifier_ids:
                # Organizer already resolved this pool's tie directly (see
                # routers/pools.py resolve_pool_tiebreak) — use their picks
                # instead of re-detecting the tie every time.
                name_by_id = {row["team_id"]: row["team_name"] for row in standings}
                qualifiers = [{"team_id": tid, "team_name": name_by_id.get(tid)} for tid in p.manual_qualifier_ids]
            else:
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

        ready = pools_ready > 0 or len(bye_teams) > 0  # a finished pool, or any bye team, is enough to advance
        return {
            "round_id": round_.id,
            "format": "LEAGUE",
            "ready": ready,
            "blocking": None if ready else f"{pools_pending} pool(s) still in progress",
            "has_unresolved_ties": has_unresolved_ties,
            "pools": pool_results,
            "bye_teams": bye_teams,
            "teams": teams if ready and not has_unresolved_ties else None,
        }

    # KNOCKOUT (or a legacy round with no matches at all yet)
    matches = round_.matches
    if not matches:
        raise HTTPException(400, "This round has no matches yet")
    incomplete = [m for m in matches if m.status not in ("COMPLETED", "CANCELLED")]
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
            _check_team_playable(db, team_id, round_.tournament)
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
            _check_team_playable(db, team_id, m.tournament)
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
    if m.pool_id:
        _propagate_pool_qualifiers(db, m.pool)
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
    if m.pool_id:
        _propagate_pool_qualifiers(db, m.pool)
    else:
        _propagate_cancellation(db, m)
    db.commit()
    db.refresh(m)
    broadcast_match_event_sync(m, "match_cancelled")
    return _match_dict(m, db)


@router.post("/api/matches/{match_id}/forfeit")
def forfeit_match(match_id: int, payload: schemas.MatchForfeitRequest, db: Session = Depends(get_db), current: models.OrganizerUser = Depends(require_auth)):
    """Unlike cancel (voids the match for both teams, no winner), a forfeit
    still produces a winner — the *other* team — so it completes the match
    exactly like a normally decided one (same propagation), just tagged with
    which team forfeited."""
    m = db.get(models.Match, match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    if m.status in ("COMPLETED", "CANCELLED"):
        raise HTTPException(409, f"Match is {m.status} — can't be forfeited")
    if payload.forfeiting_team_id not in (m.team_a_id, m.team_b_id):
        raise HTTPException(400, "forfeiting_team_id must be one of the two teams in this match")
    winner_id = m.team_b_id if payload.forfeiting_team_id == m.team_a_id else m.team_a_id
    if winner_id is None:
        raise HTTPException(400, "The opposing team slot is still empty")

    m.status = "COMPLETED"
    m.winner_team_id = winner_id
    m.forfeited_team_id = payload.forfeiting_team_id
    m.ended_at = datetime.now(timezone.utc)
    _log_event(db, m, "FORFEIT", current, team_id=payload.forfeiting_team_id)
    _propagate_winner(db, m)
    if m.pool_id:
        _propagate_pool_qualifiers(db, m.pool)
    db.commit()
    db.refresh(m)
    broadcast_match_event_sync(m, "match_forfeited")
    return _match_dict(m, db)


def _downstream_blocking_reason(db: Session, m: models.Match) -> str | None:
    """What a reset of this match would silently corrupt downstream, if
    anything — None means it's safe. Deliberately doesn't cascade an undo
    through further rounds itself: if something downstream already moved,
    the organizer resets that first, one round at a time, same direction the
    tournament actually progressed in."""
    if m.pool_id:
        pool = m.pool
        dependents = (
            db.query(models.Match)
            .filter((models.Match.source_pool_a_id == pool.id) | (models.Match.source_pool_b_id == pool.id))
            .all()
        )
        for d in dependents:
            filled = (d.source_pool_a_id == pool.id and d.team_a_id) or (d.source_pool_b_id == pool.id and d.team_b_id)
            if filled:
                return f"{pool.name}'s qualifier has already advanced into {d.round.name} — undo that match first"
        if db.query(models.BucketTeam).filter(models.BucketTeam.source_pool_id == pool.id).first():
            return f"{pool.name}'s results have already been pulled into a Bucket — remove them there first"
        return None

    if not m.winner_team_id:
        return None  # nothing decided yet on this match — nothing to have propagated

    dependents = (
        db.query(models.Match)
        .filter((models.Match.source_match_a_id == m.id) | (models.Match.source_match_b_id == m.id))
        .all()
    )
    for d in dependents:
        if d.status != "SCHEDULED":
            return f"This result has already advanced into {d.round.name} — undo that match first"

    pulled = (
        db.query(models.BucketTeam)
        .join(models.Bucket, models.BucketTeam.bucket_id == models.Bucket.id)
        .filter(models.Bucket.source_round_id == m.round_id, models.BucketTeam.team_id == m.winner_team_id)
        .first()
    )
    if pulled:
        return "This winner has already been pulled into a Bucket — remove them there first"
    return None


@router.post("/api/matches/{match_id}/reset")
def reset_match(match_id: int, payload: schemas.MatchResetRequest, db: Session = Depends(get_db), current: models.OrganizerUser = Depends(require_auth)):
    """Undo a match — result and, for a knockout match, optionally who's even
    playing it — back to a fresh, re-playable state. Guarded by
    _downstream_blocking_reason: if this match's result already advanced
    somewhere that's no longer untouched, reset is refused rather than
    silently rewriting a deeper chain of results."""
    m = db.get(models.Match, match_id)
    if not m:
        raise HTTPException(404, "Match not found")
    if m.pool_id and (payload.team_a_id != m.team_a_id or payload.team_b_id != m.team_b_id):
        raise HTTPException(400, "Can't reassign teams on a League pool match — its fixtures are fixed by the pool's round-robin schedule")
    if payload.team_a_id is not None and not db.get(models.Team, payload.team_a_id):
        raise HTTPException(404, f"Team {payload.team_a_id} not found")
    if payload.team_b_id is not None and not db.get(models.Team, payload.team_b_id):
        raise HTTPException(404, f"Team {payload.team_b_id} not found")
    if payload.team_a_id is not None and payload.team_a_id == payload.team_b_id:
        raise HTTPException(400, "Team A and Team B can't be the same team")

    blocking = _downstream_blocking_reason(db, m)
    if blocking:
        raise HTTPException(409, blocking)

    # Retract this match's own forward propagation, now that the guard above
    # has confirmed nothing downstream has actually moved yet.
    if not m.pool_id and m.winner_team_id:
        for d in db.query(models.Match).filter(
            (models.Match.source_match_a_id == m.id) | (models.Match.source_match_b_id == m.id)
        ):
            if d.source_match_a_id == m.id:
                d.team_a_id = None
            if d.source_match_b_id == m.id:
                d.team_b_id = None
    if m.pool_id:
        pool = m.pool
        for d in db.query(models.Match).filter(
            (models.Match.source_pool_a_id == pool.id) | (models.Match.source_pool_b_id == pool.id)
        ):
            if d.source_pool_a_id == pool.id:
                d.team_a_id = None
            if d.source_pool_b_id == pool.id:
                d.team_b_id = None
        pool.manual_qualifier_ids = None

    _free_pushed_bucket_entries(db, m.round_id, [m.team_a_id, m.team_b_id])

    # Team reassignment — knockout only. Breaks the flow line on any slot
    # that's actually changing (clears its source_match/source_pool link) so
    # a later upstream propagation won't silently overwrite the override.
    if not m.pool_id:
        if payload.team_a_id != m.team_a_id:
            m.team_a_id = payload.team_a_id
            m.source_match_a_id = None
            m.source_pool_a_id = None
            m.source_pool_a_rank = None
        if payload.team_b_id != m.team_b_id:
            m.team_b_id = payload.team_b_id
            m.source_match_b_id = None
            m.source_pool_b_id = None
            m.source_pool_b_rank = None

    m.status = "ONGOING" if m.team_a_id and m.team_b_id else "SCHEDULED"
    m.team_a_score = 0
    m.team_b_score = 0
    m.winner_team_id = None
    m.forfeited_team_id = None
    m.started_at = datetime.now(timezone.utc) if m.status == "ONGOING" else None
    m.ended_at = None
    if m.notes == "Bye":
        m.notes = None
    _log_event(db, m, "RESET", current)
    db.commit()
    db.refresh(m)
    broadcast_match_event_sync(m, "match_reset")
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
