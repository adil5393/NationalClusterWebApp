"""Spreadsheet (CSV) exports for room allocation and participant lists."""
import csv
import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..security import require_module

router = APIRouter(prefix="/api/export", tags=["export"])


def _csv_response(header, rows, filename):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/participants.csv", dependencies=[Depends(require_module("teams"))])
def export_participants(db: Session = Depends(get_db)):
    teams = {t.id: t.name for t in db.query(models.Team).all()}
    rows = [
        [p.full_name, teams.get(p.team_id, ""), p.role or "", p.gender or "", p.age or ""]
        for p in db.query(models.Participant).order_by(models.Participant.team_id, models.Participant.full_name).all()
    ]
    return _csv_response(["Full Name", "Team", "Role", "Gender", "Age"], rows, "participants.csv")


@router.get("/rooms.csv", dependencies=[Depends(require_module("accommodation"))])
def export_room_allocation(db: Session = Depends(get_db)):
    rows = []
    for a in db.query(models.AccommodationAssignment).all():
        room = a.room
        floor = room.floor if room else None
        building = floor.building if floor else None
        participant = db.get(models.Participant, a.participant_id) if a.participant_id else None
        rows.append([
            building.name if building else "",
            floor.name if floor else "",
            room.name if room else "",
            a.bed.label if a.bed else "",
            participant.full_name if participant else "(whole team)",
            a.team.name if a.team else "",
        ])
    return _csv_response(["Building", "Floor", "Room", "Bed", "Occupant", "Team"], rows, "room-allocation.csv")
