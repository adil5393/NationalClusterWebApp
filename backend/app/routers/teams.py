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


@router.get("", response_model=list[schemas.TeamRead])
def list_teams(db: Session = Depends(get_db)):
    counts = _participant_counts(db)
    teams = db.query(models.Team).order_by(models.Team.name).all()
    for t in teams:
        t.participant_count = counts.get(t.id, 0)
    return teams


@router.post("", response_model=schemas.TeamRead, status_code=201)
def create_team(payload: schemas.TeamCreate, db: Session = Depends(get_db)):
    team = models.Team(**payload.model_dump())
    db.add(team)
    db.commit()
    db.refresh(team)
    team.participant_count = 0
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


@router.put("/{team_id}", response_model=schemas.TeamRead)
def update_team(team_id: int, payload: schemas.TeamUpdate, db: Session = Depends(get_db)):
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(team, key, value)
    db.commit()
    db.refresh(team)
    return team


@router.delete("/{team_id}", status_code=204)
def delete_team(team_id: int, db: Session = Depends(get_db)):
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    db.delete(team)
    db.commit()
