"""League/pool stage — the round-robin alternative to knockout, living
alongside it in the same Tournament -> Round -> Match tree (see models.Pool,
Match.match_type/pool_id). Organizer-only, gated the same as routers/matches.py
(require_module("matches") — League Setup is part of "Matches & Fixtures").

Pool matches use the exact same Match model, lifecycle, and live-scoring
pipeline as knockout matches — routers/matches.py's start/score/pause/
resume/complete/cancel endpoints work unchanged on a pool match, and the
same WebSocket broadcast fires. Nothing here duplicates that.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..pool_logic import MIN_POOL_SIZE, distribute_pool_sizes, round_robin_pairs
from .matches import _check_team_age_group, _check_team_playable, _match_dict, _team_unplayable_reason

router = APIRouter(tags=["pools"])


# ---------- helpers ----------
def _eligible_teams(db: Session, tournament: models.Tournament, round_: models.Round | None = None) -> list[models.Team]:
    """A round created via the round-by-round advance flow (routers/matches.py
    generate_next_round) has an explicit entrants list — its bucket — and
    pools for that round may only draw from it. A round with no entrants
    (Round-1-style, or created the old way) falls back to the tournament-wide
    rule: any team with a registered participant in the tournament's age
    group, or every team if the tournament isn't scoped to one."""
    if round_ is not None and round_.entrants:
        return sorted(round_.entrants, key=lambda t: t.name)
    if not tournament.age_group:
        return db.query(models.Team).order_by(models.Team.name).all()
    team_ids = {
        row[0]
        for row in db.query(models.Participant.team_id)
        .filter(models.Participant.age_group == tournament.age_group)
        .distinct()
        .all()
    }
    if not team_ids:
        return []
    return db.query(models.Team).filter(models.Team.id.in_(team_ids)).order_by(models.Team.name).all()


def _pool_dict(p: models.Pool) -> dict:
    n = len(p.teams)
    return {
        "id": p.id,
        "tournament_id": p.tournament_id,
        "round_id": p.round_id,
        "name": p.name,
        "status": p.status,
        "team_count": n,
        "match_count": len(p.matches),
        "expected_match_count": n * (n - 1) // 2,
        "is_valid": n == 0 or n >= MIN_POOL_SIZE,
        "teams": [{"id": t.id, "name": t.name} for t in p.teams],
    }


def _teams_already_in_round(db: Session, round_id: int, exclude_pool_id: int | None = None) -> dict[int, int]:
    """team_id -> pool_id for every team already placed in any pool of this round."""
    q = db.query(models.Pool).filter(models.Pool.round_id == round_id)
    if exclude_pool_id:
        q = q.filter(models.Pool.id != exclude_pool_id)
    result = {}
    for pool in q.all():
        for t in pool.teams:
            result[t.id] = pool.id
    return result


_AWARD_LABEL = {"winner": "winner", "runner": "runner-up"}


def _check_last_year_conflict(pool_teams: list[models.Team], team: models.Team) -> None:
    """Last year's winner and runner-up, in the SAME age group, can never
    share a pool — a team holding an award in one age group doesn't conflict
    with a pool teammate's award in a different one."""
    opposite = {"winner": "runner", "runner": "winner"}
    for award in team.last_year_awards:
        conflict = next(
            (
                t for t in pool_teams
                if t.id != team.id
                and any(a.age_group == award.age_group and a.award == opposite[award.award] for a in t.last_year_awards)
            ),
            None,
        )
        if conflict:
            raise HTTPException(
                409,
                f"{team.name} (last year's {_AWARD_LABEL[award.award]} in {award.age_group}) can't share a pool "
                f"with {conflict.name}, who holds the other award in the same age group",
            )


def _awards_conflict(a: models.Team, b: models.Team) -> bool:
    opposite = {"winner": "runner", "runner": "winner"}
    return any(
        x.age_group == y.age_group and y.award == opposite[x.award]
        for x in a.last_year_awards for y in b.last_year_awards
    )


