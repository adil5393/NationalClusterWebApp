"""Buckets — the staging area between a finished round and its successor.

A round's advancing teams (knockout winners, or league pool qualifiers) get
pulled into a Bucket over time — pool by pool as each finishes, for a league
source — and reviewed before the organizer, in a separate action, turns the
bucket into a new round of whichever format. This replaces the earlier
one-shot "advance" endpoint, which forced resolving every pool and picking a
format in the same request.

Reuses routers/matches.py's _compute_advancing_teams (the shared readiness/
tie computation — knockout winners or per-pool league standings) and
_create_one_knockout_round (the actual bracket-pairing/bye logic) rather than
duplicating either. Organizer-only, gated the same as matches.py/pools.py
(require_module("matches") — buckets are part of "Matches & Fixtures").
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .matches import _compute_advancing_teams, _create_one_knockout_round, _round_dict

router = APIRouter(prefix="/api", tags=["buckets"])


def _get_bucket(db: Session, bucket_id: int) -> models.Bucket:
    b = db.get(models.Bucket, bucket_id)
    if not b:
        raise HTTPException(404, "Bucket not found")
    return b


def _team_still_committed(round_result: models.Round, team_id: int) -> bool:
    """Whether a team pulled into some other bucket that became `round_result`
    is still tied up there. For a knockout round every entrant is guaranteed
    a match at creation time, so an absent or fully-cancelled match means it
    was cancelled/deleted and the team is free again. A league round's
    entrants aren't guaranteed pool matches yet (pools are built by hand
    afterward), so a team there stays committed for as long as the round
    itself exists — freeing it up means deleting that round, which already
    reopens the bucket automatically (round_id reverts to NULL)."""
    if round_result.format == "LEAGUE":
        return True
    team_matches = [m for m in round_result.matches if m.team_a_id == team_id or m.team_b_id == team_id]
    return any(m.status != "CANCELLED" for m in team_matches)


def _teams_committed_elsewhere(db: Session, bucket: models.Bucket) -> set[int]:
    """Every team already tied up in another bucket sourced from the same
    round as `bucket`, whose placement there is still active. Prevents the
    same round's teams from being pulled into two different next-rounds at
    once — a team frees up again once its match from that placement is
    cancelled/deleted, or that whole round gets deleted."""
    others = (
        db.query(models.Bucket)
        .filter(
            models.Bucket.source_round_id == bucket.source_round_id,
            models.Bucket.id != bucket.id,
            models.Bucket.round_id.isnot(None),
        )
        .all()
    )
    committed: set[int] = set()
    for other in others:
        if not other.round:
            continue
        for e in other.entries:
            if _team_still_committed(other.round, e.team_id):
                committed.add(e.team_id)
    return committed


def _bucket_dict(db: Session, bucket: models.Bucket) -> dict:
    try:
        advancing = _compute_advancing_teams(db, bucket.source_round) if bucket.source_round else None
    except HTTPException:
        # Source round has no matches/pools yet — nothing computable, but the
        # bucket itself still displays fine (just nothing pullable yet).
        advancing = None

    pulled_pool_ids = {e.source_pool_id for e in bucket.entries if e.source_pool_id is not None}
    pulled_team_ids = {e.team_id for e in bucket.entries}

    pools_status = None
    knockout_status = None
    if advancing and advancing["format"] == "LEAGUE":
        pools_status = [
            {
                "pool_id": p["pool_id"],
                "pool_name": p["pool_name"],
                "ready": p["ready"],
                "pulled": p["pool_id"] in pulled_pool_ids,
                "qualifiers": p["qualifiers"],
                "needs_tiebreak": p["needs_tiebreak"],
                "tie_candidates": p["tie_candidates"],
                "tie_need": p["tie_need"],
            }
            for p in advancing["pools"]
        ]
    elif advancing and advancing["format"] == "KNOCKOUT":
        new_winners = [t for t in (advancing["teams"] or []) if t["id"] not in pulled_team_ids]
        knockout_status = {"ready": advancing["ready"], "blocking": advancing["blocking"], "new_winners": new_winners}

    return {
        "id": bucket.id,
        "tournament_id": bucket.tournament_id,
        "name": bucket.name,
        "source_round_id": bucket.source_round_id,
        "source_round_name": bucket.source_round.name if bucket.source_round else None,
        "source_format": advancing["format"] if advancing else None,
        "round_id": bucket.round_id,
        "teams": [
            {
                "id": e.team_id,
                "name": e.team.name,
                "source_pool_id": e.source_pool_id,
                "source_pool_name": e.source_pool.name if e.source_pool else None,
                "seed_rank": e.seed_rank,
            }
            for e in bucket.entries
        ],
        "pools": pools_status,
        "knockout": knockout_status,
    }


# ---------- Get-or-create / read ----------
@router.post("/tournaments/{tournament_id}/rounds/{round_id}/bucket", status_code=201)
def get_or_create_bucket(tournament_id: int, round_id: int, db: Session = Depends(get_db)):
    t = db.get(models.Tournament, tournament_id)
    if not t:
        raise HTTPException(404, "Tournament not found")
    r = db.get(models.Round, round_id)
    if not r or r.tournament_id != tournament_id:
        raise HTTPException(404, "Round not found for this tournament")

    existing = (
        db.query(models.Bucket)
        .filter(models.Bucket.source_round_id == round_id, models.Bucket.round_id.is_(None))
        .first()
    )
    if existing:
        return _bucket_dict(db, existing)

    bucket = models.Bucket(tournament_id=tournament_id, name=f"Bucket from {r.name}", source_round_id=round_id)
    db.add(bucket)
    db.commit()
    db.refresh(bucket)
    return _bucket_dict(db, bucket)


@router.get("/buckets/{bucket_id}")
def get_bucket(bucket_id: int, db: Session = Depends(get_db)):
    return _bucket_dict(db, _get_bucket(db, bucket_id))


# ---------- Pulling teams in ----------
@router.post("/buckets/{bucket_id}/pull", status_code=201)
def pull_into_bucket(bucket_id: int, payload: schemas.BucketPullRequest, db: Session = Depends(get_db)):
    bucket = _get_bucket(db, bucket_id)
    if bucket.round_id is not None:
        raise HTTPException(409, "This bucket has already been turned into a round")

    team_ids = list(dict.fromkeys(payload.team_ids))
    if not team_ids:
        raise HTTPException(400, "Pick at least one team to pull")

    committed = _teams_committed_elsewhere(db, bucket)
    conflicting = [tid for tid in team_ids if tid in committed]
    if conflicting:
        names = sorted(t.name for t in db.query(models.Team).filter(models.Team.id.in_(conflicting)).all())
        verb = "has" if len(names) == 1 else "have"
        raise HTTPException(409, f"{', '.join(names)} already {verb} an active match from this round in another bucket — cancel or delete it first")

    advancing = _compute_advancing_teams(db, bucket.source_round)

    if advancing["format"] == "LEAGUE":
        if payload.pool_id is None:
            raise HTTPException(400, "pool_id is required to pull from a league round")
        pool = next((p for p in advancing["pools"] if p["pool_id"] == payload.pool_id), None)
        if not pool:
            raise HTTPException(404, "Pool not found in this round")
        if any(e.source_pool_id == payload.pool_id for e in bucket.entries):
            raise HTTPException(409, f"{pool['pool_name']} has already been pulled into this bucket")
        if not pool["ready"]:
            raise HTTPException(409, f"{pool['pool_name']} isn't finished yet")

        pool_team_ids = set(pool["team_ids"])
        allowed = {row["id"] for row in pool["qualifiers"]} | {row["id"] for row in pool["tie_candidates"]}
        need = len(pool["qualifiers"]) + pool["tie_need"]
        if any(tid not in pool_team_ids for tid in team_ids) or len(team_ids) != need or any(tid not in allowed for tid in team_ids):
            raise HTTPException(400, f"Choose exactly {need} team(s) from {pool['pool_name']}'s qualifiers/tie candidates")

        rank_by_team = {row["team_id"]: row["position"] for row in pool["standings"]}
        for tid in team_ids:
            db.add(models.BucketTeam(bucket_id=bucket.id, team_id=tid, source_pool_id=payload.pool_id, seed_rank=rank_by_team.get(tid)))
    else:
        if not advancing["ready"]:
            raise HTTPException(409, advancing["blocking"] or "This round isn't finished yet")
        available = {row["id"] for row in (advancing["teams"] or [])}
        if any(tid not in available for tid in team_ids):
            raise HTTPException(400, "team_ids must be current winners of this round")
        already = {e.team_id for e in bucket.entries}
        for tid in team_ids:
            if tid not in already:  # idempotent — safe to pull again later as more matches finish
                db.add(models.BucketTeam(bucket_id=bucket.id, team_id=tid, source_pool_id=None, seed_rank=None))

    db.commit()
    db.refresh(bucket)
    return _bucket_dict(db, bucket)


@router.delete("/buckets/{bucket_id}/teams/{team_id}", status_code=204)
def remove_bucket_team(bucket_id: int, team_id: int, db: Session = Depends(get_db)):
    bucket = _get_bucket(db, bucket_id)
    if bucket.round_id is not None:
        raise HTTPException(409, "This bucket has already been turned into a round")
    entry = db.get(models.BucketTeam, (bucket_id, team_id))
    if entry:
        db.delete(entry)
        db.commit()


@router.delete("/buckets/{bucket_id}", status_code=204)
def delete_bucket(bucket_id: int, db: Session = Depends(get_db)):
    bucket = _get_bucket(db, bucket_id)
    if bucket.round_id is not None:
        raise HTTPException(409, "This bucket has already been turned into a round — delete the round instead")
    db.delete(bucket)
    db.commit()


# ---------- Turning a bucket into a round ----------
def _seed_bucket_teams(entries: list[models.BucketTeam]) -> list[int]:
    """All pools' rank-1 qualifiers first (in the order pools were pulled),
    then all rank-2s, etc. — so adjacent Round 1 pairing slots are never from
    the same pool (the bug that prompted buckets in the first place).
    Knockout-sourced entries (no source_pool_id — one implicit group) pass
    through in their existing order unchanged, since there's no grouping to
    avoid."""
    groups: dict[int | None, list[models.BucketTeam]] = {}
    order: list[int | None] = []
    for e in entries:
        key = e.source_pool_id
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(e)
    for key in groups:
        groups[key].sort(key=lambda e: e.seed_rank or 0)

    result: list[int] = []
    rank = 0
    while True:
        added = False
        for key in order:
            if rank < len(groups[key]):
                result.append(groups[key][rank].team_id)
                added = True
        if not added:
            break
        rank += 1
    return result


@router.post("/buckets/{bucket_id}/create-round", status_code=201)
def create_round_from_bucket(bucket_id: int, payload: schemas.BucketCreateRoundRequest, db: Session = Depends(get_db)):
    bucket = _get_bucket(db, bucket_id)
    if bucket.round_id is not None:
        raise HTTPException(409, "This bucket has already been turned into a round")
    if len(bucket.entries) < 2:
        raise HTTPException(400, "Pull at least 2 teams into the bucket first")

    team_ids = _seed_bucket_teams(bucket.entries)

    round_ = models.Round(
        tournament_id=bucket.tournament_id, name=payload.name, sequence=bucket.source_round.sequence + 1,
        format=payload.format, source_round_id=bucket.source_round_id,
    )
    db.add(round_)
    db.flush()

    if payload.format == "KNOCKOUT":
        _create_one_knockout_round(db, bucket.tournament_id, round_.id, team_ids, payload.bye_team_ids)
    else:
        round_.entrants = [e.team for e in bucket.entries]

    bucket.round_id = round_.id
    db.commit()
    db.refresh(round_)
    return _round_dict(round_, db)
