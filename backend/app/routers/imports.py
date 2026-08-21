"""Bulk import of teams and participants from CSV / XLSX spreadsheets."""
import io

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
