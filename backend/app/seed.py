"""Development seed data for Cluster Nationals 2026-27.

=====================================================================
 THIS IS CLEARLY-LABELLED DEVELOPMENT DATA. It does NOT represent real
 event information. Run manually with:  python -m app.seed
=====================================================================
"""
from datetime import datetime, timedelta, timezone

from .database import SessionLocal, engine, Base
from . import models


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(models.Team).count() > 0:
            print("Seed skipped: data already present.")
            return

        # --- Event ---
        db.add(
            models.Event(
                name="Cluster Nationals 2026-27",
                subtitle="[DEV DATA] National Cluster Event",
                location="Host School Campus",
                description="DEVELOPMENT DATA — not a real event description.",
            )
        )

        # --- Teams (DEV) ---
        teams = [
            models.Team(name="[DEV] ABC School", school="ABC School", region="Rajasthan", country="India", member_count=24, contact_name="A. Sharma"),
            models.Team(name="[DEV] Green Valley Academy", school="Green Valley Academy", region="Karnataka", country="India", member_count=18, contact_name="R. Rao"),
            models.Team(name="[DEV] Riyadh International", school="Riyadh International School", region="Riyadh", country="Saudi Arabia", member_count=20, contact_name="M. Al-Fahad"),
            models.Team(name="[DEV] St. Xavier's", school="St. Xavier's", region="Maharashtra", country="India", member_count=22, contact_name="J. Fernandes"),
        ]
        db.add_all(teams)
        db.flush()

        db.add_all([
            models.Participant(team_id=teams[0].id, full_name="[DEV] Player One", role="Captain", age=16),
            models.Participant(team_id=teams[0].id, full_name="[DEV] Player Two", role="Member", age=15),
            models.Coach(team_id=teams[0].id, full_name="[DEV] Coach Kumar", phone="+91-90000-00000"),
            models.Coach(team_id=teams[2].id, full_name="[DEV] Coach Al-Saud", phone="+966-500-000000"),
        ])

        # --- Buildings / Floors / Rooms (DEV) ---
        b1 = models.Building(name="[DEV] Hostel Block A", code="A")
        b2 = models.Building(name="[DEV] Hostel Block B", code="B")
        db.add_all([b1, b2])
        db.flush()
        f1 = models.Floor(building_id=b1.id, name="Ground Floor", level=0)
        f2 = models.Floor(building_id=b1.id, name="First Floor", level=1)
        f3 = models.Floor(building_id=b2.id, name="Ground Floor", level=0)
        db.add_all([f1, f2, f3])
        db.flush()
        rooms = []
        for f in (f1, f2, f3):
            for n in range(1, 6):
                rooms.append(models.Room(floor_id=f.id, name=f"{f.level}0{n}", capacity=6, room_type="Dormitory"))
        db.add_all(rooms)
        db.flush()
        db.add(models.AccommodationAssignment(room_id=rooms[0].id, team_id=teams[0].id, notes="[DEV] sample assignment"))

        # --- Venues (DEV) ---
        db.add_all([
            models.Venue(name="[DEV] Main Arena", venue_type="Sports", capacity=1200, location="Campus North"),
            models.Venue(name="[DEV] Dining Hall 2", venue_type="Dining", capacity=400, location="Campus Center"),
        ])

        # --- Announcements (DEV) ---
        db.add_all([
            models.Announcement(title="[DEV] Welcome to Cluster Nationals", message="Development announcement — welcome message.", priority="normal", audience="everyone"),
            models.Announcement(title="[DEV] Bus B3 delayed by 15 minutes", message="Sample transport update.", priority="high", audience="everyone"),
        ])

        # --- Procurement (DEV) ---
        db.add_all([
            models.ProcurementItem(title="[DEV] Mattresses", category="Procurement", status="Researching", quantity=800, target_unit_price=300, max_budget=240000, currency="INR", owner="Procurement Lead", notes="Obtain a sample before confirming bulk order."),
            models.ProcurementItem(title="[DEV] Disposable serviceware", category="Food", status="Open", quantity=5000, currency="INR", owner="Food Lead"),
        ])

        # --- Knowledge Base (DEV) ---
        db.add_all([
            models.KnowledgeItem(
                title="[DEV] Mattress Procurement",
                category="Procurement",
                status="Discussion",
                description="Temporary accommodation for approximately 800 participants.",
                decision="800 mattresses required, target <= Rs.300/unit.",
                reason="Temporary accommodation for ~800 participants across hostel blocks.",
                owner="Procurement Lead",
                tags="mattress,accommodation,budget",
                notes="Obtain a sample before confirming bulk order.",
            ),
            models.KnowledgeItem(
                title="[DEV] Meal service model",
                category="Food",
                status="Pending",
                description="Deciding room service vs dining hall for ~800 people.",
                reason="Need to consider international guests and consumables.",
                owner="Food Lead",
                tags="food,dining,logistics",
            ),
        ])

        # --- Tasks + Contacts (DEV) ---
        db.add_all([
            models.Task(title="[DEV] Collect 3 mattress quotations", status="in_progress", owner="Procurement Lead"),
            models.Task(title="[DEV] Finalize dining hall layout", status="pending", owner="Food Lead"),
            models.Contact(name="[DEV] Event Control Room", role="Operations", phone="+91-90000-11111", category="Emergency"),
        ])

        db.commit()
        print("Development seed data inserted successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
