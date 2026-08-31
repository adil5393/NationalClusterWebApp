from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/teams", tags=["teams"])


def _participant_counts(db: Session) -> dict[int, int]:
    return dict(
        db.query(models.Participant.team_id, func.count(models.Participant.id))
        .group_by(models.Participant.team_id)
        .all()
    )


def _age_group_counts_map(db: Session, team_ids: list[int]) -> dict[int, dict[str, int]]:
    """Per-team headcount broken out by age_group (e.g. {"Under 14": 10,
    "Under 17": 8}) rather than one lumped total — a school can field squads
    across several age categories, and each one needs its own minimum-squad
    check, not a combined number that hides a short-handed category."""
    if not team_ids:
        return {}
    result: dict[int, dict[str, int]] = {}
    for team_id, age_group, count in (
        db.query(models.Participant.team_id, models.Participant.age_group, func.count(models.Participant.id))
        .filter(models.Participant.team_id.in_(team_ids), models.Participant.age_group.isnot(None))
        .group_by(models.Participant.team_id, models.Participant.age_group)
        .all()
    ):
        result.setdefault(team_id, {})[age_group] = count
    return result


def _present_counts_map(db: Session, team_ids: list[int]) -> dict[int, dict[str, int]]:
    """Same shape as _age_group_counts_map, but only checked-in
    (Participant.is_present) players — what the min_present_players
    eligibility check (routers/matches.py _team_unplayable_reason) actually
    compares against."""
    if not team_ids:
        return {}
    result: dict[int, dict[str, int]] = {}
    for team_id, age_group, count in (
        db.query(models.Participant.team_id, models.Participant.age_group, func.count(models.Participant.id))
        .filter(
            models.Participant.team_id.in_(team_ids),
            models.Participant.age_group.isnot(None),
            models.Participant.is_present.is_(True),
        )
        .group_by(models.Participant.team_id, models.Participant.age_group)
        .all()
    ):
        result.setdefault(team_id, {})[age_group] = count
    return result


def _accommodation_map(db: Session, team_ids: list[int], participant_counts: dict[int, int]) -> dict[int, dict]:
    """Per team: {"status": "none"|"partial"|"full", "locations": [{"room",
    "building", "whole_team", "count"}]}. Reuses the same real-headcount logic
    as accommodation.py's _room_headcount, since Team.member_count can drift
    out of sync with the actual Participant rows."""
    if not team_ids:
        return {}

    room_info = {
        room_id: (room_name, building_name)
        for room_id, room_name, building_name in (
            db.query(models.Room.id, models.Room.name, models.Building.name)
            .join(models.Floor, models.Room.floor_id == models.Floor.id)
            .join(models.Building, models.Floor.building_id == models.Building.id)
            .all()
        )
    }

    locations: dict[int, list[dict]] = {tid: [] for tid in team_ids}
    whole_team_ids: set[int] = set()
    for team_id, room_id in (
        db.query(models.AccommodationAssignment.team_id, models.AccommodationAssignment.room_id)
        .filter(models.AccommodationAssignment.team_id.in_(team_ids))
        .all()
    ):
        whole_team_ids.add(team_id)
        room_name, building_name = room_info.get(room_id, (None, None))
        locations[team_id].append({"room": room_name, "building": building_name, "whole_team": True, "count": participant_counts.get(team_id, 0)})

    participant_housed_counts: dict[int, int] = {}
    for team_id, room_id, count in (
        db.query(models.Participant.team_id, models.AccommodationAssignment.room_id, func.count(models.AccommodationAssignment.id))
        .join(models.AccommodationAssignment, models.AccommodationAssignment.participant_id == models.Participant.id)
        .filter(models.Participant.team_id.in_(team_ids))
        .group_by(models.Participant.team_id, models.AccommodationAssignment.room_id)
        .all()
    ):
        participant_housed_counts[team_id] = participant_housed_counts.get(team_id, 0) + count
        if team_id in whole_team_ids:
            continue  # already fully covered by a whole-team assignment — don't double-list
        room_name, building_name = room_info.get(room_id, (None, None))
        locations[team_id].append({"room": room_name, "building": building_name, "whole_team": False, "count": count})

    result = {}
    for team_id in team_ids:
        size = participant_counts.get(team_id, 0)
        if team_id in whole_team_ids and size > 0:
            status = "full"
        else:
            housed = participant_housed_counts.get(team_id, 0)
            if housed == 0:
                status = "none"
            elif size > 0 and housed >= size:
                status = "full"
            else:
                status = "partial"
        result[team_id] = {"status": status, "locations": locations[team_id]}
    return result


@router.get("", response_model=list[schemas.TeamRead])
def list_teams(db: Session = Depends(get_db)):
    counts = _participant_counts(db)
    teams = db.query(models.Team).order_by(models.Team.name).all()
    team_ids = [t.id for t in teams]
    accommodation = _accommodation_map(db, team_ids, counts)
    age_group_counts = _age_group_counts_map(db, team_ids)
    present_counts = _present_counts_map(db, team_ids)
    for t in teams:
        t.participant_count = counts.get(t.id, 0)
        info = accommodation.get(t.id, {"status": "none", "locations": []})
        t.accommodation_status = info["status"]
        t.accommodation_locations = info["locations"]
        t.age_group_counts = age_group_counts.get(t.id, {})
        t.present_counts = present_counts.get(t.id, {})
    return teams


