"""Bulk import of teams and participants from CSV / XLSX spreadsheets."""
import io
from datetime import date, datetime

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db

router = APIRouter(prefix="/api/import", tags=["import"])


async def _read_rows(file: UploadFile):
    content = await file.read()
    name = (file.filename or "").lower()
    try:
        if name.endswith(".xlsx") or name.endswith(".xls"):
            df = pd.read_excel(io.BytesIO(content))
        else:
            df = pd.read_csv(io.BytesIO(content))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Could not parse file: {e}")
    df.columns = [str(c).strip().lower() for c in df.columns]
    return df.to_dict("records")


def _val(row: dict, key: str):
    v = row.get(key)
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = str(v).strip()
    return s or None


@router.post("/teams")
async def import_teams(file: UploadFile = File(...), db: Session = Depends(get_db)):
    rows = await _read_rows(file)
    created, skipped, errors = 0, 0, []
    existing = {t.name.lower() for t in db.query(models.Team).all()}
    for i, row in enumerate(rows, start=2):
        name = _val(row, "name")
        if not name:
            errors.append(f"Row {i}: missing 'name'")
            continue
        if name.lower() in existing:
            skipped += 1
            continue
        mc = _val(row, "member_count")
        db.add(models.Team(
            name=name,
            school=_val(row, "school"),
            region=_val(row, "region"),
            country=_val(row, "country") or "India",
            member_count=int(float(mc)) if mc else 0,
        ))
        existing.add(name.lower())
        created += 1
    db.commit()
    return {"entity": "teams", "created": created, "skipped": skipped, "errors": errors}


@router.post("/participants")
async def import_participants(file: UploadFile = File(...), db: Session = Depends(get_db)):
    rows = await _read_rows(file)
    created, skipped, errors = 0, 0, []
    teams = {t.name.lower(): t.id for t in db.query(models.Team).all()}
    for i, row in enumerate(rows, start=2):
        full_name = _val(row, "full_name") or _val(row, "name")
        team_name = _val(row, "team")
        if not full_name or not team_name:
            errors.append(f"Row {i}: needs 'team' and 'full_name'")
            continue
        team_id = teams.get(team_name.lower())
        if not team_id:
            errors.append(f"Row {i}: team '{team_name}' not found")
            skipped += 1
            continue
        age = _val(row, "age")
        db.add(models.Participant(
            team_id=team_id,
            full_name=full_name,
            role=_val(row, "role"),
            gender=_val(row, "gender"),
            age=int(float(age)) if age else None,
        ))
        created += 1
    db.commit()
    return {"entity": "participants", "created": created, "skipped": skipped, "errors": errors}


def _find_col(columns, *prefixes: str) -> "str | None":
    """The school registration form's headers are long, instructional, and
    reworded over time by whoever edits the Google Form (e.g. "Attach a Team
    Photo..." one year, "Attach a Team GROUP Photo..." the next) — matching
    requires every word of a given prefix to appear somewhere in the header
    (as a substring, so "name" still matches the no-space-before-paren
    "Name(For Multiple..." case), not that the header starts with it
    verbatim. A header with an extra word slipped into the middle, like
    "group" here, still matches; only a genuinely different header doesn't."""
    for col in columns:
        low = str(col).strip().lower()
        for p in prefixes:
            if all(word in low for word in p.split()):
                return col
    return None


