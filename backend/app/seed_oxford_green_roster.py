"""One-off import of the Oxford Green Public School (Peepalka, Greater Noida)
U-17 Boys Kabaddi roster, transcribed from the school's own team/delegation
letter (61125.jpeg — 22-Sep-2026, Principal-signed, gitignored: it's a
working scan, not repo content).

Upserts by registration_no (= the letter's "CBSE Player No. (UID)" column,
the same identifier format the national attendance-list importer stores in
Participant.registration_no — see routers/imports.py import_attendance_list),
so re-running this after fixing a transcription typo is safe: it only ever
updates the same 12 rows, never duplicates them.

School-code mismatch (deliberately NOT auto-corrected here — see run()'s
printed report): our Team row for this school already exists with
school_code "60446" / affiliation_number "2130984" (from a national
attendance-list import on 2026-09-21), but this letter, the Google
registration form and the CBSE cluster-results file all agree the school's
code is "61125" — and the letter gives yet another affiliation number,
"2132787". This script matches the EXISTING team defensively on any of
those four values, so it never creates a second, duplicate Team row for the
same school — but it leaves the mismatch itself for a human to resolve
(which number is right is a CBSE-records question, not one this script can
answer).

Run:
    python -m app.seed_oxford_green_roster
    docker compose exec backend python -m app.seed_oxford_green_roster
"""
from datetime import date, datetime

from .database import SessionLocal, engine, Base
from . import models

SCHOOL_CODE = "61125"
AFFILIATION_NO = "2132787"  # as printed on the letter — see the mismatch note above
ALT_SCHOOL_CODE = "60446"          # the code our existing Team row actually has
ALT_AFFILIATION_NO = "2130984"     # ditto, for affiliation_number
SCHOOL_NAME = "OXFORD GREEN PUBLIC SCHOOL, PEEPALKA, GREATER NOIDA"
AGE_GROUP = "Under 17"

# (full_name, father_name, class, dob "DD-MM-YYYY", CBSE UID -> registration_no,
#  CBSE Registration No. -> stored in notes, since there's no dedicated column)
PLAYERS = [
    ("JAIKARAN NAGAR",  "KRISHNA NAGAR",        "IX",  "01-08-2012", "CS24611250002", None),
    ("RITESH KUMAR",    "MAHARAJ SINGH",        "XI",  "08-11-2010", "CS24611250006", "N/1/26/61125/0064"),
    ("AYUSH",           "KARTAR SINGH",         "XI",  "23-02-2012", "CS24611250007", "N/1/26/61125/0040"),
    ("NATICK NAGAR",    "SATENDR NAGAR",        "X",   "17-11-2011", "CS25611250021", "N/1/27/61125/0020"),
    ("HARSHIT NAGAR",   "MANOJ KUMAR NAGAR",    "X",   "24-12-2011", "CS25611250024", "N/1/27/61125/0008"),
    ("KANISHK NAGAR",   "JAI KUMAR",            "XII", "06-12-2010", "CS25611250025", "N/2/27/61125/0091"),
    ("RITIK",           "RAJENDER",             "X",   "01-01-2010", "CS25611250029", "N/1/27/61125/0059"),
    ("DEV NAGAR",       "KARAMJEET SINGH NAGAR","X",   "17-03-2012", "CS25611250030", "N/1/27/61125/0079"),
    ("MUKUL NAGAR",     "KAILASH NAGAR",        "XI",  "09-01-2010", "CS26611250001", None),
    ("KARTIK NAGAR",    "KAPIL KUMAR",          "X",   "01-05-2011", "CS26611250002", "N/1/27/61125/0015"),
    ("TARUN BHATI",     "SONU BHATI",           "X",   "23-11-2010", "CS26611250003", "N/1/27/61125/0103"),
    ("HIMANSHU BHATI",  "JITENDER BHATI",       "X",   "25-09-2012", "CS26611250004", "N/1/27/61125/0009"),
]


def _age(dob: date) -> int:
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        team = (
            db.query(models.Team)
            .filter(
                models.Team.school_code.in_([SCHOOL_CODE, ALT_SCHOOL_CODE])
                | models.Team.affiliation_number.in_([AFFILIATION_NO, ALT_AFFILIATION_NO])
            )
            .first()
        )
        if team is None:
            team = models.Team(
                school_code=SCHOOL_CODE, affiliation_number=AFFILIATION_NO,
                name=SCHOOL_NAME, school=SCHOOL_NAME, region="Uttar Pradesh", country="India",
            )
            db.add(team)
            db.flush()
            print(f"Created new Team #{team.id} (school_code={SCHOOL_CODE}) — no existing match found.")
        else:
            print(
                f"Matched existing Team #{team.id} {team.name!r} "
                f"(school_code={team.school_code}, affiliation_number={team.affiliation_number})."
            )
            if team.school_code != SCHOOL_CODE or team.affiliation_number != AFFILIATION_NO:
                print(
                    f"  NOTE: this letter says school_code={SCHOOL_CODE}, affiliation_number={AFFILIATION_NO} — "
                    f"left the Team row as-is; not auto-corrected (see the module docstring)."
                )

        existing_before = {
            p.registration_no: p
            for p in db.query(models.Participant).filter(models.Participant.team_id == team.id).all()
        }
        if existing_before:
            print(f"  Team already has {len(existing_before)} participant(s) on record before this import:")
            for reg, p in existing_before.items():
                print(f"    {reg or '(no reg no)'}  {p.full_name}")

        created = updated = unchanged = 0
        for full_name, father_name, student_class, dob_s, reg_no, cbse_reg_no in PLAYERS:
            dob = datetime.strptime(dob_s, "%d-%m-%Y").date()
            age = _age(dob)
            notes = f"CBSE Registration No.: {cbse_reg_no}" if cbse_reg_no else None

            participant = existing_before.get(reg_no)
            if participant is None:
                participant = db.query(models.Participant).filter(models.Participant.registration_no == reg_no).first()
            if participant is None:
                db.add(models.Participant(
                    registration_no=reg_no, team_id=team.id, full_name=full_name,
                    gender="Male", age=age, age_group=AGE_GROUP, role="Player",
                    father_name=father_name, date_of_birth=dob, student_class=student_class,
                    notes=notes,
                ))
                created += 1
                continue

            changed = (
                participant.team_id != team.id or participant.full_name != full_name
                or participant.age != age or participant.age_group != AGE_GROUP
                or participant.father_name != father_name or participant.date_of_birth != dob
                or participant.student_class != student_class or participant.notes != notes
            )
            participant.team_id = team.id
            participant.full_name = full_name
            participant.gender = "Male"
            participant.age = age
            participant.age_group = AGE_GROUP
            participant.role = participant.role or "Player"
            participant.father_name = father_name
            participant.date_of_birth = dob
            participant.student_class = student_class
            participant.notes = notes
            if changed:
                updated += 1
            else:
                unchanged += 1

        db.commit()

        total_after = db.query(models.Participant).filter(models.Participant.team_id == team.id).count()
        print(f"\nDone: {created} created, {updated} updated, {unchanged} unchanged.")
        print(f"Team #{team.id} now has {total_after} participant(s) on record "
              f"(member_count on the Team row is {team.member_count}).")
        if existing_before and total_after > len(PLAYERS):
            print(
                "  NOTE: this is more than the 12 names on the letter — the pre-existing roster "
                "above was left in place alongside the new one (see the module docstring / your "
                "assistant's duplication report). Decide whether those are the same 12 boys under "
                "different registration numbers, or a genuinely different squad, before removing anything."
            )
    finally:
        db.close()


if __name__ == "__main__":
    run()