@router.post("", response_model=schemas.TeamRead, status_code=201)
def create_team(payload: schemas.TeamCreate, db: Session = Depends(get_db)):
    team = models.Team(**payload.model_dump())
    db.add(team)
    db.commit()
    db.refresh(team)
    team.participant_count = 0
    team.accommodation_status = "none"
    team.accommodation_locations = []
    team.age_group_counts = {}
    team.present_counts = {}
    return team


# Registered before "/{team_id}" — otherwise FastAPI tries to parse "empty" as an int id.
@router.delete("/empty")
def delete_empty_teams(db: Session = Depends(get_db)):
    counts = _participant_counts(db)
    empty_teams = [t for t in db.query(models.Team).all() if counts.get(t.id, 0) == 0]
    names = [t.name for t in empty_teams]
    for t in empty_teams:
        db.delete(t)
    db.commit()
    return {"deleted": len(names), "names": names}


@router.get("/{team_id}", response_model=schemas.TeamRead)
def get_team(team_id: int, db: Session = Depends(get_db)):
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    return team


def _pool_teammates(db: Session, team_id: int) -> list[models.Team]:
    """Every other team sharing at least one pool with this one."""
    pool_ids = [row[0] for row in db.query(models.pool_teams.c.pool_id).filter(models.pool_teams.c.team_id == team_id).all()]
    if not pool_ids:
        return []
    teammate_ids = {
        row[0]
        for row in db.query(models.pool_teams.c.team_id)
        .filter(models.pool_teams.c.pool_id.in_(pool_ids), models.pool_teams.c.team_id != team_id)
        .all()
    }
    if not teammate_ids:
        return []
    return db.query(models.Team).filter(models.Team.id.in_(teammate_ids)).all()


_OPPOSITE_AWARD = {"winner": "runner", "runner": "winner"}


def _replace_last_year_awards(db: Session, team: models.Team, awards: list[schemas.LastYearAwardEntry]) -> None:
    """Replaces this team's whole set of last-year awards (at most one per
    age group — a team can be winner in one group and runner-up in another,
    just never both in the same one). Steal-on-conflict is not allowed: if
    another team already holds the same (age_group, award), this fails
    loudly instead of silently reassigning it. Also rejects an award that
    would collide with a pool teammate's opposite award in the same age
    group. Validates everything before touching the DB, so a rejected
    request leaves the team's existing awards untouched."""
    seen_groups: set[str] = set()
    for entry in awards:
        if entry.age_group in seen_groups:
            raise HTTPException(400, f"Only one award per age group — '{entry.age_group}' listed twice")
        seen_groups.add(entry.age_group)

    teammates = _pool_teammates(db, team.id)
    for entry in awards:
        holder = (
            db.query(models.TeamLastYearAward)
            .filter(
                models.TeamLastYearAward.age_group == entry.age_group,
                models.TeamLastYearAward.award == entry.award,
                models.TeamLastYearAward.team_id != team.id,
            )
            .first()
        )
        if holder:
            other = db.get(models.Team, holder.team_id)
            raise HTTPException(
                409,
                f"{other.name if other else 'Another team'} already holds last year's {entry.award} for {entry.age_group}",
            )
        conflict = next(
            (
                t for t in teammates
                if any(a.age_group == entry.age_group and a.award == _OPPOSITE_AWARD[entry.award] for a in t.last_year_awards)
            ),
            None,
        )
        if conflict:
            raise HTTPException(
                409,
                f"{conflict.name} shares a pool with {team.name} and already holds the other award for "
                f"{entry.age_group} — winner and runner-up can't be in the same pool",
            )

    db.query(models.TeamLastYearAward).filter(models.TeamLastYearAward.team_id == team.id).delete()
    db.flush()
    for entry in awards:
        db.add(models.TeamLastYearAward(team_id=team.id, age_group=entry.age_group, award=entry.award))


@router.put("/{team_id}", response_model=schemas.TeamRead)
def update_team(team_id: int, payload: schemas.TeamUpdate, db: Session = Depends(get_db)):
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    data = payload.model_dump(exclude_unset=True)
    data.pop("last_year_awards", None)

    if payload.last_year_awards is not None:
        _replace_last_year_awards(db, team, payload.last_year_awards)

    for key, value in data.items():
        setattr(team, key, value)
    db.commit()
    db.refresh(team)
    team.present_counts = _present_counts_map(db, [team.id]).get(team.id, {})
    return team


@router.delete("/{team_id}", status_code=204)
def delete_team(team_id: int, db: Session = Depends(get_db)):
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    db.delete(team)
    db.commit()


@router.delete("/{team_id}/photos/{photo_id}", status_code=204)
def delete_team_photo(team_id: int, photo_id: int, db: Session = Depends(get_db)):
    photo = db.get(models.TeamPhoto, photo_id)
    if not photo or photo.team_id != team_id:
        raise HTTPException(404, "Photo not found")
    db.delete(photo)
    db.commit()
