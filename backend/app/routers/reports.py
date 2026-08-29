"""Match reports — a per-round snapshot the organizer explicitly generates and
can hand off (fixtures, scores, byes, format), plus a live full-tournament
workbook. See models.Report's docstring for why per-round reports are
persisted (survive the round being deleted later) while the full-tournament
one isn't (it spans every round, so there's no single round to snapshot it
against)."""
import io
from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db

router = APIRouter(prefix="/api", tags=["reports"])

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _round_format(round_: models.Round) -> str:
    if round_.format:
        return round_.format
    sample = round_.matches[0] if round_.matches else None
    return (sample.match_type if sample else None) or "KNOCKOUT"


def _report_rows(round_: models.Round) -> tuple[list[dict], str]:
    """One row per match, in a round's report — byes shown as a real row
    ("— BYE —" opponent) rather than silently missing, pending matches show
    blank scores instead of erroring. League rounds group naturally by pool
    (sorted so a pool's matches stay together); a Knockout round has no pool
    column at all, not just an all-blank one."""
    fmt = _round_format(round_)
    is_league = fmt == "LEAGUE"
    matches = sorted(round_.matches, key=lambda m: ((m.pool.name if m.pool else ""), m.id))
    rows = []
    for m in matches:
        is_bye = m.notes == "Bye"
        row = {}
        if is_league:
            row["Pool"] = m.pool.name if m.pool else ""
        row["Team A"] = m.team_a.name if m.team_a else "TBD"
        row["Score A"] = m.team_a_score if (not is_bye and m.team_a_id and m.status == "COMPLETED") else ""
        row["Team B"] = "— BYE —" if is_bye else (m.team_b.name if m.team_b else "TBD")
        row["Score B"] = m.team_b_score if (not is_bye and m.team_b_id and m.status == "COMPLETED") else ""
        row["Winner"] = m.winner_team.name if m.winner_team_id else ""
        row["Status"] = "Bye" if is_bye else m.status
        rows.append(row)
    return rows, fmt


def _round_sheet_bytes(round_: models.Round, tournament: models.Tournament) -> bytes:
    """Renders exactly one round into a one-sheet .xlsx (used for a per-round
    report). For the multi-round full-tournament workbook, callers instead
    write each round's rows directly into their own sheet of one shared
    ExcelWriter — see build_full_workbook below — rather than concatenating
    single-sheet files."""
    rows, fmt = _report_rows(round_)
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df = pd.DataFrame(rows)
        df.to_excel(writer, sheet_name=_safe_sheet_name(round_.name), index=False, startrow=3)
        ws = writer.sheets[_safe_sheet_name(round_.name)]
        ws["A1"] = f"{tournament.name} — {round_.name}"
        ws["A2"] = f"Format: {'League' if fmt == 'LEAGUE' else 'Knockout'}"
    buf.seek(0)
    return buf.getvalue()


def _safe_sheet_name(name: str) -> str:
    """Excel sheet names: max 31 chars, no : \\ / ? * [ ]."""
    cleaned = "".join(c for c in name if c not in ':\\/?*[]')
    return cleaned[:31] or "Round"


def _build_full_workbook(tournament: models.Tournament) -> bytes:
    rounds = sorted(tournament.rounds, key=lambda r: r.sequence)
    buf = io.BytesIO()
    used_names: set[str] = set()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        if not rounds:
            pd.DataFrame([{"Note": "No rounds yet"}]).to_excel(writer, sheet_name="Sheet1", index=False)
        for r in rounds:
            rows, fmt = _report_rows(r)
            sheet_name = _safe_sheet_name(r.name)
            base, i = sheet_name, 2
            while sheet_name in used_names:
                suffix = f" ({i})"
                sheet_name = base[: 31 - len(suffix)] + suffix
                i += 1
            used_names.add(sheet_name)
            df = pd.DataFrame(rows)
            df.to_excel(writer, sheet_name=sheet_name, index=False, startrow=3)
            ws = writer.sheets[sheet_name]
            ws["A1"] = f"{tournament.name} — {r.name}"
            ws["A2"] = f"Format: {'League' if fmt == 'LEAGUE' else 'Knockout'}"
    buf.seek(0)
    return buf.getvalue()


def _report_dict(r: models.Report) -> dict:
    return {
        "id": r.id,
        "tournament_id": r.tournament_id,
        "round_id": r.round_id,
        "round_name": r.round_name,
        "round_sequence": r.round_sequence,
        "format": r.format,
        "generated_at": r.generated_at.isoformat(),
    }


@router.post("/tournaments/{tournament_id}/rounds/{round_id}/reports", status_code=201)
def generate_round_report(tournament_id: int, round_id: int, db: Session = Depends(get_db)):
    t = db.get(models.Tournament, tournament_id)
    if not t:
        raise HTTPException(404, "Tournament not found")
    r = db.get(models.Round, round_id)
    if not r or r.tournament_id != tournament_id:
        raise HTTPException(404, "Round not found for this tournament")

    file_bytes = _round_sheet_bytes(r, t)
    report = models.Report(
        tournament_id=tournament_id,
        round_id=round_id,
        round_name=r.name,
        round_sequence=r.sequence,
        format=_round_format(r),
        file_data=file_bytes,
        generated_at=datetime.now(timezone.utc),
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return _report_dict(report)


@router.get("/tournaments/{tournament_id}/reports")
def list_reports(tournament_id: int, db: Session = Depends(get_db)):
    if not db.get(models.Tournament, tournament_id):
        raise HTTPException(404, "Tournament not found")
    reports = (
        db.query(models.Report)
        .filter(models.Report.tournament_id == tournament_id)
        .order_by(models.Report.generated_at.desc())
        .all()
    )
    return [_report_dict(r) for r in reports]


@router.get("/reports/{report_id}/download")
def download_report(report_id: int, db: Session = Depends(get_db)):
    r = db.get(models.Report, report_id)
    if not r:
        raise HTTPException(404, "Report not found")
    filename = f"{_safe_sheet_name(r.round_name)}_report.xlsx"
    return StreamingResponse(
        iter([r.file_data]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/reports/{report_id}", status_code=204)
def delete_report(report_id: int, db: Session = Depends(get_db)):
    r = db.get(models.Report, report_id)
    if not r:
        return
    db.delete(r)
    db.commit()


@router.get("/reports/tournaments/{tournament_id}/full.xlsx")
def download_full_report(tournament_id: int, db: Session = Depends(get_db)):
    t = db.get(models.Tournament, tournament_id)
    if not t:
        raise HTTPException(404, "Tournament not found")
    file_bytes = _build_full_workbook(t)
    filename = f"{_safe_sheet_name(t.name)}_full_report.xlsx"
    return StreamingResponse(
        iter([file_bytes]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