@router.post("/team-details")
async def import_team_details(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """The school registration form (backend/assets/data/form.xlsx is a sample
    of its shape): one row per school with its school code, coach(es) +
    manager, contact info, and team photo link. Updates the matching Team —
    looked up by school_code first, falling back to affiliation_number for a
    row whose "School Code" cell is actually that school's affiliation
    number instead — and upserts Coach rows tagged role="Coach"/"Manager" —
    re-uploading a corrected sheet is safe, existing rows are only ever
    updated in place, never duplicated or deleted. Multiple coaches/numbers
    are comma-separated in their own cell and paired by position; a coach
    past the last given number is still added, just with no phone captured.

    Deliberately does NOT create a Team for a school code this doesn't
    already know — a team has to exist first (via the attendance-list roster
    import, which is the actual source of truth for who's attending) before
    there's anywhere to attach a coach or photo to. Unrecognized codes are
    reported back instead, so the organizer knows which schools still need
    their roster imported."""
    content = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(content)) if (file.filename or "").lower().endswith((".xlsx", ".xls")) else pd.read_csv(io.BytesIO(content))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Could not parse file: {e}")

    col_school_name = _find_col(df.columns, "school name")
    col_coach_name = _find_col(df.columns, "coach name")
    col_manager_name = _find_col(df.columns, "manager name")
    col_coach_phone = _find_col(df.columns, "contact number of coach")
    col_email = _find_col(df.columns, "email")
    col_photo = _find_col(df.columns, "attach a team photo", "team photo")
    col_school_code = _find_col(df.columns, "school code")
    if not col_school_code:
        raise HTTPException(400, "Missing a 'School Code' column")

    all_teams = db.query(models.Team).all()
    teams_by_code = {t.school_code: t for t in all_teams if t.school_code}
    teams_by_affiliation = {t.affiliation_number: t for t in all_teams if t.affiliation_number}
    teams_updated = 0
    coaches_created = coaches_updated = 0
    photos_added = 0
    unmatched_school_codes: list[dict] = []
    errors: list[str] = []

    for i, row in df.iterrows():
        code = _val(row, col_school_code) if col_school_code else None
        if not code:
            errors.append(f"Row {i + 2}: missing School Code")
            continue

        # Most sheets have this cell hold the school_code we assigned, but
        # some schools instead put their own affiliation number there — try
        # both before giving up on the row.
        team = teams_by_code.get(code) or teams_by_affiliation.get(code)
        if team is None:
            unmatched_school_codes.append({
                "school_code": code,
                "school_name": (_val(row, col_school_name) if col_school_name else None) or "(no name given)",
            })
            continue
        teams_updated += 1

        email = _val(row, col_email) if col_email else None
        if email:
            team.contact_email = email

        # A school's photo cell can list more than one Drive link, comma-separated
        # (same convention as the coach-name cell) — add any not already stored,
        # so a school with several photos ends up with several rows here.
        photo_links = [p.strip() for p in str(_val(row, col_photo) or "").split(",") if p.strip()] if col_photo else []
        existing_photo_urls = {p.url for p in team.photos}
        for link in photo_links:
            if link not in existing_photo_urls:
                db.add(models.TeamPhoto(team_id=team.id, url=link))
                existing_photo_urls.add(link)
                photos_added += 1
        db.flush()

        existing_coaches = {(c.full_name.lower(), c.role): c for c in team.coaches}

        def _upsert_person(name: "str | None", phone: "str | None", role: str):
            nonlocal coaches_created, coaches_updated
            if not name:
                return
            key = (name.lower(), role)
            existing = existing_coaches.get(key)
            if existing:
                if phone and existing.phone != phone:
                    existing.phone = phone
                    coaches_updated += 1
            else:
                c = models.Coach(team_id=team.id, full_name=name, role=role, phone=phone)
                db.add(c)
                existing_coaches[key] = c
                coaches_created += 1

        coach_names = [n.strip() for n in str(_val(row, col_coach_name) or "").split(",") if n.strip()] if col_coach_name else []
        coach_phones = [p.strip() for p in str(_val(row, col_coach_phone) or "").split(",") if p.strip()] if col_coach_phone else []
        for idx, cname in enumerate(coach_names):
            _upsert_person(cname, coach_phones[idx] if idx < len(coach_phones) else None, "Coach")

        manager_name = _val(row, col_manager_name) if col_manager_name else None
        _upsert_person(manager_name, None, "Manager")

    db.commit()
    return {
        "entity": "team-details",
        "teams": {"updated": teams_updated},
        "coaches": {"created": coaches_created, "updated": coaches_updated},
        "photos": {"added": photos_added},
        "unmatched_school_codes": unmatched_school_codes,
        "errors": errors,
    }


REQUIRED_STUDENT_SHEET_COLUMNS = {"schcode", "SchoolName", "registrationNo", "studentname", "gender", "dob"}


def _find_exact_col(columns, *names: str) -> "str | None":
    """This sheet's headers are a stable system export (schcode,
    registrationNo, ...), not a human-reworded Google Form — so match by
    exact name (case/space/underscore-insensitive) rather than _find_col's
    fuzzy word search, which would (and did) miss "affno" entirely when
    searching for "affiliation"."""
    normalized = {str(c).strip().lower().replace(" ", "").replace("_", ""): c for c in columns}
    for n in names:
        key = n.lower().replace(" ", "").replace("_", "")
        if key in normalized:
            return normalized[key]
    return None


def _region_from_address(value) -> "str | None":
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    parts = [p.strip() for p in str(value).split(",")]
    # Addresses end "...,STATE,PINCODE,DISTRICT" — only trust it when the pincode
    # segment actually looks like a pincode, otherwise this is free text we can't parse.
    if len(parts) < 3 or not pd.Series([parts[-2]]).str.fullmatch(r"\d{5,6}").iloc[0]:
        return None
    return parts[-3] or None


def _age_from_dob(value) -> "int | None":
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    dob = None
    if isinstance(value, (datetime, date)):
        dob = value if isinstance(value, date) and not isinstance(value, datetime) else value.date()
    else:
        dob = pd.to_datetime(str(value).strip(), format="%d-%m-%Y", errors="coerce")
        dob = dob.date() if dob is not None and not pd.isna(dob) else None
    if dob is None:
        return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


