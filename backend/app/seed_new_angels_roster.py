"""One-off import of NEW ANGELS SR SEC SCHOOL (Katra Road, Pratapgarh, UP)
Kabaddi roster, transcribed from the school's own CBSE Sports System (CSS)
"List of Students applied" printout (2130850.pdf — pulled 20-Sep-2026 9:10
AM, gitignored: it's a working export, not repo content).

Unlike seed_oxford_green_roster.py's letter, this document supplies only
one identifying number for the school — "Affiliation Number & Name of
School: 2130850" — no separate organizer-assigned school_code, so this
script matches/creates the Team on affiliation_number alone and leaves
school_code for the organizer to assign later, same as any other
CBSE-only import.

All 36 rows span three age groups (Under 14/17/19), not one — the "List of
Students applied" table's own AgeGroup column, transcribed per row, not
assumed constant like Oxford Green's single-age-group letter.

Upserts by registration_no (the table's own "Registration No" column,
already in the CS... format Participant.registration_no expects — see
routers/imports.py import_attendance_list), so re-running this after
fixing a transcription typo is safe: it only ever touches these same 36
rows, never duplicates them.

Two pairs of rows are flagged (not silently merged or dropped) because
they share the same father's name + DOB under two different registration
numbers — almost certainly the same student re-applied a season apart
(CS25... vs CS26... prefix), not two different people:
  - CS25711260014? no — CS25711260015 (Abhishek Singh) and
    CS26711260037 (ABHISHEK SINGH), both s/o Arvind Singh, DOB 19-11-2013.
  - CS26711260004 (Abushad) and CS26711260016 (ABU SHAD), both s/o
    Javed Akhtar, DOB 15-03-2014.
Both registration numbers are imported as separate Participant rows
(each is CBSE's own record) — deciding which one, if either, to drop is
an organizer call, not this script's.

Run:
    python -m app.seed_new_angels_roster
    docker compose exec backend python -m app.seed_new_angels_roster
"""
from collections import defaultdict
from datetime import date, datetime

from .database import SessionLocal, engine, Base
from . import models

AFFILIATION_NO = "2130850"
SCHOOL_NAME = "NEW ANGELS SR SEC SCHOOL, KATRA ROAD, PRATAPGARH, UP"

# (registration_no, full_name, father_name, dob "DD-MM-YYYY", age_group) —
# transcribed verbatim from the CSS printout, including its own
# inconsistent name casing.
PLAYERS = [
    ("CS25711260014", "Vedhansh Pratap Singh", "Sachin Kumar Singh", "21-09-2015", "Under 14"),
    ("CS25711260015", "Abhishek Singh", "Arvind singh", "19-11-2013", "Under 14"),
    ("CS26711260002", "mohd umar", "Wajid Ali", "25-02-2012", "Under 17"),
    ("CS26711260004", "Abushad", "Javed akhter", "15-03-2014", "Under 14"),
    ("CS26711260005", "AKASH UPADHYAY", "VIJAY NARAYAN UPADHYAY", "02-03-2008", "Under 19"),
    ("CS26711260006", "PRAGYAN SINGH", "RAJAN KUMAR SINGH", "28-01-2010", "Under 19"),
    ("CS26711260007", "SANATAN MISHRA", "DAYA SHANKAR MISHRA", "29-06-2010", "Under 19"),
    ("CS26711260008", "AYUSH SINGH", "ASHOK SINGH", "06-04-2008", "Under 19"),
    ("CS26711260009", "SHAURYA PRATAP SINGH", "SANJEEV KUMAR SINGH", "15-07-2010", "Under 19"),
    ("CS26711260010", "Ayan Khan", "Taseer ahmed", "24-11-2011", "Under 17"),
    ("CS26711260012", "mh shadan", "mh shadab", "01-01-2010", "Under 17"),
    ("CS26711260013", "Vaibhav pandey", "Manoj Pandey", "22-02-2011", "Under 17"),
    ("CS26711260014", "MOHD SAIF", "SALAUDDIN", "02-07-2014", "Under 14"),
    ("CS26711260015", "GAURAV YADAV", "DEEPAK LAL YADAV", "12-08-2014", "Under 14"),
    ("CS26711260016", "ABU SHAD", "JAVED AKHTAR", "15-03-2014", "Under 14"),
    ("CS26711260017", "AFTAB ALI", "NIYAZ ALI", "09-02-2013", "Under 14"),
    ("CS26711260018", "AYAN GAUTAM", "VISHNU GAUTAM", "14-11-2013", "Under 14"),
    ("CS26711260019", "mohd sadman", "Nurul hasan", "21-01-2013", "Under 14"),
    ("CS26711260020", "mohd Arshad", "Ansar ahmad", "20-05-2011", "Under 17"),
    ("CS26711260021", "MO HAMJA", "MO NAIM", "01-01-2011", "Under 17"),
    ("CS26711260022", "mohd sahil", "mohd kuyyum", "21-04-2012", "Under 17"),
    ("CS26711260024", "JUNAID KHAN", "FIROZ KHAN", "02-03-2012", "Under 17"),
    ("CS26711260025", "ABU UMAIR", "UBAID ULLAH", "27-04-2010", "Under 17"),
    ("CS26711260026", "MO UBAID", "JAVED AKHTAR", "05-06-2011", "Under 19"),
    ("CS26711260027", "ABU HAMZA", "ANISH AHMAD", "20-04-2012", "Under 19"),
    ("CS26711260028", "MOHD AYAN", "SABIT ALI", "02-08-2011", "Under 17"),
    ("CS26711260029", "Aaditya yadav", "Dinesh yadav", "24-02-2009", "Under 19"),
    ("CS26711260030", "Sumit Dubey", "Sunil Dubey", "17-08-2008", "Under 19"),
    ("CS26711260032", "SAHIL KHAN", "SABIR ALI", "01-10-2010", "Under 19"),
    ("CS26711260033", "AJEEM KHAN", "ABDUL HAKEEM", "01-02-2012", "Under 17"),
    ("CS26711260034", "NAITIK SINGH", "RAJ KAMAL SINGH", "06-05-2012", "Under 19"),
    ("CS26711260035", "ABHINANDAN NARAYAN SINGH", "PRADEEP SINGH", "25-10-2013", "Under 14"),
    ("CS26711260036", "SAUBHAGYA SINGH", "HIRENDRA SINGH", "17-03-2013", "Under 14"),
    ("CS26711260037", "ABHISHEK SINGH", "ARVIND SINGH", "19-11-2013", "Under 14"),
    ("CS26711260038", "MOHD ADNAN", "MOHD IRFAN", "05-07-2011", "Under 17"),
    ("CS26711260041", "Shaswat mishra", "sanjay kumar mishra", "28-08-2009", "Under 19"),
]


