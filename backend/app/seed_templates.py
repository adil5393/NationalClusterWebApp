"""Template data for the public Schedule (events + matches), Announcements,
Transport and Venues pages.

=====================================================================
 TEMPLATE ONLY — placeholder content, not real event information.
 Every row is prefixed "[TEMPLATE]" so it is easy to find and delete.
 Run manually with:  python -m app.seed_templates
 (Fooding Schedule is static content in the frontend, so it needs no rows.)
=====================================================================
"""
from datetime import datetime, time, timedelta, timezone

from .database import SessionLocal, engine, Base
from . import models

TAG = "[TEMPLATE]"


def _at(day: datetime, hh: int, mm: int = 0) -> datetime:
    return datetime.combine(day.date(), time(hh, mm), tzinfo=timezone.utc)


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(models.Venue).filter(models.Venue.name.like(f"{TAG}%")).count() > 0:
            print("Template seed skipped: template data already present.")
            return

        d1 = datetime.now(timezone.utc) + timedelta(days=1)
        d2 = d1 + timedelta(days=1)

        # --- Venues ---
        arena = models.Venue(name=f"{TAG} Main Arena", venue_type="Sports", capacity=800, location="Campus North", description="Template venue.")
        court2 = models.Venue(name=f"{TAG} Secondary Arena", venue_type="Sports", capacity=350, location="Campus East", description="Template venue.")
        dining = models.Venue(name=f"{TAG} Central Dining Hall", venue_type="Dining", capacity=400, location="Campus Center", description="Template venue.")
        db.add_all([arena, court2, dining])
        db.flush()

        # --- Schedule (events tab) ---
        db.add_all([
            models.ScheduleEvent(title=f"{TAG} Team Arrival & Check-in", venue_id=dining.id, start_time=_at(d1, 9), end_time=_at(d1, 12), description="Template event."),
            models.ScheduleEvent(title=f"{TAG} Opening Ceremony", venue_id=arena.id, start_time=_at(d1, 16), end_time=_at(d1, 17, 30), description="Template event."),
            models.ScheduleEvent(title=f"{TAG} Weigh-in Session", venue_id=court2.id, start_time=_at(d2, 7), end_time=_at(d2, 8, 30), description="Template event."),
            models.ScheduleEvent(title=f"{TAG} Closing & Prize Distribution", venue_id=arena.id, start_time=_at(d2, 18), end_time=_at(d2, 19, 30), description="Template event."),
            models.ScheduleEvent(title=f"{TAG} Venue briefing (time to be confirmed)", description="Template event with no time."),
        ])

        # --- Match Schedule (needs a non-draft tournament, mat + time on each match) ---
        teams = [models.Team(name=f"{TAG} Team {c}", school=f"Template School {c}", country="India") for c in "ABCD"]
        mats = [models.Mat(name=f"{TAG} Mat 1"), models.Mat(name=f"{TAG} Mat 2")]
        t = models.Tournament(name=f"{TAG} Kabaddi — Boys Under 17", sport="Kabaddi", age_group="Under 17", status="active", notes="Template tournament.")
        db.add_all(teams + mats + [t])
        db.flush()
        rnd = models.Round(tournament_id=t.id, name="Round 1", sequence=1)
        db.add(rnd)
        db.flush()
        fixtures = [
            (teams[0], teams[1], mats[0], d1, 10, "SCHEDULED"),
            (teams[2], teams[3], mats[1], d1, 10, "SCHEDULED"),
            (teams[0], teams[2], mats[0], d1, 14, "SCHEDULED"),
            (teams[1], teams[3], mats[1], d2, 10, "SCHEDULED"),
        ]
        for a, b, mat, day, hour, status in fixtures:
            db.add(models.Match(
                tournament_id=t.id, round_id=rnd.id, match_type="KNOCKOUT",
                team_a_id=a.id, team_b_id=b.id, venue_id=arena.id, mat_id=mat.id,
                scheduled_at=_at(day, hour), scheduled_end_at=_at(day, hour, 45), status=status,
            ))

        # --- Announcements ---
        db.add_all([
            models.Announcement(title=f"{TAG} Welcome to the tournament", message="Template announcement — welcome message.", priority="normal", audience="everyone"),
            models.Announcement(title=f"{TAG} Schedule change on Mat 2", message="Template announcement — sample schedule adjustment.", priority="high", audience="everyone"),
            models.Announcement(title=f"{TAG} Dining hall timings", message="Template announcement — sample operational notice.", priority="low", audience="everyone"),
        ])

        # --- Transport ---
        driver = models.Driver(name=f"{TAG} Driver One", phone="+91-90000-00001", notes="Template driver.")
        db.add(driver)
        db.flush()
        bus = models.TransportVehicle(label=f"{TAG} Bus B1", vehicle_type="Bus", capacity=40, driver_id=driver.id, notes="Template vehicle.")
        db.add(bus)
        db.flush()
        db.add(models.TransportAssignment(
            vehicle_id=bus.id, team_id=teams[0].id, pickup_location="Central Railway Station",
            drop_location="Host School Campus", pickup_time=_at(d1, 8), route="Station → Campus", notes="Template assignment.",
        ))

        db.commit()
        print("Template data inserted successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
