"""Spreadsheet (CSV & Executive XLSX) exports for room allocation and participant lists."""
import csv
import io
import itertools
import zipfile

import openpyxl
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import id_card, models
from ..database import get_db
from ..excel_styler import (
    ALIGN_CENTER,
    ALIGN_HEADER_CENTER,
    ALIGN_HEADER_LEFT,
    ALIGN_LEFT,
    BORDER_CELL,
    BORDER_HEADER,
    CLR_AMBER_BG,
    FILL_TH_PRIMARY,
    FILL_ZEBRA_EVEN,
    FILL_ZEBRA_ODD,
    FONT_TD,
    FONT_TD_BOLD,
    FONT_TH,
    auto_fit_columns,
    enable_sheet_ergonomics,
    style_footer,
    style_header_banner,
    style_kpi_cards,
    style_section_bar,
)
from openpyxl.styles import PatternFill
from ..security import require_admin, require_auth, require_module
from .payments import _billed_keys, _present_members
from .public import ASSETS_PARTICIPANTS_DIR

router = APIRouter(prefix="/api/export", tags=["export"])

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PDF_MEDIA_TYPE = "application/pdf"


def _csv_response(header, rows, filename):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/participants.csv", dependencies=[Depends(require_module("teams"))])
def export_participants(db: Session = Depends(get_db)):
    teams = {t.id: t.name for t in db.query(models.Team).all()}
    rows = [
        [p.full_name, teams.get(p.team_id, ""), p.role or "", p.gender or "", p.age or ""]
        for p in db.query(models.Participant).order_by(models.Participant.team_id, models.Participant.full_name).all()
    ]
    return _csv_response(["Full Name", "Team", "Role", "Gender", "Age"], rows, "participants.csv")


