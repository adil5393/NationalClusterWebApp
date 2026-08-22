"""Initializes the physical campus structure (Buildings -> Floors -> Rooms) so it
matches the interactive campus map (frontend/public/campus-map.svg, rendered on the
public /campus page). "Find My Room" only works for rooms whose Building/Room names
match the map's labels exactly — this script creates exactly that set.

Run once after deploying (or any time — it's idempotent, see below):
    python -m app.seed_campus
    docker compose exec backend python -m app.seed_campus

Safe to re-run: any Building whose name already exists is left untouched and skipped,
so this won't duplicate rooms or clobber capacities/notes an organizer has since edited.
"""
from .database import SessionLocal, engine, Base
from . import models

# Building -> Floor -> [(room name, room_type, capacity), ...]
# Floor and room_type were read directly off the map's own floor-color legend
# (Ground/First/Second) and labels, not guessed.
CAMPUS = {
    "Building-1": {
        "Ground Floor": [
            ("Room-4", "Dormitory", 30), ("Room-5", "Dormitory", 30), ("Room-26", "Dormitory", 30),
            ("Comp Lab", "Lab", 0), ("Room-3", "Dormitory", 30), ("Room-2", "Dormitory", 30),
            ("Staff Room", "Staff", 0), ("Room-1", "Dormitory", 30),
        ],
        "First Floor": [
            ("Room-11", "Dormitory", 30), ("Room-12", "Dormitory", 30), ("Room-27", "Dormitory", 30),
            ("Room-10", "Dormitory", 30), ("Room-9", "Dormitory", 30), ("Room-8", "Dormitory", 30),
            ("Room-7", "Dormitory", 30), ("Room-6", "Dormitory", 30),
        ],
        "Second Floor": [
            ("Room-18", "Dormitory", 30), ("Room-19", "Dormitory", 30), ("Room-28", "Dormitory", 30),
            ("Room-17", "Dormitory", 30), ("Room-16", "Dormitory", 30), ("Room-15", "Dormitory", 30),
            ("Room-14", "Dormitory", 30), ("Room-13", "Dormitory", 30),
        ],
    },
    "Building-2": {
        "Ground Floor": [("Room-21", "Dormitory", 30), ("Room-20", "Dormitory", 30)],
        "First Floor": [("Room-23", "Dormitory", 30), ("Room-22", "Dormitory", 30)],
        "Second Floor": [("Room-25", "Dormitory", 30), ("Room-24", "Dormitory", 30)],
    },
    "Building-3": {
        "First Floor": [("Room-1", "Dormitory", 30), ("Hall", "Facility", 0), ("Room-2", "Dormitory", 30)],
    },
    "Admin Building": {
        "Ground Floor": [("Reception", "Facility", 0), ("Office", "Facility", 0)],
        "First Floor": [("Library", "Facility", 0)],
        "Second Floor": [("Meeting Hall", "Facility", 0)],
    },
}

FLOOR_LEVELS = {"Ground Floor": 0, "First Floor": 1, "Second Floor": 2}


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        buildings_created = floors_created = rooms_created = 0
        for building_name, floors in CAMPUS.items():
            if db.query(models.Building).filter_by(name=building_name).first():
                print(f"Skipped '{building_name}': already exists.")
                continue
            building = models.Building(name=building_name)
            db.add(building)
            db.flush()
            buildings_created += 1
            for floor_name, rooms in floors.items():
                floor = models.Floor(building_id=building.id, name=floor_name, level=FLOOR_LEVELS[floor_name])
                db.add(floor)
                db.flush()
                floors_created += 1
                for room_name, room_type, capacity in rooms:
                    db.add(models.Room(floor_id=floor.id, name=room_name, room_type=room_type, capacity=capacity))
                    rooms_created += 1
        db.commit()
        print(f"Campus structure ready: {buildings_created} building(s), {floors_created} floor(s), {rooms_created} room(s) created.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
