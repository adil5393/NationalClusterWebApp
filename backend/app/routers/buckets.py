"""Buckets — the staging area between a finished round and its successor.

A round's advancing teams (knockout winners, or league pool qualifiers) get
pulled into a Bucket over time — pool by pool as each finishes, for a league
source — and reviewed before the organizer, in a separate action, turns the
*currently pulled* entries into a new round of whichever format (create-
round). The bucket itself never closes: it stays open for the whole life of
its source round, so the organizer can push an early subset (e.g. pool A/B's
winners, while pool C/D are still finishing) into a round and keep playing,
then later pull the rest in and push a second round from the same bucket.
Each entry tracks its own state via BucketTeam.pushed_round_id — NULL means
"pulled" (sitting in the bucket, available), set means "pushed" (already
placed into that round, excluded from the next create-round call and from
its team count/byes). Cancelling or deleting a pushed knockout match frees
the team back to "pulled" (see routers/matches.py _free_pushed_bucket_entries);
deleting the round it was pushed into does the same automatically (SET NULL).

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


def _bucket_dict(db: Session, bucket: models.Bucket) -> dict:
    try:
        advancing = _compute_advancing_teams(db, bucket.source_round) if bucket.source_round else None
    except HTTPException:
        # Source round has no matches/pools yet — nothing computable, but the
        # bucket itself still displays fine (just nothing pullable yet).
        advancing = None

    pulled_pool_ids = {e.source_pool_id for e in bucket.entries if e.source_pool_id is not None}
    pulled_team_ids = {e.team_id for e in bucket.entries}

    # Every round already built from this bucket (usually just one) — so the
    # dialog can offer "add these teams to Round 3" instead of always
    # starting a brand new round when, say, pool A/B already pushed early
    # and pool C is ready to join the same round.
    pushed_rounds: dict[int, dict] = {}
    for e in bucket.entries:
        if e.pushed_round_id and e.pushed_round:
            row = pushed_rounds.setdefault(e.pushed_round_id, {
                "id": e.pushed_round_id, "name": e.pushed_round.name, "format": e.pushed_round.format, "team_count": 0,
            })
            row["team_count"] += 1

    pools_status = None
    byes_status = None
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
        # Teams that skipped this round's pools entirely (Round 1's Generate
        # Bracket, or a later League round's own bye picks) — always ready,
        # independent of pool progress/ties.
        new_byes = [t for t in advancing.get("bye_teams", []) if t["id"] not in pulled_team_ids]
        if advancing.get("bye_teams"):
            byes_status = {"new_byes": new_byes}
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
        "teams": [
            {
                "id": e.team_id,
                "name": e.team.name,
                "source_pool_id": e.source_pool_id,
                "source_pool_name": e.source_pool.name if e.source_pool else None,
                "seed_rank": e.seed_rank,
                "pushed_round_id": e.pushed_round_id,
                "pushed_round_name": e.pushed_round.name if e.pushed_round else None,
            }
            for e in bucket.entries
        ],
        "pools": pools_status,
        "byes": byes_status,
        "knockout": knockout_status,
        "pushed_rounds": sorted(pushed_rounds.values(), key=lambda r: r["id"]),
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

    # One bucket per source round, for its whole life — never re-created.
    # Ordered by id so this is deterministic even if a duplicate ever exists
    # (e.g. from a race on the very first "Advance to Bucket" click) — always
    # resolves to the original, not whichever row Postgres happens to scan
    # first.
    existing = db.query(models.Bucket).filter(models.Bucket.source_round_id == round_id).order_by(models.Bucket.id).first()
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

    team_ids = list(dict.fromkeys(payload.team_ids))
    if not team_ids:
        raise HTTPException(400, "Pick at least one team to pull")

    advancing = _compute_advancing_teams(db, bucket.source_round)

    if advancing["format"] == "LEAGUE" and payload.pool_id is None:
        # Pulling teams that skipped this round's pools entirely (byes) —
        # always allowed once they exist, independent of pool progress.
        bye_ids = {t["id"] for t in advancing.get("bye_teams", [])}
        if not bye_ids:
            raise HTTPException(400, "pool_id is required to pull from a league round")
        if any(tid not in bye_ids for tid in team_ids):
            raise HTTPException(400, "team_ids must be this round's bye teams")
        already = {e.team_id for e in bucket.entries}
        for tid in team_ids:
            if tid not in already:  # idempotent
                db.add(models.BucketTeam(bucket_id=bucket.id, team_id=tid, source_pool_id=None, seed_rank=None))
    elif advancing["format"] == "LEAGUE":
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
    _get_bucket(db, bucket_id)  # 404 if the bucket itself doesn't exist
    entry = db.get(models.BucketTeam, (bucket_id, team_id))
    if not entry:
        return
    if entry.pushed_round_id is not None:
        raise HTTPException(409, "This team has already been placed into a round — cancel or delete that match first")
    db.delete(entry)
    db.commit()


@router.delete("/buckets/{bucket_id}", status_code=204)
def delete_bucket(bucket_id: int, db: Session = Depends(get_db)):
    bucket = _get_bucket(db, bucket_id)
    if any(e.pushed_round_id is not None for e in bucket.entries):
        raise HTTPException(409, "This bucket has teams already placed into a round — remove those first")
    db.delete(bucket)
    db.commit()


# ---------- Turning (currently pulled) bucket entries into a round ----------
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
    available = [e for e in bucket.entries if e.pushed_round_id is None]

    if payload.target_round_id is not None:
        # Fold the currently-pulled teams into a round already built from
        # this same bucket earlier — e.g. pool A/B's winners already started
        # Round 3, and pool C's are ready to join it too. At least 1 pulled
        # team is enough here (it can join as a bye), since the round it's
        # joining already has real matches in it.
        if not available:
            raise HTTPException(400, "Pull at least 1 team into the bucket first")
        round_ = db.get(models.Round, payload.target_round_id)
        if not round_ or round_.tournament_id != bucket.tournament_id or round_.source_round_id != bucket.source_round_id:
            raise HTTPException(404, "That round wasn't built from this bucket")
        fmt = round_.format
    else:
        if len(available) < 2:
            raise HTTPException(400, "Pull at least 2 teams into the bucket first")
        if not payload.name or not payload.format:
            raise HTTPException(400, "name and format are required to start a new round")
        fmt = payload.format
        round_ = models.Round(
            tournament_id=bucket.tournament_id, name=payload.name, sequence=bucket.source_round.sequence + 1,
            format=fmt, source_round_id=bucket.source_round_id,
        )
        db.add(round_)
        db.flush()

    team_ids = _seed_bucket_teams(available)

    if fmt == "KNOCKOUT":
        placed = _create_one_knockout_round(db, bucket.tournament_id, round_.id, team_ids, payload.bye_team_ids)
    else:
        round_.entrants = list(round_.entrants) + [e.team for e in available]
        placed = {e.team_id for e in available}

    for e in available:
        if e.team_id in placed:
            e.pushed_round_id = round_.id

    db.commit()
    db.refresh(round_)
    return _round_dict(round_, db)