def _repair_last_year_conflicts(breakdown: list[dict], teams_by_id: dict[int, models.Team]) -> None:
    """Unlike a manual add-to-pool (which just blocks so the organizer can pick
    someone else), auto-create chunks unassigned teams by size/order alone with
    no awareness of the winner/runner-up rule — so a conflict here would only
    ever surface as a confusing 409 mid-commit, after the organizer already
    approved the preview. A team can hold at most one award per age group and
    an age group has at most one winner and one runner-up (unique constraints
    on TeamLastYearAward), and a tournament is itself scoped to one age group,
    so there's at most a single conflicting pair to fix per call — swap one of
    them into whichever other pool can take it without recreating the
    conflict there."""
    for pool in breakdown:
        ids = pool["team_ids"]
        pair = next(
            (
                (x, y) for i, x in enumerate(ids) for y in ids[i + 1:]
                if _awards_conflict(teams_by_id[x], teams_by_id[y])
            ),
            None,
        )
        if not pair:
            continue
        _, b_id = pair
        for other in breakdown:
            if other is pool:
                continue
            other_ids = other["team_ids"]
            swap_target = next(
                (
                    c_id for c_id in other_ids
                    if all(not _awards_conflict(teams_by_id[c_id], teams_by_id[t]) for t in ids if t != b_id)
                    and all(not _awards_conflict(teams_by_id[b_id], teams_by_id[t]) for t in other_ids if t != c_id)
                ),
                None,
            )
            if swap_target is not None:
                ids[ids.index(b_id)] = swap_target
                other_ids[other_ids.index(swap_target)] = b_id
                for entry in (pool, other):
                    entry["teams"] = [{"id": t, "name": teams_by_id[t].name} for t in entry["team_ids"]]
                break
        # If no safe swap exists anywhere (e.g. only one pool total), leave it —
        # the commit-time _check_last_year_conflict call still catches it and
        # raises a clear error instead of silently creating an invalid pool.


def _get_round(db: Session, tournament_id: int, round_id: int) -> models.Round:
    r = db.get(models.Round, round_id)
    if not r or r.tournament_id != tournament_id:
        raise HTTPException(404, "Round not found for this tournament")
    return r


def _get_pool(db: Session, pool_id: int) -> models.Pool:
    p = db.get(models.Pool, pool_id)
    if not p:
        raise HTTPException(404, "Pool not found")
    return p


def _generate_pool_matches(db: Session, pool: models.Pool) -> int:
    team_ids = [t.id for t in pool.teams]
    pairs = round_robin_pairs(team_ids)
    for a, b in pairs:
        db.add(models.Match(
            tournament_id=pool.tournament_id, round_id=pool.round_id,
            match_type="LEAGUE", pool_id=pool.id,
            team_a_id=a, team_b_id=b,
        ))
    return len(pairs)


# ---------- League summary (the "at a glance" widget) ----------
@router.get("/api/tournaments/{tournament_id}/rounds/{round_id}/league-summary")
def league_summary(tournament_id: int, round_id: int, db: Session = Depends(get_db)):
    t = db.get(models.Tournament, tournament_id)
    if not t:
        raise HTTPException(404, "Tournament not found")
    round_ = _get_round(db, tournament_id, round_id)

    eligible = _eligible_teams(db, t, round_)
    assigned_map = _teams_already_in_round(db, round_id)
    unassigned = [team for team in eligible if team.id not in assigned_map]

    pools = db.query(models.Pool).filter(models.Pool.round_id == round_id).order_by(models.Pool.name).all()
    pool_summaries = [_pool_dict(p) for p in pools]
    all_valid = all(p["is_valid"] for p in pool_summaries)
    all_finalized = len(pool_summaries) > 0 and all(p["status"] == "finalized" for p in pool_summaries)

    return {
        "round_id": round_id,
        "round_name": round_.name,
        "eligible_team_count": len(eligible),
        "eligible_teams": [{"id": team.id, "name": team.name} for team in eligible],
        "assigned_team_count": len(assigned_map),
        "unassigned_teams": [{"id": t.id, "name": t.name} for t in unassigned],
        "pool_count": len(pool_summaries),
        "pools": pool_summaries,
        "all_teams_assigned": len(unassigned) == 0,
        "all_pools_valid": all_valid,
        "fixtures_generated": all_finalized,
    }


# ---------- Pools CRUD ----------
@router.get("/api/tournaments/{tournament_id}/rounds/{round_id}/pools")
def list_pools(tournament_id: int, round_id: int, db: Session = Depends(get_db)):
    _get_round(db, tournament_id, round_id)
    pools = db.query(models.Pool).filter(models.Pool.round_id == round_id).order_by(models.Pool.name).all()
    return [_pool_dict(p) for p in pools]


@router.post("/api/tournaments/{tournament_id}/rounds/{round_id}/pools", status_code=201)
def create_pool(tournament_id: int, round_id: int, payload: schemas.PoolCreate, db: Session = Depends(get_db)):
    t = db.get(models.Tournament, tournament_id)
    if not t:
        raise HTTPException(404, "Tournament not found")
    _get_round(db, tournament_id, round_id)

    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Pool name is required")

    pool = models.Pool(tournament_id=tournament_id, round_id=round_id, name=name)
    db.add(pool)
    db.flush()

    if payload.team_ids:
        _add_teams_to_pool(db, t, pool, payload.team_ids)

    db.commit()
    db.refresh(pool)
    return _pool_dict(pool)