@router.post("/attendance-list")
async def import_attendance_list(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload the raw school attendance list export — just the single 'Sheet' tab of
    one row per student (schcode, SchoolName, registrationNo, studentname, gender, dob,
    Address, ...). Teams are derived by grouping students by schcode (school name = the
    most common spelling seen for that code, member_count = male students found for it
    — matching the fact that only Male students are imported as participants — region =
    best-effort parsed from the address's state segment, affiliation number = read from
    whichever column has "affiliation" in its name, if the sheet has one at all) and
    upserted by school_code; Participants are upserted by registration_no. Re-uploading
    a newer export is safe — existing rows are only ever updated, never deleted, so
    adding a new team or adding more players to an existing one just adds what's new.

    Only Male students are imported as participants.
    """
    content = await file.read()
    try:
        sheet = pd.read_excel(io.BytesIO(content), sheet_name="Sheet")
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Could not read this file — expected a 'Sheet' tab of one row per student: {e}")

    sheet.columns = [str(c).strip() for c in sheet.columns]
    if not REQUIRED_STUDENT_SHEET_COLUMNS.issubset(sheet.columns):
        raise HTTPException(400, f"'Sheet' is missing expected columns: {REQUIRED_STUDENT_SHEET_COLUMNS - set(sheet.columns)}")

    sheet["schcode"] = sheet["schcode"].astype(str).str.strip()
    col_affiliation = _find_exact_col(sheet.columns, "affno", "affiliationno", "affiliationnumber")

    # ---------- Teams, derived from Sheet and upserted by school_code ----------
    teams_by_code = {t.school_code: t for t in db.query(models.Team).filter(models.Team.school_code.isnot(None)).all()}
    teams_created = teams_updated = 0
    for code, group in sheet.groupby("schcode"):
        if not code:
            continue
        names = group["SchoolName"].astype(str).str.strip()
        names = names[names != ""]
        if names.empty:
            continue
        school_name = names.mode().iloc[0]  # most common spelling for this schcode
        member_count = int((group["gender"].astype(str).str.strip().str.lower() == "male").sum())
        region = None
        for addr in group.get("Address", pd.Series(dtype=object)).dropna():
            region = _region_from_address(addr)
            if region:
                break
        affiliation_number = None
        if col_affiliation:
            for val in group[col_affiliation].dropna():
                v = str(val).strip()
                if v.endswith(".0"):  # pandas reads an all-numeric column as float64 when any row is blank
                    v = v[:-2]
                if v:
                    affiliation_number = v
                    break

        team = teams_by_code.get(code)
        if team is None:
            team = models.Team(
                school_code=code, name=school_name, school=school_name, region=region, country="India",
                member_count=member_count, affiliation_number=affiliation_number,
            )
            db.add(team)
            teams_by_code[code] = team
            teams_created += 1
        else:
            changed = (team.name != school_name or team.school != school_name or team.member_count != member_count
                       or (region and team.region != region)
                       or (affiliation_number and team.affiliation_number != affiliation_number))
            team.name = school_name
            team.school = school_name
            team.member_count = member_count
            if region:
                team.region = region  # only overwrite if this upload actually parsed one
            if affiliation_number:
                team.affiliation_number = affiliation_number
            if changed:
                teams_updated += 1
    db.flush()  # assign ids to newly-added teams before participants reference them

    # ---------- Participants (male only), upserted by registration_no ----------
    male_rows = sheet[sheet["gender"].astype(str).str.strip().str.lower() == "male"]
    skipped_female = len(sheet) - len(male_rows)

    existing_by_reg = {p.registration_no: p for p in db.query(models.Participant).filter(models.Participant.registration_no.isnot(None)).all()}
    participants_created = participants_updated = 0
    errors: list[str] = []

    for i, row in male_rows.iterrows():
        reg_no = _val(row, "registrationNo")
        full_name = _val(row, "studentname")
        code = _val(row, "schcode")
        if not reg_no or not full_name:
            errors.append(f"Row {i + 2}: missing registrationNo or studentname")
            continue
        team = teams_by_code.get(code)
        if not team:
            errors.append(f"Row {i + 2}: unknown school code '{code}'")
            continue

        age = _age_from_dob(row.get("dob"))
        age_group = _val(row, "agegroup")
        participant = existing_by_reg.get(reg_no)
        if participant is None:
            participant = models.Participant(
                registration_no=reg_no, team_id=team.id, full_name=full_name,
                gender="Male", age=age, age_group=age_group, role="Player",
            )
            db.add(participant)
            existing_by_reg[reg_no] = participant
            participants_created += 1
        else:
            changed = (participant.team_id != team.id or participant.full_name != full_name
                       or participant.age != age or participant.age_group != age_group)
            participant.team_id = team.id
            participant.full_name = full_name
            participant.age = age
            participant.age_group = age_group
            if changed:
                participants_updated += 1

    db.commit()
    return {
        "entity": "attendance-list",
        "teams": {"created": teams_created, "updated": teams_updated},
        "participants": {"created": participants_created, "updated": participants_updated, "skipped_female": int(skipped_female)},
        "errors": errors,
    }