@router.get("/participants.xlsx", dependencies=[Depends(require_module("teams"))])
def export_participants_xlsx(db: Session = Depends(get_db)):
    teams = {t.id: t.name for t in db.query(models.Team).all()}
    participants = db.query(models.Participant).order_by(models.Participant.team_id, models.Participant.full_name).all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Participants Roster"
    max_cols = 6

    # Header Banner
    next_row = style_header_banner(
        ws,
        tournament_name="PARTICIPANTS & DELEGATE DIRECTORY",
        subtitle="Official Roster of Registered Athletes, Coaches & Staff",
        badge_text="OFFICIAL ROSTER EXPORT",
        max_col=max_cols,
        start_row=1,
    )

    # KPI Summary Cards
    total_p = len(participants)
    unique_teams_count = len({p.team_id for p in participants if p.team_id})
    players_count = sum(1 for p in participants if (p.role or "").lower() in ("player", "athlete", "student"))
    staff_count = total_p - players_count

    cards = [
        ("Total Participants", total_p, "Registered"),
        ("Teams Represented", unique_teams_count, "Affiliated Clubs"),
        ("Athletes / Players", players_count if players_count > 0 else total_p, "Competitors"),
        ("Staff / Coaches", staff_count if players_count > 0 else "—", "Officials"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)

    # Table Section
    next_row = style_section_bar(ws, "Master Participant List", next_row, max_col=max_cols, icon="👥")

    headers = [
        ("NO.", 6, ALIGN_HEADER_CENTER),
        ("FULL NAME", 26, ALIGN_HEADER_LEFT),
        ("TEAM AFFILIATION", 24, ALIGN_HEADER_LEFT),
        ("ROLE", 14, ALIGN_HEADER_CENTER),
        ("GENDER", 10, ALIGN_HEADER_CENTER),
        ("AGE", 8, ALIGN_HEADER_CENTER),
    ]

    ws.row_dimensions[next_row].height = 22
    for col_idx, (th_label, _, align) in enumerate(headers, start=1):
        cell = ws.cell(row=next_row, column=col_idx, value=th_label)
        cell.font = FONT_TH
        cell.fill = FILL_TH_PRIMARY
        cell.alignment = align
        cell.border = BORDER_HEADER
    next_row += 1

    for idx, p in enumerate(participants, start=1):
        ws.row_dimensions[next_row].height = 20
        fill = FILL_ZEBRA_EVEN if idx % 2 == 0 else FILL_ZEBRA_ODD

        row_data = [
            (idx, ALIGN_CENTER, FONT_TD_BOLD),
            (p.full_name, ALIGN_LEFT, FONT_TD_BOLD),
            (teams.get(p.team_id, "—"), ALIGN_LEFT, FONT_TD),
            (p.role or "Player", ALIGN_CENTER, FONT_TD),
            (p.gender or "—", ALIGN_CENTER, FONT_TD),
            (p.age or "—", ALIGN_CENTER, FONT_TD),
        ]

        for col_idx, (val, align, font) in enumerate(row_data, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_row += 1

    ws.row_dimensions[next_row].height = 12
    next_row += 1
    style_footer(ws, next_row, max_col=max_cols)

    auto_fit_columns(ws, min_width=8, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws, freeze_pane="A7")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="participants_roster.xlsx"'},
    )


@router.get("/rooms.csv", dependencies=[Depends(require_module("accommodation"))])
def export_room_allocation(db: Session = Depends(get_db)):
    participant_counts = dict(
        db.query(models.Participant.team_id, func.count(models.Participant.id))
        .group_by(models.Participant.team_id)
        .all()
    )
    participant_present_counts = dict(
        db.query(models.Participant.team_id, func.count(models.Participant.id))
        .filter(models.Participant.is_present.is_(True))
        .group_by(models.Participant.team_id)
        .all()
    )
    rows = []
    for a in db.query(models.AccommodationAssignment).all():
        room = a.room
        floor = room.floor if room else None
        building = floor.building if floor else None
        participant = db.get(models.Participant, a.participant_id) if a.participant_id else None
        rows.append([
            building.name if building else "",
            floor.name if floor else "",
            room.name if room else "",
            a.bed.label if a.bed else "",
            participant.full_name if participant else "(whole team)",
            a.team.name if a.team else "",
            participant_counts.get(a.team_id, 0) if a.team_id else "",
            participant_present_counts.get(a.team_id, 0) if a.team_id else "",
        ])
    return _csv_response(
        ["Building", "Floor", "Room", "Bed", "Occupant", "Team", "Allotted", "Filled"], rows, "room-allocation.csv"
    )


@router.get("/rooms.xlsx", dependencies=[Depends(require_module("accommodation"))])
def export_room_allocation_xlsx(db: Session = Depends(get_db)):
    assignments = db.query(models.AccommodationAssignment).all()
    # Allotted = that assignment's team's total registered participants;
    # Filled = how many of those are actually checked in (Participant.
    # is_present) — lets an organizer see at a glance whether a room's team
    # has actually arrived versus just being on paper allotted to it.
    participant_counts = dict(
        db.query(models.Participant.team_id, func.count(models.Participant.id))
        .group_by(models.Participant.team_id)
        .all()
    )
    participant_present_counts = dict(
        db.query(models.Participant.team_id, func.count(models.Participant.id))
        .filter(models.Participant.is_present.is_(True))
        .group_by(models.Participant.team_id)
        .all()
    )

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Room Allocations"
    max_cols = 8

    next_row = style_header_banner(
        ws,
        tournament_name="ACCOMMODATION & ROOM ALLOCATION",
        subtitle="Building, Floor, Room, Bed & Assigned Occupant Details",
        badge_text="OFFICIAL ALLOCATION EXPORT",
        max_col=max_cols,
        start_row=1,
    )

    total_assignments = len(assignments)
    unique_buildings = len({a.room.floor.building_id for a in assignments if a.room and a.room.floor and a.room.floor.building_id})
    unique_rooms = len({a.room_id for a in assignments if a.room_id})
    individual_beds = sum(1 for a in assignments if a.bed_id is not None)

    cards = [
        ("Total Allocations", total_assignments, "Active Stays"),
        ("Buildings Utilized", unique_buildings, "Hostel Blocks"),
        ("Rooms Assigned", unique_rooms, "Occupied Rooms"),
        ("Bed Assignments", individual_beds, "Specific Beds"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)

    next_row = style_section_bar(ws, "Master Room Allocation Schedule", next_row, max_col=max_cols, icon="🛏️")

    headers = [
        ("BUILDING", 20, ALIGN_HEADER_LEFT),
        ("FLOOR", 16, ALIGN_HEADER_LEFT),
        ("ROOM", 14, ALIGN_HEADER_CENTER),
        ("BED LABEL", 14, ALIGN_HEADER_CENTER),
        ("OCCUPANT NAME", 24, ALIGN_HEADER_LEFT),
        ("TEAM AFFILIATION", 24, ALIGN_HEADER_LEFT),
        ("ALLOTTED", 12, ALIGN_HEADER_CENTER),
        ("FILLED", 12, ALIGN_HEADER_CENTER),
    ]

    ws.row_dimensions[next_row].height = 22
    for col_idx, (th_label, _, align) in enumerate(headers, start=1):
        cell = ws.cell(row=next_row, column=col_idx, value=th_label)
        cell.font = FONT_TH
        cell.fill = FILL_TH_PRIMARY
        cell.alignment = align
        cell.border = BORDER_HEADER
    next_row += 1

    for idx, a in enumerate(assignments, start=1):
        ws.row_dimensions[next_row].height = 20
        room = a.room
        floor = room.floor if room else None
        building = floor.building if floor else None
        participant = db.get(models.Participant, a.participant_id) if a.participant_id else None

        fill = FILL_ZEBRA_EVEN if idx % 2 == 0 else FILL_ZEBRA_ODD
        allotted = participant_counts.get(a.team_id, 0) if a.team_id else 0
        filled = participant_present_counts.get(a.team_id, 0) if a.team_id else 0

        row_data = [
            (building.name if building else "—", ALIGN_LEFT, FONT_TD_BOLD),
            (floor.name if floor else "—", ALIGN_LEFT, FONT_TD),
            (room.name if room else "—", ALIGN_CENTER, FONT_TD_BOLD),
            (a.bed.label if a.bed else "(Any Bed)", ALIGN_CENTER, FONT_TD),
            (participant.full_name if participant else "(Whole Team)", ALIGN_LEFT, FONT_TD_BOLD),
            (a.team.name if a.team else "—", ALIGN_LEFT, FONT_TD),
            (allotted if a.team_id else "—", ALIGN_CENTER, FONT_TD),
            (filled if a.team_id else "—", ALIGN_CENTER, FONT_TD_BOLD),
        ]

        for col_idx, (val, align, font) in enumerate(row_data, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_row += 1

    ws.row_dimensions[next_row].height = 12
    next_row += 1
    style_footer(ws, next_row, max_col=max_cols)

    auto_fit_columns(ws, min_width=8, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws, freeze_pane="A7")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="room_allocations.xlsx"'},
    )


@router.get("/attendance.xlsx", dependencies=[Depends(require_module("attendance"))])
def export_attendance_xlsx(db: Session = Depends(get_db)):
    teams = {t.id: t.name for t in db.query(models.Team).all()}
    participants = (
        db.query(models.Participant)
        .order_by(models.Participant.age_group, models.Participant.team_id, models.Participant.full_name)
        .all()
    )

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Attendance"
    max_cols = 6

    next_row = style_header_banner(
        ws,
        tournament_name="SQUAD ATTENDANCE REPORT",
        subtitle="Check-in Status for Every Registered Participant",
        badge_text="OFFICIAL ATTENDANCE EXPORT",
        max_col=max_cols,
        start_row=1,
    )

    total_p = len(participants)
    present_p = sum(1 for p in participants if p.is_present)
    absent_p = total_p - present_p
    rate = f"{round(100 * present_p / total_p)}%" if total_p else "—"

    cards = [
        ("Total Participants", total_p, "Registered"),
        ("Present", present_p, "Checked In"),
        ("Absent", absent_p, "Not Checked In"),
        ("Attendance Rate", rate, "Present / Total"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)

    next_row = style_section_bar(ws, "Participant Attendance", next_row, max_col=max_cols, icon="✅")

    headers = [
        ("TEAM", 24, ALIGN_HEADER_LEFT),
        ("AGE GROUP", 14, ALIGN_HEADER_CENTER),
        ("PARTICIPANT NAME", 24, ALIGN_HEADER_LEFT),
        ("REG. NO.", 14, ALIGN_HEADER_CENTER),
        ("ROLE", 14, ALIGN_HEADER_CENTER),
        ("PRESENT", 12, ALIGN_HEADER_CENTER),
    ]

    ws.row_dimensions[next_row].height = 22
    for col_idx, (th_label, _, align) in enumerate(headers, start=1):
        cell = ws.cell(row=next_row, column=col_idx, value=th_label)
        cell.font = FONT_TH
        cell.fill = FILL_TH_PRIMARY
        cell.alignment = align
        cell.border = BORDER_HEADER
    next_row += 1

    for idx, p in enumerate(participants, start=1):
        ws.row_dimensions[next_row].height = 20
        fill = FILL_ZEBRA_EVEN if idx % 2 == 0 else FILL_ZEBRA_ODD

        row_data = [
            (teams.get(p.team_id, "—"), ALIGN_LEFT, FONT_TD_BOLD),
            (p.age_group or "—", ALIGN_CENTER, FONT_TD),
            (p.full_name, ALIGN_LEFT, FONT_TD_BOLD),
            (p.registration_no or "—", ALIGN_CENTER, FONT_TD),
            (p.role or "Player", ALIGN_CENTER, FONT_TD),
            ("PRESENT" if p.is_present else "ABSENT", ALIGN_CENTER, FONT_TD_BOLD),
        ]

        for col_idx, (val, align, font) in enumerate(row_data, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_row += 1

    ws.row_dimensions[next_row].height = 12
    next_row += 1
    style_footer(ws, next_row, max_col=max_cols)

    auto_fit_columns(ws, min_width=8, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws, freeze_pane="A7")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="attendance_report.xlsx"'},
    )


def _billed_member_counts(team: models.Team) -> tuple[int, int, int]:
    """(registered, total-present, billed) for the arrival report's R/T/B
    column: Registered = every participant+coach on the roster regardless of
    check-in; Total = how many of those are actually present (the billable
    pool — payments.py's _present_members); Billed = how many of THAT pool
    a BILL has already charged for (payments.py's _billed_keys) — the exact
    definition the Bill dialog's own "present but not yet billed" diff
    already uses, not a second notion of "billed" invented here."""
    registered = len(team.participants) + len(team.coaches)
    present = _present_members(team)
    billed_keys = _billed_keys(team)
    billed = sum(1 for m in present if (m["kind"], m["id"]) in billed_keys)
    return registered, len(present), billed


def _pending_processes(team: models.Team, participant_total: int, participant_present: int, coach_total: int, coach_present: int) -> list[str]:
    """What's still incomplete for a team that has already arrived (see
    export_arrival_xlsx) — the checklist an on-site organizer actually cares
    about once a delegation is on campus: has it been billed and settled,
    and is everyone (athletes + coaches/managers) checked in. Same
    BILL/PAYMENT/REFUND math as payments.py's _totals, computed here off
    the already-loaded team.payments relationship rather than importing that
    router's private helper for one sum."""
    total_billed = sum(p.amount for p in team.payments if p.kind == "BILL")
    total_paid = sum(p.amount for p in team.payments if p.kind == "PAYMENT")
    billing_pending = total_billed == 0 or (total_billed - total_paid) > 0

    pending = []
    if billing_pending:
        pending.append("Billing & Payment")
    if participant_total > 0 and participant_present < participant_total:
        pending.append("Participant Attendance")
    if coach_total > 0 and coach_present < coach_total:
        pending.append("Coach Attendance")
    return pending


# Flags an arrival-report row whose registered count exceeds its billed
# count — someone on the roster hasn't been charged for yet.
FILL_ROW_UNBILLED = PatternFill("solid", fgColor=CLR_AMBER_BG)


@router.get("/arrival.xlsx", dependencies=[Depends(require_module("teams"))])
def export_arrival_xlsx(db: Session = Depends(get_db)):
    teams = db.query(models.Team).order_by(models.Team.name).all()
    participant_counts = dict(
        db.query(models.Participant.team_id, func.count(models.Participant.id))
        .group_by(models.Participant.team_id)
        .all()
    )
    participant_present_counts = dict(
        db.query(models.Participant.team_id, func.count(models.Participant.id))
        .filter(models.Participant.is_present.is_(True))
        .group_by(models.Participant.team_id)
        .all()
    )
    coach_counts = dict(
        db.query(models.Coach.team_id, func.count(models.Coach.id))
        .group_by(models.Coach.team_id)
        .all()
    )
    coach_present_counts = dict(
        db.query(models.Coach.team_id, func.count(models.Coach.id))
        .filter(models.Coach.is_present.is_(True))
        .group_by(models.Coach.team_id)
        .all()
    )

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Arrival Status"
    max_cols = 5

    next_row = style_header_banner(
        ws,
        tournament_name="TEAM ARRIVAL REPORT",
        subtitle="Delegation Arrival Status & Post-Arrival Checklist for Every Registered School",
        badge_text="OFFICIAL ARRIVAL EXPORT",
        max_col=max_cols,
        start_row=1,
    )

    total_t = len(teams)
    arrived_t = sum(1 for t in teams if t.has_arrived)
    not_arrived_t = total_t - arrived_t
    rate = f"{round(100 * arrived_t / total_t)}%" if total_t else "—"
    pending_t = sum(
        1
        for t in teams
        if t.has_arrived
        and _pending_processes(
            t,
            participant_counts.get(t.id, 0),
            participant_present_counts.get(t.id, 0),
            coach_counts.get(t.id, 0),
            coach_present_counts.get(t.id, 0),
        )
    )

    cards = [
        ("Total Teams", total_t, "Registered Schools"),
        ("Arrived", arrived_t, "Checked In"),
        ("Not Arrived", not_arrived_t, "Pending"),
        ("Arrival Rate", rate, "Arrived / Total"),
        ("Arrived, Pending", pending_t, "Billing / Attendance Not Done"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)

    next_row = style_section_bar(ws, "Delegation Arrival Status", next_row, max_col=max_cols, icon="🚌")

    headers = [
        ("SCHOOL CODE", 14, ALIGN_HEADER_CENTER),
        ("SCHOOL / TEAM", 30, ALIGN_HEADER_LEFT),
        ("ARRIVED", 12, ALIGN_HEADER_CENTER),
        ("PENDING PROCESSES", 34, ALIGN_HEADER_LEFT),
        ("R/T/B (REG./TOTAL/BILLED)", 20, ALIGN_HEADER_CENTER),
    ]

    ws.row_dimensions[next_row].height = 22
    for col_idx, (th_label, _, align) in enumerate(headers, start=1):
        cell = ws.cell(row=next_row, column=col_idx, value=th_label)
        cell.font = FONT_TH
        cell.fill = FILL_TH_PRIMARY
        cell.alignment = align
        cell.border = BORDER_HEADER
    next_row += 1

    for idx, t in enumerate(teams, start=1):
        ws.row_dimensions[next_row].height = 20

        if t.has_arrived:
            pending = _pending_processes(
                t,
                participant_counts.get(t.id, 0),
                participant_present_counts.get(t.id, 0),
                coach_counts.get(t.id, 0),
                coach_present_counts.get(t.id, 0),
            )
            pending_label = ", ".join(pending) if pending else "All Clear"
        else:
            pending_label = "—"  # hasn't arrived yet — nothing to check off

        registered, total_members, billed = _billed_member_counts(t)
        # Flags the row whenever someone registered hasn't been billed yet —
        # overrides the plain zebra stripe since this is the one condition
        # on this sheet an organizer actually needs to spot at a glance.
        fill = FILL_ROW_UNBILLED if registered > billed else (FILL_ZEBRA_EVEN if idx % 2 == 0 else FILL_ZEBRA_ODD)

        row_data = [
            (t.school_code or "—", ALIGN_CENTER, FONT_TD),
            (t.name, ALIGN_LEFT, FONT_TD_BOLD),
            ("ARRIVED" if t.has_arrived else "NOT ARRIVED", ALIGN_CENTER, FONT_TD_BOLD),
            (pending_label, ALIGN_LEFT, FONT_TD_BOLD if pending_label not in ("All Clear", "—") else FONT_TD),
            (f"{registered}/{total_members}/{billed}", ALIGN_CENTER, FONT_TD),
        ]

        for col_idx, (val, align, font) in enumerate(row_data, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_row += 1

    ws.row_dimensions[next_row].height = 12
    next_row += 1
    style_footer(ws, next_row, max_col=max_cols)

    auto_fit_columns(ws, min_width=8, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws, freeze_pane="A7")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="arrival_report.xlsx"'},
    )


def _has_view(current: models.OrganizerUser, module_key: str) -> bool:
    if current.is_admin:
        return True
    return (current.permissions or {}).get(module_key) in ("view", "edit")


@router.get("/live-summary")
def live_reports_summary(current: models.OrganizerUser = Depends(require_auth), db: Session = Depends(get_db)):
    """Backs the Live Reports page (frontend Reports.tsx) — the on-screen,
    auto-refreshing counterpart to the Excel/PDF downloads above. One
    endpoint rather than one per section purely to keep the page's polling
    to a single request; each section is still gated by the exact same
    module permission its download card already uses (schemas.ORGANIZER_
    MODULES), server-side, so a section this account can't download also
    never appears here — the frontend isn't trusted to hide what it
    shouldn't fetch in the first place."""
    summary: dict = {}

    if _has_view(current, "attendance") or _has_view(current, "teams"):
        participants_total = db.query(func.count(models.Participant.id)).scalar() or 0
        participants_present = (
            db.query(func.count(models.Participant.id)).filter(models.Participant.is_present.is_(True)).scalar() or 0
        )
        coaches_total = db.query(func.count(models.Coach.id)).scalar() or 0
        coaches_present = (
            db.query(func.count(models.Coach.id)).filter(models.Coach.is_present.is_(True)).scalar() or 0
        )
        summary["attendance"] = {
            "participants_total": participants_total,
            "participants_present": participants_present,
            "coaches_total": coaches_total,
            "coaches_present": coaches_present,
        }

    if _has_view(current, "teams"):
        teams = db.query(models.Team).all()
        participant_counts = dict(
            db.query(models.Participant.team_id, func.count(models.Participant.id))
            .group_by(models.Participant.team_id)
            .all()
        )
        participant_present_counts = dict(
            db.query(models.Participant.team_id, func.count(models.Participant.id))
            .filter(models.Participant.is_present.is_(True))
            .group_by(models.Participant.team_id)
            .all()
        )
        coach_counts = dict(
            db.query(models.Coach.team_id, func.count(models.Coach.id)).group_by(models.Coach.team_id).all()
        )
        coach_present_counts = dict(
            db.query(models.Coach.team_id, func.count(models.Coach.id))
            .filter(models.Coach.is_present.is_(True))
            .group_by(models.Coach.team_id)
            .all()
        )
        arrived = [t for t in teams if t.has_arrived]
        pending_teams = []
        for t in arrived:
            pending = _pending_processes(
                t,
                participant_counts.get(t.id, 0),
                participant_present_counts.get(t.id, 0),
                coach_counts.get(t.id, 0),
                coach_present_counts.get(t.id, 0),
            )
            if pending:
                pending_teams.append({"team_id": t.id, "name": t.name, "pending": pending})
        summary["arrival"] = {
            "teams_total": len(teams),
            "arrived": len(arrived),
            "not_arrived": len(teams) - len(arrived),
            "pending_teams": pending_teams,
        }

        total_billed = sum(p.amount for t in teams for p in t.payments if p.kind == "BILL")
        total_paid = sum(p.amount for t in teams for p in t.payments if p.kind == "PAYMENT")
        total_refunded = sum(p.amount for t in teams for p in t.payments if p.kind == "REFUND")
        summary["billing"] = {
            "total_billed": total_billed,
            "total_paid": total_paid,
            "total_refunded": total_refunded,
            "balance_due": total_billed - total_paid,
            "net_collected": total_paid - total_refunded,
        }

    if _has_view(current, "staff"):
        staff = db.query(models.StaffMember).all()
        with_duty = sum(1 for s in staff if s.duties)
        summary["duty"] = {
            "staff_total": len(staff),
            "staff_with_duty": with_duty,
            "staff_without_duty": len(staff) - with_duty,
            "duty_assignments_total": db.query(func.count(models.DutyAssignment.id)).scalar() or 0,
        }

    if _has_view(current, "accommodation"):
        rooms = db.query(models.Room).all()
        total_capacity = sum(r.capacity or 0 for r in rooms)
        assignments = db.query(models.AccommodationAssignment).all()
        beds_occupied = sum(1 for a in assignments if a.bed_id is not None)
        summary["accommodation"] = {
            "rooms_total": len(rooms),
            "total_capacity": total_capacity,
            "beds_occupied": beds_occupied,
            "assignments_total": len(assignments),
        }

    if _has_view(current, "matches"):
        rows = (
            db.query(models.Match.tournament_id, models.Match.status, func.count(models.Match.id))
            .group_by(models.Match.tournament_id, models.Match.status)
            .all()
        )
        by_tournament: dict[int, dict[str, int]] = {}
        for tid, status, count in rows:
            by_tournament.setdefault(tid, {})[status] = count
        tournaments = db.query(models.Tournament).order_by(models.Tournament.name).all()
        summary["tournaments"] = [
            {
                "id": t.id,
                "name": t.name,
                "age_group": t.age_group,
                "matches_total": sum(by_tournament.get(t.id, {}).values()),
                "matches_completed": by_tournament.get(t.id, {}).get("COMPLETED", 0),
                "matches_live": by_tournament.get(t.id, {}).get("ONGOING", 0) + by_tournament.get(t.id, {}).get("PAUSED", 0),
                "matches_scheduled": by_tournament.get(t.id, {}).get("SCHEDULED", 0),
            }
            for t in tournaments
        ]

    if current.is_admin:
        accounts = db.query(models.OrganizerUser).all()
        summary["accounts"] = {
            "total": len(accounts),
            "active": sum(1 for a in accounts if a.is_active),
            "admins": sum(1 for a in accounts if a.is_admin),
        }

    return summary


_LIVE_DETAIL_MODULES = {
    "attendance": "attendance",
    "arrival": "teams",
    "billing": "teams",
    "duty": "staff",
    "matches": "matches",
    "accommodation": "accommodation",
    "accounts": None,  # admin-only, checked separately below
}


@router.get("/live-detail/{section}")
def live_report_detail(
    section: str, current: models.OrganizerUser = Depends(require_auth), db: Session = Depends(get_db)
):
    """The full row-by-row data behind one Live Reports card (see
    live_reports_summary above) — same numbers, just the underlying sheet
    instead of the rolled-up stat, for the "click a card to see everything"
    view in Reports.tsx. Deliberately its own on-demand endpoint rather than
    folded into live-summary: that one gets polled every 20s and returning
    every participant/match/account row on every poll would be wasteful —
    this only runs when someone actually opens a card's detail dialog.
    Returns {"columns": [...], "rows": [[...], ...]} — a generic shape the
    frontend renders with one plain <table>, no per-section UI needed."""
    if section not in _LIVE_DETAIL_MODULES:
        raise HTTPException(404, "Unknown report section")
    module_key = _LIVE_DETAIL_MODULES[section]
    if module_key is None:
        if not current.is_admin:
            raise HTTPException(403, "Admin access required")
    elif not _has_view(current, module_key) and not (section == "attendance" and _has_view(current, "teams")):
        raise HTTPException(403, "You don't have view access to this section")

    if section == "attendance":
        teams = {t.id: t.name for t in db.query(models.Team).all()}
        participants = (
            db.query(models.Participant)
            .order_by(models.Participant.age_group, models.Participant.team_id, models.Participant.full_name)
            .all()
        )
        return {
            "columns": ["Team", "Age Group", "Participant Name", "Reg. No.", "Role", "Present"],
            "rows": [
                [
                    teams.get(p.team_id, "—"),
                    p.age_group or "—",
                    p.full_name,
                    p.registration_no or "—",
                    p.role or "Player",
                    "Present" if p.is_present else "Absent",
                ]
                for p in participants
            ],
        }

    if section == "arrival":
        teams = db.query(models.Team).order_by(models.Team.name).all()
        participant_counts = dict(
            db.query(models.Participant.team_id, func.count(models.Participant.id))
            .group_by(models.Participant.team_id)
            .all()
        )
        participant_present_counts = dict(
            db.query(models.Participant.team_id, func.count(models.Participant.id))
            .filter(models.Participant.is_present.is_(True))
            .group_by(models.Participant.team_id)
            .all()
        )
        coach_counts = dict(
            db.query(models.Coach.team_id, func.count(models.Coach.id)).group_by(models.Coach.team_id).all()
        )
        coach_present_counts = dict(
            db.query(models.Coach.team_id, func.count(models.Coach.id))
            .filter(models.Coach.is_present.is_(True))
            .group_by(models.Coach.team_id)
            .all()
        )
        rows = []
        row_flags = []
        for t in teams:
            if t.has_arrived:
                pending = _pending_processes(
                    t,
                    participant_counts.get(t.id, 0),
                    participant_present_counts.get(t.id, 0),
                    coach_counts.get(t.id, 0),
                    coach_present_counts.get(t.id, 0),
                )
                pending_label = ", ".join(pending) if pending else "All Clear"
            else:
                pending_label = "—"
            registered, total_members, billed = _billed_member_counts(t)
            rows.append([
                t.school_code or "—",
                t.name,
                "Arrived" if t.has_arrived else "Not Arrived",
                pending_label,
                f"{registered}/{total_members}/{billed}",
            ])
            row_flags.append(registered > billed)
        return {
            "columns": ["School Code", "School / Team", "Arrived", "Pending Processes", "R/T/B (Reg./Total/Billed)"],
            "rows": rows,
            "row_flags": row_flags,
        }

    if section == "billing":
        teams = db.query(models.Team).order_by(models.Team.name).all()
        rows = []
        for t in teams:
            bills = [p for p in t.payments if p.kind == "BILL"]
            pays = [p for p in t.payments if p.kind == "PAYMENT"]
            refunds = [p for p in t.payments if p.kind == "REFUND"]
            if not bills and not pays and not refunds:
                continue
            billed = sum(p.amount for p in bills)
            paid = sum(p.amount for p in pays)
            refunded = sum(p.amount for p in refunds)
            rows.append([
                t.name,
                t.school_code or "—",
                billed,
                paid,
                billed - paid,
                refunded,
                paid - refunded,
            ])
        return {
            "columns": [
                "School / Team", "School Code", "Total Billed (Rs.)", "Total Paid (Rs.)",
                "Balance Due (Rs.)", "Total Refunded (Rs.)", "Net Collected (Rs.)",
            ],
            "rows": rows,
        }

    if section == "duty":
        duties = db.query(models.DutyAssignment).order_by(models.DutyAssignment.start_time.asc().nullslast()).all()
        rows = []
        for a in duties:
            room = a.room
            floor = room.floor if room else None
            building = floor.building if floor else None
            rows.append([
                a.staff.full_name if a.staff else "—",
                a.staff.category if a.staff else "—",
                a.duty_type,
                building.name if building else "—",
                room.name if room else "—",
                a.start_time.strftime("%d-%b %H:%M") if a.start_time else "—",
                a.end_time.strftime("%d-%b %H:%M") if a.end_time else "—",
            ])
        return {
            "columns": ["Staff Name", "Category", "Duty Type", "Building", "Room", "Start", "End"],
            "rows": rows,
        }

    if section == "matches":
        matches = (
            db.query(models.Match)
            .order_by(models.Match.tournament_id, models.Match.round_id, models.Match.id)
            .all()
        )
        return {
            "columns": ["Tournament", "Round", "Team A", "Team B", "Status", "Score", "Mat", "Scheduled"],
            "rows": [
                [
                    m.tournament.name if m.tournament else "—",
                    m.round.name if m.round else "—",
                    m.team_a.name if m.team_a else "TBD",
                    m.team_b.name if m.team_b else "TBD",
                    m.status,
                    f"{m.team_a_score} - {m.team_b_score}",
                    m.mat.name if m.mat else "—",
                    m.scheduled_at.strftime("%d-%b %H:%M") if m.scheduled_at else "—",
                ]
                for m in matches
            ],
        }

    if section == "accommodation":
        assignments = db.query(models.AccommodationAssignment).all()
        participant_counts = dict(
            db.query(models.Participant.team_id, func.count(models.Participant.id))
            .group_by(models.Participant.team_id)
            .all()
        )
        participant_present_counts = dict(
            db.query(models.Participant.team_id, func.count(models.Participant.id))
            .filter(models.Participant.is_present.is_(True))
            .group_by(models.Participant.team_id)
            .all()
        )
        rows = []
        for a in assignments:
            room = a.room
            floor = room.floor if room else None
            building = floor.building if floor else None
            participant = db.get(models.Participant, a.participant_id) if a.participant_id else None
            rows.append([
                building.name if building else "—",
                floor.name if floor else "—",
                room.name if room else "—",
                a.bed.label if a.bed else "(Any Bed)",
                participant.full_name if participant else "(Whole Team)",
                a.team.name if a.team else "—",
                participant_counts.get(a.team_id, 0) if a.team_id else "—",
                participant_present_counts.get(a.team_id, 0) if a.team_id else "—",
            ])
        return {
            "columns": ["Building", "Floor", "Room", "Bed Label", "Occupant Name", "Team Affiliation", "Allotted", "Filled"],
            "rows": rows,
        }

    # section == "accounts" (admin-only, checked above)
    users = db.query(models.OrganizerUser).order_by(models.OrganizerUser.username).all()
    rows = []
    for u in users:
        perms_display = (
            "All Modules (Admin)"
            if u.is_admin
            else (", ".join(f"{k}: {v}" for k, v in (u.permissions or {}).items()) or "—")
        )
        staff_display = ", ".join(s.full_name for s in u.staff_members) or "—"
        rows.append([
            u.username,
            u.full_name or "—",
            "Admin" if u.is_admin else "Staff",
            "Active" if u.is_active else "Inactive",
            perms_display,
            staff_display,
        ])
    return {
        "columns": ["Username", "Full Name", "Role", "Status", "Module Permissions", "Linked Staff"],
        "rows": rows,
    }


@router.get("/duties.xlsx", dependencies=[Depends(require_module("staff"))])
def export_duties_xlsx(db: Session = Depends(get_db)):
    duties = db.query(models.DutyAssignment).order_by(models.DutyAssignment.start_time.asc().nullslast()).all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Duty Roster"
    max_cols = 7

    next_row = style_header_banner(
        ws,
        tournament_name="STAFF DUTY REPORT",
        subtitle="Duty Assignments Across Every Building, Floor & Room",
        badge_text="OFFICIAL DUTY ROSTER EXPORT",
        max_col=max_cols,
        start_row=1,
    )

    total_d = len(duties)
    unique_staff = len({d.staff_id for d in duties})
    unique_duty_types = len({d.duty_type for d in duties if d.duty_type})
    unique_buildings = len({d.room.floor.building_id for d in duties if d.room and d.room.floor and d.room.floor.building_id})

    cards = [
        ("Total Assignments", total_d, "Duty Slots"),
        ("Staff Assigned", unique_staff, "Individuals"),
        ("Duty Types", unique_duty_types, "Categories"),
        ("Buildings Covered", unique_buildings, "Locations"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)

    next_row = style_section_bar(ws, "Duty Roster", next_row, max_col=max_cols, icon="🛡️")

    headers = [
        ("STAFF NAME", 24, ALIGN_HEADER_LEFT),
        ("CATEGORY", 20, ALIGN_HEADER_LEFT),
        ("DUTY TYPE", 16, ALIGN_HEADER_CENTER),
        ("BUILDING", 18, ALIGN_HEADER_LEFT),
        ("ROOM", 14, ALIGN_HEADER_CENTER),
        ("START", 16, ALIGN_HEADER_CENTER),
        ("END", 16, ALIGN_HEADER_CENTER),
    ]

    ws.row_dimensions[next_row].height = 22
    for col_idx, (th_label, _, align) in enumerate(headers, start=1):
        cell = ws.cell(row=next_row, column=col_idx, value=th_label)
        cell.font = FONT_TH
        cell.fill = FILL_TH_PRIMARY
        cell.alignment = align
        cell.border = BORDER_HEADER
    next_row += 1

    for idx, d in enumerate(duties, start=1):
        ws.row_dimensions[next_row].height = 20
        fill = FILL_ZEBRA_EVEN if idx % 2 == 0 else FILL_ZEBRA_ODD
        room = d.room
        floor = room.floor if room else None
        building = floor.building if floor else None

        row_data = [
            (d.staff.full_name if d.staff else "—", ALIGN_LEFT, FONT_TD_BOLD),
            (d.staff.category if d.staff else "—", ALIGN_LEFT, FONT_TD),
            (d.duty_type or "—", ALIGN_CENTER, FONT_TD),
            (building.name if building else "—", ALIGN_LEFT, FONT_TD),
            (room.name if room else "—", ALIGN_CENTER, FONT_TD),
            (d.start_time.strftime("%d %b %Y %H:%M") if d.start_time else "—", ALIGN_CENTER, FONT_TD),
            (d.end_time.strftime("%d %b %Y %H:%M") if d.end_time else "—", ALIGN_CENTER, FONT_TD),
        ]

        for col_idx, (val, align, font) in enumerate(row_data, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_row += 1

    ws.row_dimensions[next_row].height = 12
    next_row += 1
    style_footer(ws, next_row, max_col=max_cols)

    auto_fit_columns(ws, min_width=8, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws, freeze_pane="A7")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="duty_report.xlsx"'},
    )


@router.get("/organizer-users.xlsx", dependencies=[Depends(require_admin)])
def export_organizer_users_xlsx(db: Session = Depends(get_db)):
    users = db.query(models.OrganizerUser).order_by(models.OrganizerUser.username).all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Organizer Accounts"
    max_cols = 6

    next_row = style_header_banner(
        ws,
        tournament_name="ORGANIZER PORTAL USER REPORT",
        subtitle="Every Admin-Portal Login, Role & Module Permissions",
        badge_text="CONFIDENTIAL — ADMIN ONLY",
        max_col=max_cols,
        start_row=1,
    )

    total_u = len(users)
    admin_u = sum(1 for u in users if u.is_admin)
    active_u = sum(1 for u in users if u.is_active)
    inactive_u = total_u - active_u

    cards = [
        ("Total Accounts", total_u, "Organizer Logins"),
        ("Admins", admin_u, "Full Access"),
        ("Active", active_u, "Enabled"),
        ("Inactive", inactive_u, "Disabled"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)

    next_row = style_section_bar(ws, "Organizer Portal Accounts", next_row, max_col=max_cols, icon="🔐")

    headers = [
        ("USERNAME", 20, ALIGN_HEADER_LEFT),
        ("FULL NAME", 22, ALIGN_HEADER_LEFT),
        ("ROLE", 14, ALIGN_HEADER_CENTER),
        ("STATUS", 12, ALIGN_HEADER_CENTER),
        ("MODULE PERMISSIONS", 40, ALIGN_HEADER_LEFT),
        ("LINKED STAFF", 24, ALIGN_HEADER_LEFT),
    ]

    ws.row_dimensions[next_row].height = 22
    for col_idx, (th_label, _, align) in enumerate(headers, start=1):
        cell = ws.cell(row=next_row, column=col_idx, value=th_label)
        cell.font = FONT_TH
        cell.fill = FILL_TH_PRIMARY
        cell.alignment = align
        cell.border = BORDER_HEADER
    next_row += 1

    for idx, u in enumerate(users, start=1):
        ws.row_dimensions[next_row].height = 20
        fill = FILL_ZEBRA_EVEN if idx % 2 == 0 else FILL_ZEBRA_ODD

        if u.is_admin:
            perms_display = "ALL MODULES (Admin)"
        else:
            perms_display = ", ".join(f"{k}: {v}" for k, v in (u.permissions or {}).items()) or "—"
        staff_display = ", ".join(s.full_name for s in u.staff_members) or "—"

        row_data = [
            (u.username, ALIGN_LEFT, FONT_TD_BOLD),
            (u.full_name or "—", ALIGN_LEFT, FONT_TD),
            ("Admin" if u.is_admin else "Staff", ALIGN_CENTER, FONT_TD_BOLD),
            ("ACTIVE" if u.is_active else "INACTIVE", ALIGN_CENTER, FONT_TD_BOLD),
            (perms_display, ALIGN_LEFT, FONT_TD),
            (staff_display, ALIGN_LEFT, FONT_TD),
        ]

        for col_idx, (val, align, font) in enumerate(row_data, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_row += 1

    ws.row_dimensions[next_row].height = 12
    next_row += 1
    style_footer(ws, next_row, max_col=max_cols)

    auto_fit_columns(ws, min_width=8, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws, freeze_pane="A7")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="organizer_users_report.xlsx"'},
    )


def _pdf_response(content: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        iter([content]),
        media_type=PDF_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _zip_response(files: list[tuple[str, bytes]], filename: str) -> StreamingResponse:
    """Bundles multiple standalone files (e.g. one PDF per ID card) into a
    single ZIP download — for the individual-cards exports, where each card
    needs to stay its own file so a print operator can pick/place them one
    at a time in layout software, rather than a flattened multi-card sheet."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in files:
            zf.writestr(name, content)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _photo_path(participant: models.Participant):
    if not participant.photo_filename:
        return None
    return ASSETS_PARTICIPANTS_DIR / participant.photo_filename


def _idcard_filename(participant: models.Participant) -> str:
    """One card's file name inside an individual-cards ZIP — registration_no
    when available (stable/unique, matches the single-participant download's
    naming), falling back to the DB id, plus the athlete's name for a
    human-readable listing in the layout tool's file picker."""
    slug = "".join(c if c.isalnum() or c in " -_" else "_" for c in participant.full_name).strip() or "participant"
    return f"{participant.registration_no or participant.id}_{slug}.pdf"


def _individual_card_files(participants: list[models.Participant], team_by_id: dict[int, models.Team]) -> list[tuple[str, bytes]]:
    """Renders each participant's card as its own standalone one-page PDF
    (same render_id_card_page + build_pdf pairing the single-participant
    download already uses — full physical card size, no sheet grid), for
    bundling into an individual-cards ZIP."""
    files: list[tuple[str, bytes]] = []
    seen_names: dict[str, int] = {}
    for p in sorted(participants, key=id_card.sort_key):
        team = team_by_id[p.team_id]
        card = id_card.render_id_card_page(p, team, _photo_path(p))
        pdf = id_card.build_pdf([card])
        name = _idcard_filename(p)
        # Guard against a name collision (e.g. two participants sharing a
        # blank registration_no) silently overwriting one card in the zip.
        if name in seen_names:
            seen_names[name] += 1
            stem, _, ext = name.rpartition(".")
            name = f"{stem}_{seen_names[name]}.{ext}"
        else:
            seen_names[name] = 0
        files.append((name, pdf))
    return files


def _team_card_groups(participants: list[models.Participant], team: models.Team) -> list:
    """Renders one team's cards, grouped by age group in print order — each
    group must start its own fresh sheet page (see id_card.build_pdf_sheets),
    a sheet never mixing age groups even if that leaves the previous group's
    last sheet partially empty. `participants` is sorted by id_card.sort_key
    first (age group, then name), so same-age-group participants are already
    contiguous and a plain itertools.groupby is enough to split on that
    boundary. Returns a list of card-image lists (one per age group), the
    `card_groups` shape build_pdf_sheets expects — resizing each card to the
    sheet's cell size happens there, at whatever layout/dpi is requested, not
    here, since this rendering step is layout-independent."""
    ordered = sorted(participants, key=id_card.sort_key)
    groups: list = []
    for _age_group, group_iter in itertools.groupby(ordered, key=lambda p: p.age_group):
        group = list(group_iter)
        groups.append([id_card.render_id_card(p, team, _photo_path(p)) for p in group])
    return groups


@router.get("/idcards/participant/{participant_id}.pdf", dependencies=[Depends(require_module("teams"))])
def export_idcard_participant(participant_id: int, db: Session = Depends(get_db)):
    participant = db.get(models.Participant, participant_id)
    if not participant:
        raise HTTPException(404, "Participant not found")
    card = id_card.render_id_card_page(participant, participant.team, _photo_path(participant))
    pdf = id_card.build_pdf([card])
    return _pdf_response(pdf, f"idcard-{participant.registration_no or participant.id}.pdf")


@router.get("/idcards/team/{team_id}.pdf", dependencies=[Depends(require_module("teams"))])
def export_idcard_team(team_id: int, db: Session = Depends(get_db)):
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    if not team.participants:
        raise HTTPException(404, "This team has no participants to generate cards for")
    groups = _team_card_groups(team.participants, team)
    pdf = id_card.build_pdf_sheets(groups, layout=id_card.A4_SHEET, dpi=id_card.PRINT_DPI)
    return _pdf_response(pdf, f"idcards-{team.school_code or team.id}.pdf")


@router.get("/idcards/team/{team_id}/sheet-12x18.pdf", dependencies=[Depends(require_module("teams"))])
def export_idcard_team_12x18(team_id: int, db: Session = Depends(get_db)):
    """Same per-team card set as /idcards/team/{id}.pdf, laid out on 12x18in
    print-shop stock instead of A4 (id_card.SHEET_12X18) — 16 cards/sheet
    instead of 9, for shops printing larger runs on bigger paper."""
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    if not team.participants:
        raise HTTPException(404, "This team has no participants to generate cards for")
    groups = _team_card_groups(team.participants, team)
    pdf = id_card.build_pdf_sheets(groups, layout=id_card.SHEET_12X18, dpi=id_card.PRINT_DPI)
    return _pdf_response(pdf, f"idcards-{team.school_code or team.id}-12x18.pdf")


@router.get("/idcards/team/{team_id}/individual.zip", dependencies=[Depends(require_module("teams"))])
def export_idcard_team_individual(team_id: int, db: Session = Depends(get_db)):
    """Same per-team card set as /idcards/team/{id}.pdf, but as a ZIP of one
    standalone PDF per card instead of a flattened sheet — for print/design
    software (CorelDRAW, Illustrator, InDesign, ...) where cards are picked
    and placed individually onto a custom layout rather than printed as-is."""
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    if not team.participants:
        raise HTTPException(404, "This team has no participants to generate cards for")
    files = _individual_card_files(team.participants, {team.id: team})
    return _zip_response(files, f"idcards-{team.school_code or team.id}-individual.zip")


@router.get("/idcards/all.pdf", dependencies=[Depends(require_module("teams"))])
def export_idcard_all(db: Session = Depends(get_db)):
    teams = {t.id: t for t in db.query(models.Team).all()}
    participants = (
        db.query(models.Participant)
        .order_by(models.Participant.team_id)
        .all()
    )
    if not participants:
        raise HTTPException(404, "No participants to generate cards for")
    # Lower DPI here only — this bulk export is a reference/backup document,
    # not what you'd feed a badge printer for 1000+ cards at once (use the
    # per-team download for that); see id_card.BULK_PRINT_DPI.
    dpi = id_card.BULK_PRINT_DPI
    groups: list = []
    current_team_id = None
    current_team_group: list = []

    def _flush():
        if not current_team_group:
            return
        groups.extend(_team_card_groups(current_team_group, teams[current_team_id]))

    for p in participants:
        if p.team_id != current_team_id:
            _flush()
            current_team_id = p.team_id
            current_team_group = []
        current_team_group.append(p)
    _flush()
    pdf = id_card.build_pdf_sheets(groups, layout=id_card.A4_SHEET, dpi=dpi)
    return _pdf_response(pdf, "idcards-all-teams.pdf")


@router.get("/idcards/all/individual.zip", dependencies=[Depends(require_module("teams"))])
def export_idcard_all_individual(db: Session = Depends(get_db)):
    """Same roster as /idcards/all.pdf, but as a ZIP of one standalone PDF
    per card instead of flattened sheets — see export_idcard_team_individual.
    Every card is rendered at full id_card.PRINT_DPI (unlike the sheet
    version's reduced BULK_PRINT_DPI): each card is now its own small file
    rather than being pasted into one giant multi-page PDF, so there's no
    longer a single-file size ceiling forcing a DPI compromise."""
    teams = {t.id: t for t in db.query(models.Team).all()}
    participants = db.query(models.Participant).order_by(models.Participant.team_id).all()
    if not participants:
        raise HTTPException(404, "No participants to generate cards for")
    files = _individual_card_files(participants, teams)
    return _zip_response(files, "idcards-all-teams-individual.zip")


@router.get("/payments.xlsx", dependencies=[Depends(require_module("teams"))])
def export_payments_xlsx(db: Session = Depends(get_db)):
    """Per-team registration-fee ledger — total billed, total paid (split
    Cash vs UPI), balance due, total refunded (split Cash vs UPI), net
    collected, and the most recent date of each transaction kind — one row
    per team that has at least one payment record. Individual transactions
    live in the Organizer Portal's Bill/Payment/Refund dialog
    (routers/payments.py) and in the Transaction Detail sheet below; this
    sheet is the roll-up for finance tracking."""
    teams = db.query(models.Team).order_by(models.Team.name).all()
    rows = []
    for t in teams:
        bills = [p for p in t.payments if p.kind == "BILL"]
        pays = [p for p in t.payments if p.kind == "PAYMENT"]
        refunds = [p for p in t.payments if p.kind == "REFUND"]
        if not bills and not pays and not refunds:
            continue
        billed = sum(p.amount for p in bills)
        paid_cash = sum(p.amount for p in pays if p.payment_mode == "Cash")
        paid_upi = sum(p.amount for p in pays if p.payment_mode == "UPI")
        paid = paid_cash + paid_upi
        refunded_cash = sum(p.amount for p in refunds if p.payment_mode == "Cash")
        refunded_upi = sum(p.amount for p in refunds if p.payment_mode == "UPI")
        refunded = refunded_cash + refunded_upi
        rows.append({
            "team": t, "billed": billed, "paid": paid, "paid_cash": paid_cash, "paid_upi": paid_upi,
            "refunded": refunded, "refunded_cash": refunded_cash, "refunded_upi": refunded_upi,
            "balance_due": billed - paid, "net_collected": paid - refunded,
            "last_bill": max((p.payment_date for p in bills), default=None),
            "last_payment": max((p.payment_date for p in pays), default=None),
            "last_refund": max((p.payment_date for p in refunds), default=None),
            "transaction_count": len(t.payments),
        })

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Payments Ledger"
    max_cols = 15

    next_row = style_header_banner(
        ws,
        tournament_name="REGISTRATION FEE LEDGER",
        subtitle="Per-Team Billing, Payments, Refunds & Net Collection",
        badge_text="OFFICIAL FINANCE EXPORT",
        max_col=max_cols,
        start_row=1,
    )

    total_billed = sum(r["billed"] for r in rows)
    total_paid = sum(r["paid"] for r in rows)
    total_refunded = sum(r["refunded"] for r in rows)
    cards = [
        ("Teams Billed", len(rows), "With Transactions"),
        ("Total Billed", f"Rs. {total_billed:,}", "Invoiced"),
        ("Total Paid", f"Rs. {total_paid:,}", "Received"),
        ("Net Collected", f"Rs. {total_paid - total_refunded:,}", "Paid − Refunded"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)

    next_row = style_section_bar(ws, "Team-Wise Ledger", next_row, max_col=max_cols, icon="💰")

    headers = [
        ("SCHOOL / TEAM", 30, ALIGN_HEADER_LEFT),
        ("SCHOOL CODE", 14, ALIGN_HEADER_CENTER),
        ("TOTAL BILLED (RS.)", 16, ALIGN_HEADER_CENTER),
        ("TOTAL PAID (RS.)", 16, ALIGN_HEADER_CENTER),
        ("PAID · CASH (RS.)", 15, ALIGN_HEADER_CENTER),
        ("PAID · UPI (RS.)", 15, ALIGN_HEADER_CENTER),
        ("BALANCE DUE (RS.)", 16, ALIGN_HEADER_CENTER),
        ("TOTAL REFUNDED (RS.)", 16, ALIGN_HEADER_CENTER),
        ("REFUNDED · CASH (RS.)", 17, ALIGN_HEADER_CENTER),
        ("REFUNDED · UPI (RS.)", 17, ALIGN_HEADER_CENTER),
        ("NET COLLECTED (RS.)", 16, ALIGN_HEADER_CENTER),
        ("LAST BILL DATE", 16, ALIGN_HEADER_CENTER),
        ("LAST PAYMENT DATE", 16, ALIGN_HEADER_CENTER),
        ("LAST REFUND DATE", 16, ALIGN_HEADER_CENTER),
        ("TRANSACTIONS", 14, ALIGN_HEADER_CENTER),
    ]

    ws.row_dimensions[next_row].height = 22
    for col_idx, (th_label, _, align) in enumerate(headers, start=1):
        cell = ws.cell(row=next_row, column=col_idx, value=th_label)
        cell.font = FONT_TH
        cell.fill = FILL_TH_PRIMARY
        cell.alignment = align
        cell.border = BORDER_HEADER
    next_row += 1

    def _fmt_date(d):
        return d.strftime("%d-%b-%Y") if d else "—"

    for idx, r in enumerate(rows, start=1):
        ws.row_dimensions[next_row].height = 20
        fill = FILL_ZEBRA_EVEN if idx % 2 == 0 else FILL_ZEBRA_ODD

        row_data = [
            (r["team"].name, ALIGN_LEFT, FONT_TD_BOLD),
            (r["team"].school_code or "—", ALIGN_CENTER, FONT_TD),
            (r["billed"], ALIGN_CENTER, FONT_TD),
            (r["paid"], ALIGN_CENTER, FONT_TD),
            (r["paid_cash"], ALIGN_CENTER, FONT_TD),
            (r["paid_upi"], ALIGN_CENTER, FONT_TD),
            (r["balance_due"], ALIGN_CENTER, FONT_TD_BOLD),
            (r["refunded"], ALIGN_CENTER, FONT_TD),
            (r["refunded_cash"], ALIGN_CENTER, FONT_TD),
            (r["refunded_upi"], ALIGN_CENTER, FONT_TD),
            (r["net_collected"], ALIGN_CENTER, FONT_TD_BOLD),
            (_fmt_date(r["last_bill"]), ALIGN_CENTER, FONT_TD),
            (_fmt_date(r["last_payment"]), ALIGN_CENTER, FONT_TD),
            (_fmt_date(r["last_refund"]), ALIGN_CENTER, FONT_TD),
            (r["transaction_count"], ALIGN_CENTER, FONT_TD),
        ]

        for col_idx, (val, align, font) in enumerate(row_data, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_row += 1

    ws.row_dimensions[next_row].height = 12
    next_row += 1
    style_footer(ws, next_row, max_col=max_cols)

    auto_fit_columns(ws, min_width=8, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws, freeze_pane="A7")

    # ---------- Second sheet: every transaction as its own dated row ----------
    ws2 = wb.create_sheet("Transaction Detail")
    max_cols2 = 8

    next_row2 = style_header_banner(
        ws2,
        tournament_name="TRANSACTION DETAIL",
        subtitle="Every Bill, Payment & Refund, One Row Each",
        badge_text="OFFICIAL FINANCE EXPORT",
        max_col=max_cols2,
        start_row=1,
    )
    next_row2 = style_section_bar(ws2, "All Transactions (Chronological, Per Team)", next_row2, max_col=max_cols2, icon="🧾")

    headers2 = [
        ("SCHOOL / TEAM", 30, ALIGN_HEADER_LEFT),
        ("SCHOOL CODE", 14, ALIGN_HEADER_CENTER),
        ("DATE", 16, ALIGN_HEADER_CENTER),
        ("TYPE", 12, ALIGN_HEADER_CENTER),
        ("AMOUNT (RS.)", 16, ALIGN_HEADER_CENTER),
        ("CASH (RS.)", 14, ALIGN_HEADER_CENTER),
        ("UPI (RS.)", 14, ALIGN_HEADER_CENTER),
        ("REFERENCE / NOTE", 34, ALIGN_HEADER_LEFT),
    ]
    ws2.row_dimensions[next_row2].height = 22
    for col_idx, (th_label, _, align) in enumerate(headers2, start=1):
        cell = ws2.cell(row=next_row2, column=col_idx, value=th_label)
        cell.font = FONT_TH
        cell.fill = FILL_TH_PRIMARY
        cell.alignment = align
        cell.border = BORDER_HEADER
    freeze_row2 = next_row2 + 1
    next_row2 += 1

    kind_labels = {"BILL": "Bill", "PAYMENT": "Payment", "REFUND": "Refund"}
    txn_rows = []
    for r in rows:
        for p in sorted(r["team"].payments, key=lambda p: (p.payment_date, p.id)):
            if p.kind == "BILL":
                reference = f"{len(p.members)} member{'s' if len(p.members) != 1 else ''}" if p.members else "—"
                if p.security_fee:
                    reference += f" · incl. Rs. {p.security_fee:,} security fee"
            elif p.kind == "REFUND":
                reference = p.reason or "—"
            else:
                reference = p.transaction_id or "—"
            cash_amount = p.amount if p.payment_mode == "Cash" else None
            upi_amount = p.amount if p.payment_mode == "UPI" else None
            txn_rows.append((r["team"], p, reference, cash_amount, upi_amount))

    for idx, (team, p, reference, cash_amount, upi_amount) in enumerate(txn_rows, start=1):
        ws2.row_dimensions[next_row2].height = 20
        fill = FILL_ZEBRA_EVEN if idx % 2 == 0 else FILL_ZEBRA_ODD
        row_data2 = [
            (team.name, ALIGN_LEFT, FONT_TD_BOLD),
            (team.school_code or "—", ALIGN_CENTER, FONT_TD),
            (p.payment_date.strftime("%d-%b-%Y"), ALIGN_CENTER, FONT_TD),
            (kind_labels.get(p.kind, p.kind), ALIGN_CENTER, FONT_TD_BOLD),
            (p.amount, ALIGN_CENTER, FONT_TD),
            (cash_amount if cash_amount is not None else "—", ALIGN_CENTER, FONT_TD),
            (upi_amount if upi_amount is not None else "—", ALIGN_CENTER, FONT_TD),
            (reference, ALIGN_LEFT, FONT_TD),
        ]
        for col_idx, (val, align, font) in enumerate(row_data2, start=1):
            cell = ws2.cell(row=next_row2, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_row2 += 1

    ws2.row_dimensions[next_row2].height = 12
    next_row2 += 1
    style_footer(ws2, next_row2, max_col=max_cols2)

    auto_fit_columns(ws2, min_width=8, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws2, freeze_pane=f"A{freeze_row2}")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="payments_ledger.xlsx"'},
    )