@router.get("/api/pools/{pool_id}")
def get_pool(pool_id: int, db: Session = Depends(get_db)):
    return _pool_dict(_get_pool(db, pool_id))


@router.put("/api/pools/{pool_id}")
def update_pool(pool_id: int, payload: schemas.PoolUpdate, db: Session = Depends(get_db)):
    pool = _get_pool(db, pool_id)
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, "Pool name is required")
        pool.name = name
    db.commit()
    db.refresh(pool)
    return _pool_dict(pool)


@router.delete("/api/pools/{pool_id}", status_code=204)
def delete_pool(pool_id: int, db: Session = Depends(get_db)):
    pool = _get_pool(db, pool_id)
    started = [m for m in pool.matches if m.status != "SCHEDULED"]
    if started:
        raise HTTPException(409, f"Can't delete — {len(started)} match(es) in this pool have already started or finished")
    db.delete(pool)
    db.commit()


# ---------- Team assignment ----------
def _add_teams_to_pool(db: Session, tournament: models.Tournament, pool: models.Pool, team_ids: list[int]) -> None:
    already = _teams_already_in_round(db, pool.round_id, exclude_pool_id=pool.id)
    entrant_ids = {t.id for t in pool.round.entrants} if pool.round.entrants else None
    current_ids = {t.id for t in pool.teams}
    for team_id in team_ids:
        if team_id in current_ids:
            continue
        team = db.get(models.Team, team_id)
        if not team:
            raise HTTPException(404, f"Team {team_id} not found")
        _check_team_age_group(db, team_id, tournament.age_group)
        _check_team_playable(db, team_id, tournament)
        if entrant_ids is not None and team_id not in entrant_ids:
            raise HTTPException(400, f"{team.name} isn't part of this round's advancing teams")
        if team_id in already:
            raise HTTPException(409, f"{team.name} is already in another pool this round (pool #{already[team_id]})")
        _check_last_year_conflict(pool.teams, team)
        pool.teams.append(team)
        current_ids.add(team_id)


@router.post("/api/pools/{pool_id}/teams", status_code=201)
def add_team_to_pool(pool_id: int, payload: schemas.PoolTeamAdd, db: Session = Depends(get_db)):
    pool = _get_pool(db, pool_id)
    if any(m.status != "SCHEDULED" for m in pool.matches):
        raise HTTPException(409, "This pool has matches already underway — remove/reschedule them before changing teams")
    t = db.get(models.Tournament, pool.tournament_id)
    _add_teams_to_pool(db, t, pool, [payload.team_id])
    if pool.status == "finalized":
        pool.status = "draft"  # team list changed — stale fixtures need an explicit regenerate
    db.commit()
    db.refresh(pool)
    return _pool_dict(pool)


@router.delete("/api/pools/{pool_id}/teams/{team_id}", status_code=204)
def remove_team_from_pool(pool_id: int, team_id: int, db: Session = Depends(get_db)):
    pool = _get_pool(db, pool_id)
    if any(m.status != "SCHEDULED" for m in pool.matches if m.team_a_id == team_id or m.team_b_id == team_id):
        raise HTTPException(409, "This team has a match already underway or finished in this pool")
    team = db.get(models.Team, team_id)
    if team in pool.teams:
        pool.teams.remove(team)
        if pool.status == "finalized":
            pool.status = "draft"
        db.commit()


# ---------- Finalize / generate fixtures ----------
@router.post("/api/pools/{pool_id}/finalize")
def finalize_pool(pool_id: int, payload: schemas.FinalizePoolRequest, db: Session = Depends(get_db)):
    pool = _get_pool(db, pool_id)
    n = len(pool.teams)
    if n < MIN_POOL_SIZE:
        raise HTTPException(400, f"Pool needs at least {MIN_POOL_SIZE} teams (has {n})")

    existing = list(pool.matches)
    if existing:
        started = [m for m in existing if m.status != "SCHEDULED"]
        if started:
            raise HTTPException(409, f"Can't regenerate — {len(started)} match(es) in this pool have already started or finished")
        if not payload.regenerate:
            raise HTTPException(409, "This pool already has fixtures — confirm to delete and regenerate them")
        for m in existing:
            db.delete(m)
        db.flush()

    created = _generate_pool_matches(db, pool)
    pool.status = "finalized"
    db.commit()
    db.refresh(pool)
    d = _pool_dict(pool)
    d["matches_created"] = created
    return d


