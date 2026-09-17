"""EventLocation is Staff Operations' one location abstraction. A row is
either a genuine standalone operational station (Main Gate, Medical Desk —
organizer-managed here, as before) or a thin, reusable LINKED wrapper around
an existing authoritative physical record — a Mat, a Building, or a Room —
so a Staff Duty can reference "Mat 1" or "Building 1 / Room 101" without an
organizer manually re-creating it as a duplicate EventLocation. See
models.EventLocation's docstring for the exact invariants (at most one
source linked, at most one wrapper per source, enforced at the DB level
too).

Wrapper rows are never created through this router's own POST/PUT — only
resolve_event_location_for_source (called from routers/staff.py at duty
creation) creates or reuses one, and only the first time a given physical
place is actually used as a duty location. GET /event-locations/available
is purely read-only discovery — it never creates rows itself."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/event-locations", tags=["event-locations"])


def _room_display_name(room: "models.Room") -> str:
    """"Building 1 · Room 101" — falls back gracefully if the room's floor/
    building has gone missing for some reason (shouldn't happen: Room's own
    floor_id is NOT NULL)."""
    floor = room.floor
    building = floor.building if floor else None
    return f"{building.name} · {room.name}" if building else room.name


def resolve_location_display(loc: "models.EventLocation") -> dict:
    """The live display name/type/source for one EventLocation row —
    resolved from the linked Mat/Building/Room when this is a LINKED
    wrapper (so a rename of the source shows up immediately, with nothing
    stored redundantly on the wrapper itself trusted for display), or from
    the row's own columns when it's a STANDALONE operational station.
    Shared by this router's own serialization, routers/staff.py's
    _duty_dict, and routers/staff_reports.py — the one place this logic
    lives."""
    if loc.mat_id:
        mat = loc.mat
        return {
            "name": mat.name if mat else loc.name,
            "location_type": "MAT",
            "location_source": "mat",
            "location_source_id": loc.mat_id,
        }
    if loc.room_id:
        room = loc.room
        return {
            "name": _room_display_name(room) if room else loc.name,
            "location_type": "ROOM",
            "location_source": "room",
            "location_source_id": loc.room_id,
        }
    if loc.building_id:
        building = loc.building
        return {
            "name": building.name if building else loc.name,
            "location_type": "ACCOMMODATION",
            "location_source": "building",
            "location_source_id": loc.building_id,
        }
    return {
        "name": loc.name,
        "location_type": loc.location_type,
        "location_source": "event_location",
        "location_source_id": loc.id,
    }


def resolve_duty_location_hierarchy(duty: "models.DutyAssignment") -> tuple[str, str, str]:
    """
    Returns (location_name, building_name, room_name) for any duty assignment.
    Handles:
    - duty.location linked to Room -> (location_name, building_name, room_name)
    - duty.location linked to Building -> (building_name, building_name, "—")
    - duty.location linked to Mat -> (mat_name, "—", "—")
    - duty.location standalone -> (location_name, "—", "—")
    - duty.room direct (legacy) -> (location_name, building_name, room_name)
    - no location assigned -> ("Not Assigned", "—", "—")
    """
    if duty.location:
        loc = duty.location
        if loc.room_id:
            r = loc.room
            if r:
                floor = r.floor
                b = floor.building if floor else None
                b_name = b.name if b else "—"
                r_name = r.name
                loc_name = f"{b_name} · {r_name}" if b else r_name
                return loc_name, b_name, r_name
            return loc.name, "—", "—"
        if loc.building_id:
            b = loc.building
            b_name = b.name if b else loc.name
            return b_name, b_name, "—"
        if loc.mat_id:
            m = loc.mat
            m_name = m.name if m else loc.name
            return m_name, "—", "—"
        disp = resolve_location_display(loc)
        return disp.get("name") or loc.name or "Not Assigned", "—", "—"

    if duty.room:
        r = duty.room
        floor = r.floor
        b = floor.building if floor else None
        b_name = b.name if b else "—"
        r_name = r.name
        loc_name = f"{b_name} · {r_name}" if b else r_name
        return loc_name, b_name, r_name

    return "Not Assigned", "—", "—"



def resolve_event_location_for_source(db: Session, source: str, source_id: int) -> "models.EventLocation":
    """Resolves a normalized location selection (location_source +
    location_source_id — see GET .../available) to the EventLocation row
    DutyAssignment.location_id must reference, creating a wrapper the first
    time a given Mat/Building/Room is used as a duty location and reusing
    it every time after. Only called at duty creation/update — never from a
    GET path, so reads never mutate state.

    Uniqueness (one wrapper per physical record) is enforced by a partial
    unique index at the DB level (see the migration), not just this
    check-then-insert — a concurrent request racing this one is handled by
    catching the resulting IntegrityError and re-fetching."""
    if source == "event_location":
        loc = db.get(models.EventLocation, source_id)
        if not loc:
            raise HTTPException(404, "Event location not found")
        return loc

    if source == "mat":
        model, fk_field, label, location_type = models.Mat, models.EventLocation.mat_id, "Mat/ground", "MAT"
    elif source == "building":
        model, fk_field, label, location_type = models.Building, models.EventLocation.building_id, "Building", "ACCOMMODATION"
    elif source == "room":
        model, fk_field, label, location_type = models.Room, models.EventLocation.room_id, "Room", "ROOM"
    else:
        raise HTTPException(400, f"Unknown location source '{source}'")

    physical = db.get(model, source_id)
    if not physical:
        raise HTTPException(404, f"{label} not found")

    existing = db.query(models.EventLocation).filter(fk_field == source_id).first()
    if existing:
        return existing

    display_name = _room_display_name(physical) if source == "room" else physical.name
    wrapper = models.EventLocation(
        name=display_name,
        location_type=location_type,
        **{f"{source}_id": source_id},
    )
    db.add(wrapper)
    try:
        db.flush()
    except IntegrityError:
        # Lost a race with another request wrapping the same physical
        # record at the same time — reuse the one that won instead of
        # erroring or creating a second wrapper.
        db.rollback()
        existing = db.query(models.EventLocation).filter(fk_field == source_id).first()
        if existing:
            return existing
        raise
    return wrapper


def _event_location_dict(loc: models.EventLocation, db: Session) -> dict:
    duty_count = db.query(models.DutyAssignment).filter(models.DutyAssignment.location_id == loc.id).count()
    resolved = resolve_location_display(loc)
    return {
        "id": loc.id,
        "name": resolved["name"],
        "location_type": resolved["location_type"],
        "location_source": resolved["location_source"],
        "location_source_id": resolved["location_source_id"],
        "description": loc.description,
        "is_active": loc.is_active,
        "sort_order": loc.sort_order,
        "duty_count": duty_count,
        "created_at": loc.created_at.isoformat() if loc.created_at else None,
        "updated_at": loc.updated_at.isoformat() if loc.updated_at else None,
    }


@router.get("", response_model=list[schemas.EventLocationRead])
def list_event_locations(
    active_only: bool | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.EventLocation)
    if active_only is not None:
        q = q.filter(models.EventLocation.is_active == active_only)
    rows = q.order_by(models.EventLocation.sort_order.asc(), models.EventLocation.name.asc()).all()
    return [_event_location_dict(loc, db) for loc in rows]


@router.get("/available")
def list_available_duty_locations(db: Session = Depends(get_db)):
    """Normalized combined catalogue for the Staff Duty location selector:
    every Mat, every Building, every Room (grouped under its building), and
    every active standalone EventLocation — so an organizer picks an
    EXISTING physical record instead of re-creating "Mat 1" as a new
    EventLocation. Purely read-only: never creates a wrapper row (that only
    happens at duty creation — see resolve_event_location_for_source).
    `event_location_id` is populated when a wrapper already exists for that
    physical record, so the frontend/backend can display it consistently,
    but a null value here is normal and not an error."""
    wrapper_by_source: dict[tuple[str, int], int] = {}
    for loc in db.query(models.EventLocation).filter(
        models.EventLocation.mat_id.isnot(None)
        | models.EventLocation.building_id.isnot(None)
        | models.EventLocation.room_id.isnot(None)
    ):
        if loc.mat_id:
            wrapper_by_source[("mat", loc.mat_id)] = loc.id
        elif loc.building_id:
            wrapper_by_source[("building", loc.building_id)] = loc.id
        elif loc.room_id:
            wrapper_by_source[("room", loc.room_id)] = loc.id

    options = []
    for mat in db.query(models.Mat).order_by(models.Mat.name).all():
        options.append({
            "key": f"mat:{mat.id}",
            "name": mat.name,
            "location_type": "MAT",
            "location_source": "mat",
            "location_source_id": mat.id,
            "event_location_id": wrapper_by_source.get(("mat", mat.id)),
        })

    for building in db.query(models.Building).order_by(models.Building.name).all():
        options.append({
            "key": f"building:{building.id}",
            "name": building.name,
            "location_type": "ACCOMMODATION",
            "location_source": "building",
            "location_source_id": building.id,
            "event_location_id": wrapper_by_source.get(("building", building.id)),
        })
        for floor in building.floors:
            for room in floor.rooms:
                options.append({
                    "key": f"room:{room.id}",
                    "name": _room_display_name(room),
                    "location_type": "ROOM",
                    "location_source": "room",
                    "location_source_id": room.id,
                    "event_location_id": wrapper_by_source.get(("room", room.id)),
                })

    standalone = (
        db.query(models.EventLocation)
        .filter(
            models.EventLocation.is_active.is_(True),
            models.EventLocation.mat_id.is_(None),
            models.EventLocation.building_id.is_(None),
            models.EventLocation.room_id.is_(None),
        )
        .order_by(models.EventLocation.sort_order.asc(), models.EventLocation.name.asc())
        .all()
    )
    for loc in standalone:
        options.append({
            "key": f"event_location:{loc.id}",
            "name": loc.name,
            "location_type": loc.location_type,
            "location_source": "event_location",
            "location_source_id": loc.id,
            "event_location_id": loc.id,
        })

    return options


@router.get("/{location_id}", response_model=schemas.EventLocationRead)
def get_event_location(location_id: int, db: Session = Depends(get_db)):
    loc = db.get(models.EventLocation, location_id)
    if not loc:
        raise HTTPException(404, "Event location not found")
    return _event_location_dict(loc, db)


@router.post("", response_model=schemas.EventLocationRead, status_code=201)
def create_event_location(payload: schemas.EventLocationCreate, db: Session = Depends(get_db)):
    """Standalone operational locations only (Main Gate, Medical Desk, ...)
    — linked wrappers around a Mat/Building/Room are never created here,
    only via resolve_event_location_for_source at duty creation."""
    name_clean = payload.name.strip()
    if not name_clean:
        raise HTTPException(400, "Location name cannot be empty")

    # Case-insensitive duplicate check
    existing = db.query(models.EventLocation).filter(
        func.lower(models.EventLocation.name) == name_clean.lower()
    ).first()
    if existing:
        raise HTTPException(400, f"An event location with name '{name_clean}' already exists.")

    data = payload.model_dump()
    data["name"] = name_clean
    loc = models.EventLocation(**data)
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return _event_location_dict(loc, db)


@router.put("/{location_id}", response_model=schemas.EventLocationRead)
def update_event_location(location_id: int, payload: schemas.EventLocationUpdate, db: Session = Depends(get_db)):
    loc = db.get(models.EventLocation, location_id)
    if not loc:
        raise HTTPException(404, "Event location not found")

    is_linked = bool(loc.mat_id or loc.building_id or loc.room_id)
    data = payload.model_dump(exclude_unset=True)

    if is_linked and "name" in data and data["name"] is not None and data["name"].strip() != loc.name:
        raise HTTPException(
            400,
            "This location's name is derived from its linked Mat/Building/Room and can't be edited directly. "
            "Rename the source record instead.",
        )

    if "name" in data and data["name"] is not None:
        name_clean = data["name"].strip()
        if not name_clean:
            raise HTTPException(400, "Location name cannot be empty")
        existing = db.query(models.EventLocation).filter(
            func.lower(models.EventLocation.name) == name_clean.lower(),
            models.EventLocation.id != location_id,
        ).first()
        if existing:
            raise HTTPException(400, f"An event location with name '{name_clean}' already exists.")
        data["name"] = name_clean

    for k, val in data.items():
        setattr(loc, k, val)
    db.commit()
    db.refresh(loc)
    return _event_location_dict(loc, db)


@router.delete("/{location_id}", status_code=204)
def delete_event_location(location_id: int, db: Session = Depends(get_db)):
    loc = db.get(models.EventLocation, location_id)
    if not loc:
        raise HTTPException(404, "Event location not found")

    # Location Deletion Safety: Refuse if referenced by duties
    duty_count = db.query(models.DutyAssignment).filter(models.DutyAssignment.location_id == location_id).count()
    if duty_count > 0:
        raise HTTPException(
            409,
            "Location is used by existing duties. Deactivate it instead."
        )

    db.delete(loc)
    db.commit()