def _age(dob: date) -> int:
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def run() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        team = db.query(models.Team).filter(models.Team.affiliation_number == AFFILIATION_NO).first()
        if team is None:
            team = models.Team(
                affiliation_number=AFFILIATION_NO,
                name=SCHOOL_NAME, school=SCHOOL_NAME, region="Uttar Pradesh", country="India",
                member_count=len(PLAYERS),
            )
            db.add(team)
            db.flush()
            print(f"Created new Team #{team.id} (affiliation_number={AFFILIATION_NO}).")
        else:
            print(f"Matched existing Team #{team.id} {team.name!r} (affiliation_number={team.affiliation_number}).")

        existing_before = {
            p.registration_no: p
            for p in db.query(models.Participant).filter(models.Participant.team_id == team.id).all()
        }
        if existing_before:
            print(f"  Team already has {len(existing_before)} participant(s) on record before this import:")
            for reg, p in existing_before.items():
                print(f"    {reg or '(no reg no)'}  {p.full_name}")

        created = updated = unchanged = 0
        by_person: dict[tuple[str, date], list[str]] = defaultdict(list)
        for reg_no, full_name, father_name, dob_s, age_group in PLAYERS:
            dob = datetime.strptime(dob_s, "%d-%m-%Y").date()
            age = _age(dob)
            by_person[(father_name.strip().lower(), dob)].append(reg_no)

            participant = existing_before.get(reg_no)
            if participant is None:
                participant = db.query(models.Participant).filter(models.Participant.registration_no == reg_no).first()
            if participant is None:
                db.add(models.Participant(
                    registration_no=reg_no, team_id=team.id, full_name=full_name,
                    gender="Male", age=age, age_group=age_group, role="Player",
                    father_name=father_name, date_of_birth=dob,
                ))
                created += 1
                continue

            changed = (
                participant.team_id != team.id or participant.full_name != full_name
                or participant.age != age or participant.age_group != age_group
                or participant.father_name != father_name or participant.date_of_birth != dob
            )
            participant.team_id = team.id
            participant.full_name = full_name
            participant.gender = "Male"
            participant.age = age
            participant.age_group = age_group
            participant.role = participant.role or "Player"
            participant.father_name = father_name
            participant.date_of_birth = dob
            if changed:
                updated += 1
            else:
                unchanged += 1

        db.commit()

        total_after = db.query(models.Participant).filter(models.Participant.team_id == team.id).count()
        print(f"\nDone: {created} created, {updated} updated, {unchanged} unchanged.")
        print(f"Team #{team.id} now has {total_after} participant(s) on record "
              f"(member_count on the Team row is {team.member_count}).")

        dupes = {k: v for k, v in by_person.items() if len(v) > 1}
        if dupes:
            print(f"\n  NOTE: {len(dupes)} likely duplicate application(s) — same father's name + DOB "
                  f"under different registration numbers (probably the same student re-applied a "
                  f"season apart, not two people). Both were imported as separate participants; "
                  f"decide by hand whether to remove one:")
            for (father, dob), regs in dupes.items():
                print(f"    father={father!r} dob={dob} -> {', '.join(regs)}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
