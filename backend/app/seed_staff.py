"""Populates/updates StaffMember records from app/data/staff.xlsx (two columns:
"Employee Name", "Designation" — Designation is expected to be one of
schemas.STAFF_CATEGORIES).

Unlike app.seed_campus, this is meant to be re-run every time the spreadsheet is
edited — it upserts by name (case/whitespace-insensitive) rather than skipping
existing records outright:
  - name already in the DB  -> category updated if the spreadsheet changed it
  - name not in the DB      -> new StaffMember created
  - DB name missing from the spreadsheet -> left alone and reported, never deleted
    (someone may have added phone/email/notes by hand since; removing people is a
    decision for the organizer to make deliberately, not a side effect of a reseed)

Run after editing the spreadsheet:
    python -m app.seed_staff
    docker compose exec backend python -m app.seed_staff
"""
from pathlib import Path

import pandas as pd

from .database import SessionLocal, engine, Base
from . import models, schemas

XLSX_PATH = Path(__file__).resolve().parent / "data" / "staff.xlsx"


def run() -> None:
    Base.metadata.create_all(bind=engine)

    if not XLSX_PATH.exists():
        print(f"No spreadsheet found at {XLSX_PATH} — nothing to do.")
        return

    df = pd.read_excel(XLSX_PATH)
    df.columns = [str(c).strip() for c in df.columns]
    if "Employee Name" not in df.columns or "Designation" not in df.columns:
        print(f"Expected columns 'Employee Name' and 'Designation', found: {list(df.columns)}")
        return

    known_categories = {c.lower(): c for c in schemas.STAFF_CATEGORIES}

    db = SessionLocal()
    try:
        existing = {s.full_name.strip().lower(): s for s in db.query(models.StaffMember).all()}
        seen = set()
        created = updated = unchanged = 0

        for _, row in df.iterrows():
            name = str(row.get("Employee Name") or "").strip()
            if not name:
                continue
            category = str(row.get("Designation") or "").strip() or None
            if category and category.lower() in known_categories:
                category = known_categories[category.lower()]  # normalize casing
            elif category:
                print(f"Note: '{name}' has an unrecognized category '{category}' (kept as-is).")

            key = name.lower()
            seen.add(key)
            staff = existing.get(key)
            if staff is None:
                db.add(models.StaffMember(full_name=name, category=category))
                created += 1
            elif staff.category != category:
                staff.category = category
                updated += 1
            else:
                unchanged += 1

        db.commit()

        missing = [s.full_name for k, s in existing.items() if k not in seen]
        print(f"Staff sync complete: {created} created, {updated} updated, {unchanged} unchanged.")
        if missing:
            print(f"{len(missing)} existing staff member(s) not present in the spreadsheet (left untouched):")
            for name in missing:
                print(f"  - {name}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
