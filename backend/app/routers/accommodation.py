"""Accommodation: assign teams/participants to rooms + live occupancy per building."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/accommodation", tags=["accommodation"])


def _room_context(room: models.Room):
    floor = room.floor
    building = floor.building if floor else None
    return floor, building


def _team_size(db: Session, team_id: int) -> int:
    """A team's real roster size — the actual Participant rows entered/imported for
    it, not the self-reported Team.member_count (which can drift out of sync)."""
    return db.query(func.count(models.Participant.id)).filter_by(team_id=team_id).scalar() or 0


def _room_headcount(db: Session, room_id: int) -> int:
    """Real person-count occupying a room: participant-level assignments count as 1
    each; whole-team assignments count as that team's actual roster size — NOT as a
    single row, which is what silently let over-capacity whole-team assignments
    through before."""
    total = 0
    for a in db.query(models.AccommodationAssignment).filter_by(room_id=room_id).all():
        if a.participant_id:
            total += 1
        elif a.team_id:
            total += _team_size(db, a.team_id)
    return total


@router.get("/rooms")
def rooms(db: Session = Depends(get_db)):
    out = []
    for r in db.query(models.Room).all():
        floor, building = _room_context(r)
        occupied = _room_headcount(db, r.id)
        out.append({
            "id": r.id,
            "name": r.name,
            "floor": floor.name if floor else None,
            "building": building.name if building else None,
            "label": f"{(building.code or building.name) if building else '?'} · {floor.name if floor else '?'} · {r.name}",
            "capacity": r.capacity or 0,
            "occupied": occupied,
        })
    return out


@router.get("/assignments")
def assignments(db: Session = Depends(get_db)):
    rows = db.query(models.AccommodationAssignment).order_by(models.AccommodationAssignment.id.desc()).all()
    out = []
    for a in rows:
        room = a.room
        floor, building = _room_context(room) if room else (None, None)
        participant = db.get(models.Participant, a.participant_id) if a.participant_id else None
        out.append({
            "id": a.id,
            "room_id": a.room_id,
            "room_name": room.name if room else None,
            "floor_name": floor.name if floor else None,
            "building_name": building.name if building else None,
            "team_id": a.team_id,
            "team_name": a.team.name if a.team else None,
            "participant_id": a.participant_id,
            "participant_name": participant.full_name if participant else None,
            "bed_id": a.bed_id,
            "bed_label": a.bed.label if a.bed else None,
            "notes": a.notes,
        })
    return out


@router.post("/assignments", status_code=201)
def create_assignment(payload: schemas.AssignmentCreate, db: Session = Depends(get_db)):
    room = db.get(models.Room, payload.room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    if not payload.team_id and not payload.participant_id:
        raise HTTPException(400, "Provide a team or a participant to assign")
    if payload.team_id and not db.get(models.Team, payload.team_id):
        raise HTTPException(404, "Team not found")
    if payload.participant_id and not db.get(models.Participant, payload.participant_id):
        raise HTTPException(404, "Participant not found")

    # Bed-level assignment: bed must belong to the room and be free
    if payload.bed_id:
        bed = db.get(models.Bed, payload.bed_id)
        if not bed or bed.room_id != payload.room_id:
            raise HTTPException(400, "Bed does not belong to this room")
        if bed.assignment:
            raise HTTPException(409, f"Bed '{bed.label}' is already occupied")

    # Data integrity: prevent duplicate team assignment to the same room
    if payload.team_id and not payload.participant_id:
        dupe = (
            db.query(models.AccommodationAssignment)
            .filter_by(room_id=payload.room_id, team_id=payload.team_id, participant_id=None)
            .first()
        )
        if dupe:
            raise HTTPException(409, "This team is already assigned to this room")

    # Data integrity: prevent duplicate participant assignment to the same room
    if payload.participant_id:
        dupe_p = (
            db.query(models.AccommodationAssignment)
            .filter_by(room_id=payload.room_id, participant_id=payload.participant_id)
            .first()
        )
        if dupe_p:
            raise HTTPException(409, "This participant is already assigned to this room")

    # Capacity is a WARNING, not a hard block — organizers sometimes need to
    # temporarily overbook a room, so the assignment still goes through. Measured
    # in real people, not assignment rows, so a whole-team assignment is checked
    # against its actual roster size rather than counting as a single occupant.
    warning = None
    if room.capacity:
        current = _room_headcount(db, payload.room_id)
        if payload.team_id and not payload.participant_id:
            team = db.get(models.Team, payload.team_id)
            adding = _team_size(db, payload.team_id)
            if current + adding > room.capacity:
                warning = (
                    f"Assigning '{team.name}' ({adding} people) puts "
                    f"{current + adding} people in '{room.name}' (capacity {room.capacity})"
                )
        else:
            if current + 1 > room.capacity:
                warning = f"'{room.name}' is now over capacity ({current + 1}/{room.capacity})"

    a = models.AccommodationAssignment(**payload.model_dump())
    db.add(a)
    db.commit()
    db.refresh(a)
    return {"id": a.id, "warning": warning}


@router.delete("/assignments/{assignment_id}", status_code=204)
def delete_assignment(assignment_id: int, db: Session = Depends(get_db)):
    a = db.get(models.AccommodationAssignment, assignment_id)
    if not a:
        raise HTTPException(404, "Assignment not found")
    db.delete(a)
    db.commit()


@router.get("/rooms/{room_id}/beds")
def list_beds(room_id: int, db: Session = Depends(get_db)):
    room = db.get(models.Room, room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    out = []
    for bed in room.beds:
        occ = bed.assignment
        participant = db.get(models.Participant, occ.participant_id) if occ and occ.participant_id else None
        out.append({
            "id": bed.id,
            "label": bed.label,
            "occupied": occ is not None,
            "occupant": participant.full_name if participant else (occ.team.name if occ and occ.team else None),
        })
    return out


@router.post("/rooms/{room_id}/beds", status_code=201)
def create_bed(room_id: int, payload: schemas.BedCreate, db: Session = Depends(get_db)):
    if not db.get(models.Room, room_id):
        raise HTTPException(404, "Room not found")
    bed = models.Bed(room_id=room_id, label=payload.label, notes=payload.notes)
    db.add(bed)
    db.commit()
    db.refresh(bed)
    return {"id": bed.id, "label": bed.label}


@router.post("/rooms/{room_id}/beds/generate")
def generate_beds(room_id: int, db: Session = Depends(get_db)):
    room = db.get(models.Room, room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    existing = len(room.beds)
    target = room.capacity or 0
    created = 0
    for n in range(existing + 1, target + 1):
        db.add(models.Bed(room_id=room_id, label=f"Bed {n}"))
        created += 1
    db.commit()
    return {"created": created, "total": existing + created}


@router.delete("/beds/{bed_id}", status_code=204)
def delete_bed(bed_id: int, db: Session = Depends(get_db)):
    bed = db.get(models.Bed, bed_id)
    if not bed:
        raise HTTPException(404, "Bed not found")
    db.delete(bed)
    db.commit()


@router.get("/map")
def room_map(db: Session = Depends(get_db)):
    out = []
    for b in db.query(models.Building).order_by(models.Building.name).all():
        floors = []
        for f in b.floors:
            rooms = []
            for r in f.rooms:
                beds = []
                for bed in r.beds:
                    occ = bed.assignment
                    p = db.get(models.Participant, occ.participant_id) if occ and occ.participant_id else None
                    name = p.full_name if p else (occ.team.name if occ and occ.team else None)
                    beds.append({"id": bed.id, "label": bed.label, "occupant": name})
                loose = []
                for a in r.assignments:
                    if a.bed_id:
                        continue
                    if a.participant_id:
                        p = db.get(models.Participant, a.participant_id)
                        loose.append({"name": p.full_name if p else "Participant", "count": 1})
                    elif a.team_id and a.team:
                        loose.append({"name": f"{a.team.name} (whole team)", "count": _team_size(db, a.team_id)})
                rooms.append({"id": r.id, "name": r.name, "capacity": r.capacity or 0, "beds": beds, "loose": loose})
            floors.append({"id": f.id, "name": f.name, "rooms": rooms})
        out.append({"id": b.id, "name": b.name, "code": b.code, "floors": floors})
    return out


@router.get("/occupancy")
def occupancy(db: Session = Depends(get_db)):
    out = []
    for b in db.query(models.Building).order_by(models.Building.name).all():
        cap = rooms = occ_rooms = assigned = 0
        room_rows = []
        for f in b.floors:
            for r in f.rooms:
                rooms += 1
                cap += r.capacity or 0
                c = _room_headcount(db, r.id)
                assigned += c
                if c > 0:
                    occ_rooms += 1
                room_rows.append({"id": r.id, "name": r.name, "floor": f.name, "capacity": r.capacity or 0, "occupied": c})
        out.append({
            "id": b.id, "name": b.name, "code": b.code,
            "rooms": rooms, "capacity": cap, "occupied_rooms": occ_rooms,
            "assigned": assigned, "room_rows": room_rows,
        })
    return out