# ---------- Auto-create pools ----------
@router.post("/api/tournaments/{tournament_id}/rounds/{round_id}/pools/auto-create")
def auto_create_pools(tournament_id: int, round_id: int, payload: schemas.AutoCreatePoolsRequest, db: Session = Depends(get_db)):
    t = db.get(models.Tournament, tournament_id)
    if not t:
        raise HTTPException(404, "Tournament not found")
    round_ = _get_round(db, tournament_id, round_id)

    eligible = _eligible_teams(db, t, round_)
    assigned = _teams_already_in_round(db, round_id)
    # Auto-distribution is a bulk action with no per-team confirmation step —
    # silently skip unplayable teams (inactive, or below the present-players
    # bar) rather than erroring the whole batch on one of them.
    unassigned = [team for team in eligible if team.id not in assigned and not _team_unplayable_reason(db, team, t)]

    try:
        sizes = distribute_pool_sizes(len(unassigned), payload.teams_per_pool or MIN_POOL_SIZE)
    except ValueError as e:
        raise HTTPException(400, str(e))

    breakdown = []
    cursor = 0
    for i, size in enumerate(sizes):
        chunk = unassigned[cursor:cursor + size]
        cursor += size
        breakdown.append({"name": f"Pool {chr(65 + i)}", "team_count": size, "team_ids": [x.id for x in chunk], "teams": [{"id": x.id, "name": x.name} for x in chunk]})

    _repair_last_year_conflicts(breakdown, {team.id: team for team in unassigned})

    if not payload.commit:
        return {"preview": True, "pool_count": len(breakdown), "pools": breakdown}

    created_pools = []
    for entry in breakdown:
        pool = models.Pool(tournament_id=tournament_id, round_id=round_id, name=entry["name"])
        db.add(pool)
        db.flush()
        for team_id in entry["team_ids"]:
            team = db.get(models.Team, team_id)
            _check_last_year_conflict(pool.teams, team)
            pool.teams.append(team)
        db.flush()
        _generate_pool_matches(db, pool)
        pool.status = "finalized"
        created_pools.append(pool)

    db.commit()
    return {"preview": False, "pool_count": len(created_pools), "pools": [_pool_dict(p) for p in created_pools]}


# ---------- Matches ----------
@router.get("/api/pools/{pool_id}/matches")
def list_pool_matches(pool_id: int, db: Session = Depends(get_db)):
    pool = _get_pool(db, pool_id)
    return [_match_dict(m, db) for m in pool.matches]


@router.post("/api/pools/{pool_id}/generate-matches")
def generate_pool_matches_endpoint(pool_id: int, payload: schemas.FinalizePoolRequest, db: Session = Depends(get_db)):
    """Same as finalize, exposed under the conceptual name from the spec —
    finalize() already generates fixtures, so this just delegates to it."""
    return finalize_pool(pool_id, payload, db)


# ---------- Standings ----------
def compute_standings(pool: models.Pool) -> list[dict]:
    """Extensible-by-design: only Played/Won/Lost/Points-For/Points-Against and
    a generic 2-1-0 (win/draw/loss) points column are computed here, since the
    app doesn't define sport-specific ranking rules (bonus points, net run
    rate, etc.) anywhere yet. Swap the scoring block below if/when it does —
    everything else (aggregation from completed matches) stays the same.
    Shared by the organizer endpoint below and the public one in routers/public.py
    — one calculation, read by both audiences."""
    rows = {t.id: {"team_id": t.id, "team_name": t.name, "played": 0, "won": 0, "lost": 0, "drawn": 0, "points_for": 0, "points_against": 0, "points": 0} for t in pool.teams}

    for m in pool.matches:
        if m.status != "COMPLETED" or m.team_a_id not in rows or m.team_b_id not in rows:
            continue
        a, b = rows[m.team_a_id], rows[m.team_b_id]
        a["played"] += 1
        b["played"] += 1
        a["points_for"] += m.team_a_score
        a["points_against"] += m.team_b_score
        b["points_for"] += m.team_b_score
        b["points_against"] += m.team_a_score
        if m.team_a_score > m.team_b_score:
            a["won"] += 1; a["points"] += 2
            b["lost"] += 1
        elif m.team_b_score > m.team_a_score:
            b["won"] += 1; b["points"] += 2
            a["lost"] += 1
        else:
            a["drawn"] += 1; a["points"] += 1
            b["drawn"] += 1; b["points"] += 1

    standings = list(rows.values())
    standings.sort(key=lambda r: (-r["points"], -(r["points_for"] - r["points_against"]), -r["points_for"]))
    for i, row in enumerate(standings):
        row["position"] = i + 1
    return standings


@router.get("/api/pools/{pool_id}/standings")
def pool_standings(pool_id: int, db: Session = Depends(get_db)):
    return compute_standings(_get_pool(db, pool_id))
