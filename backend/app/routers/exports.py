"""Spreadsheet (CSV & Executive XLSX) exports for room allocation and participant lists."""
import csv
import io
import itertools
import re
import zipfile
from collections import defaultdict
from datetime import datetime, timezone

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from .. import id_card, models
from ..config import to_event_tz
from ..database import get_db
from ..pdf_report import build_table_pdf
from .accommodation import assignment_age_group, room_report_rows
from .event_locations import resolve_duty_location_hierarchy
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
from .public import ASSETS_COACHES_DIR, ASSETS_PARTICIPANTS_DIR

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


@router.get("/teams-full.xlsx", dependencies=[Depends(require_module("teams"))])
def export_teams_full_xlsx(db: Session = Depends(get_db)):
    """The single most complete team report: every organizer-set flag per
    team (active/arrived/cluster/label/benched age groups/last-year awards/
    accommodation/photo-upload lock) on one sheet, and the full participant
    roster — each row carrying its own team's key flags — on a second, so
    an organizer never has to cross-reference the Teams and Participants
    pages by hand to answer something like "which inactive teams still have
    an unhoused roster"."""
    from .teams import _accommodation_map, _age_group_counts_map, _participant_counts

    teams = db.query(models.Team).order_by(models.Team.name).all()
    team_ids = [t.id for t in teams]
    participant_counts = _participant_counts(db)
    accommodation = _accommodation_map(db, team_ids, participant_counts)
    age_group_counts = _age_group_counts_map(db, team_ids)

    inactive_groups_by_team: dict[int, list[str]] = defaultdict(list)
    for team_id, age_group in db.query(
        models.TeamInactiveAgeGroup.team_id, models.TeamInactiveAgeGroup.age_group
    ).all():
        inactive_groups_by_team[team_id].append(age_group)

    def _age_group_rank(g: str) -> int:
        m = re.search(r"(\d+)", g)
        return int(m.group(1)) if m else 999

    def _age_group_code(g: str) -> str:
        """"Under 14" -> "U14" — the short form used in the squad-breakdown
        column, e.g. "U14-A" (Active) / "U14-B" (Benched)."""
        m = re.search(r"(\d+)", g)
        return f"U{m.group(1)}" if m else g

    def _squad_breakdown(team_id: int, team_active: bool) -> str:
        """Every age group this team either fields a roster in or has
        individually benched (the union — a bench entry with zero rostered
        players still matters, and so does a fielded squad with no bench
        entry), each as "U{age}-A" or "U{age}-B" (Active/Benched) with its
        headcount alongside — e.g. "U14-B (8) | U17-A (10)". A wholly
        inactive team (Team.is_active False) shows every one of its groups
        as Benched regardless of TeamInactiveAgeGroup, since is_active
        benches everything at once; TeamInactiveAgeGroup only ever adds
        finer-grained benching on top of an otherwise-active team."""
        counts = age_group_counts.get(team_id, {})
        benched = set(inactive_groups_by_team.get(team_id, []))
        groups = sorted(set(counts) | benched, key=_age_group_rank)
        if not groups:
            return "—"
        parts = []
        for g in groups:
            is_benched = not team_active or g in benched
            code = _age_group_code(g)
            parts.append(f"{code}-{'B' if is_benched else 'A'} ({counts.get(g, 0)})")
        return " | ".join(parts)

    def _active_roster_size(team_id: int, team_active: bool) -> int:
        """Total roster minus whichever players are on an inactive age
        group — or the whole roster, for a wholly inactive team (same
        eligibility rule as accommodation.py's _team_size). Subtracting
        from the total (rather than summing only active groups) keeps a
        participant with no age_group set in the count — they can't be in
        a benched group, so they're never inactive on that basis."""
        total = participant_counts.get(team_id, 0)
        if not team_active:
            return 0
        benched = set(inactive_groups_by_team.get(team_id, []))
        inactive_count = sum(c for g, c in age_group_counts.get(team_id, {}).items() if g in benched)
        return total - inactive_count

    awards_by_team: dict[int, list[str]] = defaultdict(list)
    for team_id, age_group, award in db.query(
        models.TeamLastYearAward.team_id, models.TeamLastYearAward.age_group, models.TeamLastYearAward.award
    ).all():
        awards_by_team[team_id].append(f"{age_group}: {award.capitalize()}")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Teams - Full Flags"
    max_cols = 16

    next_row = style_header_banner(
        ws,
        tournament_name="FULL TEAM REPORT",
        subtitle="Every Organizer Flag, Per Delegation",
        badge_text="OFFICIAL TEAM EXPORT",
        max_col=max_cols,
        start_row=1,
    )

    total_teams = len(teams)
    active_teams = sum(1 for t in teams if t.is_active)
    arrived_teams = sum(1 for t in teams if t.has_arrived)
    labeled_teams = sum(1 for t in teams if t.label)
    cards = [
        ("Total Teams", total_teams, f"{active_teams} Active"),
        ("Inactive", total_teams - active_teams, "Benched Wholesale"),
        ("Arrived", arrived_teams, f"{total_teams - arrived_teams} Not Yet"),
        ("Labeled", labeled_teams, "Pool-Conflict Groups"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)

    next_row = style_section_bar(ws, "Team Directory & Flags", next_row, max_col=max_cols, icon="🚩")

    headers = [
        ("#", 5, ALIGN_HEADER_CENTER),
        ("TEAM NAME", 26, ALIGN_HEADER_LEFT),
        ("SCHOOL CODE", 12, ALIGN_HEADER_CENTER),
        ("AFFILIATION NO.", 14, ALIGN_HEADER_CENTER),
        ("REGION", 16, ALIGN_HEADER_LEFT),
        ("CLUSTER", 10, ALIGN_HEADER_CENTER),
        ("LABEL", 16, ALIGN_HEADER_LEFT),
        ("ACTIVE", 9, ALIGN_HEADER_CENTER),
        ("AGE GROUP SQUADS (A=Active, B=Benched)", 40, ALIGN_HEADER_LEFT),
        ("ARRIVED", 9, ALIGN_HEADER_CENTER),
        ("ROSTER SIZE (ACTIVE)", 12, ALIGN_HEADER_CENTER),
        ("LAST YEAR AWARDS", 24, ALIGN_HEADER_LEFT),
        ("ACCOMMODATION", 14, ALIGN_HEADER_CENTER),
        ("PHOTO UPLOADS", 14, ALIGN_HEADER_CENTER),
        ("CONTACT", 22, ALIGN_HEADER_LEFT),
        ("NOTES", 20, ALIGN_HEADER_LEFT),
    ]
    ws.row_dimensions[next_row].height = 22
    for col_idx, (th_label, _, align) in enumerate(headers, start=1):
        cell = ws.cell(row=next_row, column=col_idx, value=th_label)
        cell.font = FONT_TH
        cell.fill = FILL_TH_PRIMARY
        cell.alignment = align
        cell.border = BORDER_HEADER
    next_row += 1

    fill_inactive = PatternFill("solid", fgColor=CLR_AMBER_BG)
    for idx, t in enumerate(teams, start=1):
        ws.row_dimensions[next_row].height = 20
        fill = fill_inactive if not t.is_active else (FILL_ZEBRA_EVEN if idx % 2 == 0 else FILL_ZEBRA_ODD)
        acc = accommodation.get(t.id, {"status": "none"})
        contact = " / ".join(v for v in (t.contact_name, t.contact_phone, t.contact_email) if v) or "—"

        row_data = [
            (idx, ALIGN_CENTER, FONT_TD_BOLD),
            (t.name, ALIGN_LEFT, FONT_TD_BOLD),
            (t.school_code or "—", ALIGN_CENTER, FONT_TD),
            (t.affiliation_number or "—", ALIGN_CENTER, FONT_TD),
            (t.region or "—", ALIGN_LEFT, FONT_TD),
            (t.cluster or "—", ALIGN_CENTER, FONT_TD),
            (t.label or "—", ALIGN_LEFT, FONT_TD),
            ("Active" if t.is_active else "Inactive", ALIGN_CENTER, FONT_TD_BOLD),
            (_squad_breakdown(t.id, t.is_active), ALIGN_LEFT, FONT_TD),
            ("Yes" if t.has_arrived else "No", ALIGN_CENTER, FONT_TD),
            (_active_roster_size(t.id, t.is_active), ALIGN_CENTER, FONT_TD_BOLD),
            (", ".join(awards_by_team.get(t.id, [])) or "—", ALIGN_LEFT, FONT_TD),
            (acc["status"].capitalize(), ALIGN_CENTER, FONT_TD),
            ("Locked" if t.photo_uploads_locked_effective else "Open", ALIGN_CENTER, FONT_TD),
            (contact, ALIGN_LEFT, FONT_TD),
            (t.notes or "—", ALIGN_LEFT, FONT_TD),
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

    # ---------- Sheet 2: full participant roster, team flags joined in ----------
    ws2 = wb.create_sheet("Participants - Full Roster")
    max_cols2 = 12
    team_by_id = {t.id: t for t in teams}
    participants = (
        db.query(models.Participant)
        .order_by(models.Participant.team_id, models.Participant.full_name)
        .all()
    )

    next_row2 = style_header_banner(
        ws2,
        tournament_name="FULL TEAM REPORT",
        subtitle="Participant Roster, With Each Participant's Team Flags",
        badge_text="OFFICIAL ROSTER EXPORT",
        max_col=max_cols2,
        start_row=1,
    )
    next_row2 = style_kpi_cards(
        ws2,
        [
            ("Total Participants", len(participants), "Registered"),
            ("Present", sum(1 for p in participants if p.is_present), "Checked In"),
            ("On Inactive Teams", sum(1 for p in participants if not team_by_id.get(p.team_id, models.Team()).is_active), "Flagged"),
            ("Teams Represented", len({p.team_id for p in participants if p.team_id}), "Affiliated"),
        ],
        start_row=next_row2,
        card_width_cols=1,
    )
    next_row2 = style_section_bar(ws2, "Full Participant Roster", next_row2, max_col=max_cols2, icon="👥")

    headers2 = [
        ("#", 5, ALIGN_HEADER_CENTER),
        ("FULL NAME", 24, ALIGN_HEADER_LEFT),
        ("TEAM", 24, ALIGN_HEADER_LEFT),
        ("TEAM ACTIVE", 11, ALIGN_HEADER_CENTER),
        ("TEAM CLUSTER", 11, ALIGN_HEADER_CENTER),
        ("TEAM LABEL", 16, ALIGN_HEADER_LEFT),
        ("REG. NO.", 16, ALIGN_HEADER_CENTER),
        ("AGE GROUP", 12, ALIGN_HEADER_CENTER),
        ("GROUP BENCHED", 13, ALIGN_HEADER_CENTER),
        ("GENDER", 9, ALIGN_HEADER_CENTER),
        ("PRESENT", 9, ALIGN_HEADER_CENTER),
        ("WEIGHT (KG)", 11, ALIGN_HEADER_CENTER),
    ]
    ws2.row_dimensions[next_row2].height = 22
    for col_idx, (th_label, _, align) in enumerate(headers2, start=1):
        cell = ws2.cell(row=next_row2, column=col_idx, value=th_label)
        cell.font = FONT_TH
        cell.fill = FILL_TH_PRIMARY
        cell.alignment = align
        cell.border = BORDER_HEADER
    next_row2 += 1

    for idx, p in enumerate(participants, start=1):
        team = team_by_id.get(p.team_id)
        team_inactive = not team.is_active if team else False
        # A wholly inactive team benches every one of its age groups at
        # once (same rule _squad_breakdown above uses) — not just the ones
        # with their own TeamInactiveAgeGroup row.
        group_benched = bool(p.age_group) and (
            team_inactive or p.age_group in inactive_groups_by_team.get(p.team_id, [])
        )
        ws2.row_dimensions[next_row2].height = 20
        fill = fill_inactive if (team_inactive or group_benched) else (FILL_ZEBRA_EVEN if idx % 2 == 0 else FILL_ZEBRA_ODD)

        row_data2 = [
            (idx, ALIGN_CENTER, FONT_TD_BOLD),
            (p.full_name, ALIGN_LEFT, FONT_TD_BOLD),
            (team.name if team else "—", ALIGN_LEFT, FONT_TD),
            ("Active" if team and team.is_active else "Inactive", ALIGN_CENTER, FONT_TD),
            (team.cluster if team and team.cluster else "—", ALIGN_CENTER, FONT_TD),
            (team.label if team and team.label else "—", ALIGN_LEFT, FONT_TD),
            (p.registration_no or "—", ALIGN_CENTER, FONT_TD),
            (p.age_group or "—", ALIGN_CENTER, FONT_TD),
            ("Benched" if group_benched else "—", ALIGN_CENTER, FONT_TD),
            (p.gender or "—", ALIGN_CENTER, FONT_TD),
            ("Yes" if p.is_present else "No", ALIGN_CENTER, FONT_TD),
            (float(p.weight) if p.weight is not None else "—", ALIGN_CENTER, FONT_TD),
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
    enable_sheet_ergonomics(ws2, freeze_pane="A7")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="full_team_report.xlsx"'},
    )


def _room_assignments(db: Session, cluster: "str | None") -> list[models.AccommodationAssignment]:
    """Every accommodation assignment, or only those whose team belongs to
    `cluster` — the admin Accommodation page passes its selected cluster
    through so the downloaded report matches what's shown on screen."""
    q = db.query(models.AccommodationAssignment)
    if cluster:
        q = q.join(models.Team, models.AccommodationAssignment.team_id == models.Team.id).filter(models.Team.cluster == cluster)
    return q.all()


def _cluster_suffix(cluster: "str | None") -> str:
    return f"-cluster-{_slug(cluster)}" if cluster else ""


@router.get("/rooms.csv", dependencies=[Depends(require_module("accommodation"))])
def export_room_allocation(cluster: "str | None" = Query(None), db: Session = Depends(get_db)):
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
    for a in _room_assignments(db, cluster):
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
            (a.team.cluster or "") if a.team else "",
            assignment_age_group(a, participant),
            participant_counts.get(a.team_id, 0) if a.team_id else "",
            participant_present_counts.get(a.team_id, 0) if a.team_id else "",
        ])
    return _csv_response(
        ["Building", "Floor", "Room", "Bed", "Occupant", "Team", "Cluster", "Age Group", "Allotted", "Filled"],
        rows,
        f"room-allocation{_cluster_suffix(cluster)}.csv",
    )


@router.get("/rooms.xlsx", dependencies=[Depends(require_module("accommodation"))])
def export_room_allocation_xlsx(cluster: "str | None" = Query(None), db: Session = Depends(get_db)):
    assignments = _room_assignments(db, cluster)
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
    max_cols = 10

    next_row = style_header_banner(
        ws,
        tournament_name="ACCOMMODATION & ROOM ALLOCATION",
        subtitle="Building, Floor, Room, Bed & Assigned Occupant Details" + (f" — Cluster {cluster}" if cluster else ""),
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
        ("CLUSTER", 10, ALIGN_HEADER_CENTER),
        ("AGE GROUP", 14, ALIGN_HEADER_CENTER),
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
            ((a.team.cluster or "—") if a.team else "—", ALIGN_CENTER, FONT_TD),
            (assignment_age_group(a, participant) or "—", ALIGN_CENTER, FONT_TD),
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
        headers={"Content-Disposition": f'attachment; filename="room_allocations{_cluster_suffix(cluster)}.xlsx"'},
    )


@router.get("/rooms.pdf", dependencies=[Depends(require_module("accommodation"))])
def export_room_allocation_pdf(cluster: "str | None" = Query(None), db: Session = Depends(get_db)):
    """Printable PDF twin of rooms.xlsx above — same per-occupant Accommodation
    Report (who's in which bed), same source query, just laid out as a
    paginated table instead of a workbook."""
    assignments = _room_assignments(db, cluster)
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
            (a.team.cluster or "—") if a.team else "—",
            assignment_age_group(a, participant) or "—",
            participant_counts.get(a.team_id, 0) if a.team_id else "—",
            participant_present_counts.get(a.team_id, 0) if a.team_id else "—",
        ])

    pdf = build_table_pdf(
        title="ACCOMMODATION REPORT",
        subtitle=(
            f"Building, Floor, Room, Bed & Assigned Occupant Detail — Cluster {cluster}"
            if cluster
            else "Building, Floor, Room, Bed & Assigned Occupant Detail — Every Active Allocation"
        ),
        headers=["Building", "Floor", "Room", "Bed", "Occupant", "Team", "Cluster", "Age Group", "Allotted", "Present"],
        rows=rows,
        col_widths=[3.2, 2.5, 2.0, 2.2, 4.2, 4.2, 1.7, 2.7, 2.0, 2.0],
        kpis=[
            ("Total Allocations", str(len(assignments))),
            ("Rooms Assigned", str(len({a.room_id for a in assignments if a.room_id}))),
            ("Bed Assignments", str(sum(1 for a in assignments if a.bed_id is not None))),
        ],
    )
    return Response(
        content=pdf,
        media_type=PDF_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="accommodation_report{_cluster_suffix(cluster)}.pdf"'},
    )


@router.get("/rooms-detailed.csv", dependencies=[Depends(require_module("accommodation"))])
def export_room_map_report_csv(db: Session = Depends(get_db)):
    """Room Map Report — one row per Room across every Building/Floor (see
    accommodation.room_report_rows), unlike rooms.csv above which is one row
    per occupant/bed. This is the room-utilization view: Capacity, Allotted,
    Occupied (checked-in), Free."""
    rows = room_report_rows(db)
    csv_rows = [
        [r["building"], r["floor"], r["room"], r["room_type"] or "", r["capacity"], r["allotted"], r["occupied"], r["free"]]
        for r in rows
    ]
    return _csv_response(
        ["Building", "Floor", "Room", "Room Type", "Capacity", "Allotted", "Occupied", "Free"],
        csv_rows,
        "room-map-report.csv",
    )


@router.get("/rooms-detailed.xlsx", dependencies=[Depends(require_module("accommodation"))])
def export_room_map_report_xlsx(db: Session = Depends(get_db)):
    rows = room_report_rows(db)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Room Map Report"
    max_cols = 8

    next_row = style_header_banner(
        ws,
        tournament_name="ROOM MAP REPORT",
        subtitle="Building, Floor & Room Occupancy Detail — Capacity, Allotted, Occupied & Free",
        badge_text="OFFICIAL ROOM UTILIZATION EXPORT",
        max_col=max_cols,
        start_row=1,
    )

    total_capacity = sum(r["capacity"] for r in rows)
    total_allotted = sum(r["allotted"] for r in rows)
    total_occupied = sum(r["occupied"] for r in rows)
    total_free = sum(r["free"] for r in rows)

    cards = [
        ("Total Rooms", len(rows), "Across All Buildings"),
        ("Total Capacity", total_capacity, "Rated Beds"),
        ("Allotted", total_allotted, "Assigned Slots"),
        ("Occupied", total_occupied, "Checked In"),
        ("Free", total_free, "Remaining Capacity"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)
    next_row = style_section_bar(ws, "Room-by-Room Occupancy", next_row, max_col=max_cols, icon="🏨")

    headers = [
        ("BUILDING", 20, ALIGN_HEADER_LEFT),
        ("FLOOR", 16, ALIGN_HEADER_LEFT),
        ("ROOM", 14, ALIGN_HEADER_CENTER),
        ("ROOM TYPE", 16, ALIGN_HEADER_LEFT),
        ("CAPACITY", 12, ALIGN_HEADER_CENTER),
        ("ALLOTTED", 12, ALIGN_HEADER_CENTER),
        ("OCCUPIED", 12, ALIGN_HEADER_CENTER),
        ("FREE", 10, ALIGN_HEADER_CENTER),
    ]
    ws.row_dimensions[next_row].height = 22
    for col_idx, (th_label, _, align) in enumerate(headers, start=1):
        cell = ws.cell(row=next_row, column=col_idx, value=th_label)
        cell.font = FONT_TH
        cell.fill = FILL_TH_PRIMARY
        cell.alignment = align
        cell.border = BORDER_HEADER
    next_row += 1

    for idx, r in enumerate(rows, start=1):
        ws.row_dimensions[next_row].height = 20
        fill = FILL_ZEBRA_EVEN if idx % 2 == 0 else FILL_ZEBRA_ODD
        if r["over_capacity"]:
            fill = PatternFill("solid", fgColor=CLR_AMBER_BG)

        row_data = [
            (r["building"], ALIGN_LEFT, FONT_TD_BOLD),
            (r["floor"], ALIGN_LEFT, FONT_TD),
            (r["room"], ALIGN_CENTER, FONT_TD_BOLD),
            (r["room_type"] or "—", ALIGN_LEFT, FONT_TD),
            (r["capacity"], ALIGN_CENTER, FONT_TD),
            (r["allotted"], ALIGN_CENTER, FONT_TD_BOLD),
            (r["occupied"], ALIGN_CENTER, FONT_TD),
            (r["free"], ALIGN_CENTER, FONT_TD_BOLD),
        ]
        for col_idx, (val, align, font) in enumerate(row_data, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_row += 1

    style_footer(ws, next_row + 1, max_col=max_cols)
    auto_fit_columns(ws, min_width=8, max_width=40, extra_padding=3)
    enable_sheet_ergonomics(ws, freeze_pane="A7")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="room_map_report.xlsx"'},
    )


@router.get("/rooms-detailed.pdf", dependencies=[Depends(require_module("accommodation"))])
def export_room_map_report_pdf(db: Session = Depends(get_db)):
    rows = room_report_rows(db)
    table_rows = [
        [r["building"], r["floor"], r["room"], r["room_type"] or "—", r["capacity"], r["allotted"], r["occupied"], r["free"]]
        for r in rows
    ]
    pdf = build_table_pdf(
        title="ROOM MAP REPORT",
        subtitle="Building, Floor & Room Occupancy Detail — Capacity, Allotted, Occupied & Free",
        headers=["Building", "Floor", "Room", "Room Type", "Capacity", "Allotted", "Occupied", "Free"],
        rows=table_rows,
        col_widths=[3.5, 2.8, 2.2, 3.0, 2.2, 2.2, 2.2, 2.0],
        kpis=[
            ("Total Rooms", str(len(rows))),
            ("Total Capacity", str(sum(r["capacity"] for r in rows))),
            ("Allotted", str(sum(r["allotted"] for r in rows))),
            ("Free", str(sum(r["free"] for r in rows))),
        ],
    )
    return Response(
        content=pdf,
        media_type=PDF_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="room_map_report.pdf"'},
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
    max_cols = 8

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
        ("PLANNED DATE", 14, ALIGN_HEADER_CENTER),
        ("PLANNED TIME", 14, ALIGN_HEADER_CENTER),
        ("PLANNED LOCATION", 24, ALIGN_HEADER_LEFT),
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
            (t.arrival_date.strftime("%d-%b-%Y") if t.arrival_date else "—", ALIGN_CENTER, FONT_TD),
            (t.arrival_time or "—", ALIGN_CENTER, FONT_TD),
            (t.arrival_location or "—", ALIGN_LEFT, FONT_TD),
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
    "room-map": "accommodation",
    "accounts": None,  # admin-only, checked separately below
}


def _require_live_detail_access(section: str, current: models.OrganizerUser) -> None:
    if section not in _LIVE_DETAIL_MODULES:
        raise HTTPException(404, "Unknown report section")
    module_key = _LIVE_DETAIL_MODULES[section]
    if module_key is None:
        if not current.is_admin:
            raise HTTPException(403, "Admin access required")
    elif not _has_view(current, module_key) and not (section == "attendance" and _has_view(current, "teams")):
        raise HTTPException(403, "You don't have view access to this section")


# Title/subtitle for each section's printable PDF (see /live-detail/{section}.pdf
# below) — kept here rather than duplicated on the frontend since the PDF is
# generated entirely server-side.
_LIVE_DETAIL_PDF_META = {
    "attendance": ("ATTENDANCE REPORT", "Present/Absent Status — Every Registered Participant"),
    "arrival": ("ARRIVAL REPORT", "School Delegation Arrival Status & Pending Processes"),
    "billing": ("PAYMENTS LEDGER", "Per-Team Registration-Fee Billing, Refunds & Net Collected"),
    "duty": ("DUTY REPORT", "Staff Duty Assignments Across Every Building & Room"),
    "matches": ("MATCH PROGRESS REPORT", "Scheduled, Live & Completed Matches — All Tournaments"),
    "accommodation": ("ACCOMMODATION REPORT", "Building, Floor, Room, Bed & Assigned Occupant Detail"),
    "room-map": ("ROOM MAP REPORT", "Building, Floor & Room Occupancy Detail — Capacity, Allotted, Occupied & Free"),
    "accounts": ("USER REPORT", "Organizer Portal Accounts, Roles & Module Permissions"),
}


def _live_detail_data(section: str, db: Session) -> dict:
    """The full row-by-row data behind one Live Reports card (see
    live_reports_summary above) — same numbers, just the underlying sheet
    instead of the rolled-up stat. Shared by the JSON "view" endpoint below
    and its PDF twin, so both are always built from the exact same query.
    Returns {"columns": [...], "rows": [[...], ...]} — a generic shape the
    frontend renders with one plain <table>, no per-section UI needed."""
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
                t.arrival_date.strftime("%d-%b-%Y") if t.arrival_date else "—",
                t.arrival_time or "—",
                t.arrival_location or "—",
                pending_label,
                f"{registered}/{total_members}/{billed}",
            ])
            row_flags.append(registered > billed)
        return {
            "columns": [
                "School Code", "School / Team", "Arrived", "Planned Date", "Planned Time",
                "Planned Location", "Pending Processes", "R/T/B (Reg./Total/Billed)",
            ],
            "rows": rows,
            "row_flags": row_flags,
        }

    if section == "billing":
        teams = db.query(models.Team).order_by(models.Team.name).all()
        rows = []

        def _fmt_date(d):
            return d.strftime("%d-%b-%Y") if d else "—"

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
            rows.append([
                t.name,
                t.school_code or "—",
                billed,
                paid,
                paid_cash,
                paid_upi,
                billed - paid,
                refunded,
                refunded_cash,
                refunded_upi,
                paid - refunded,
                _fmt_date(max((p.payment_date for p in bills), default=None)),
                _fmt_date(max((p.payment_date for p in pays), default=None)),
                _fmt_date(max((p.payment_date for p in refunds), default=None)),
                len(t.payments),
            ])
        return {
            "columns": [
                "School / Team", "School Code", "Total Billed (Rs.)", "Total Paid (Rs.)",
                "Paid - Cash (Rs.)", "Paid - UPI (Rs.)", "Balance Due (Rs.)", "Total Refunded (Rs.)",
                "Refunded - Cash (Rs.)", "Refunded - UPI (Rs.)", "Net Collected (Rs.)",
                "Last Bill Date", "Last Payment Date", "Last Refund Date", "Transactions",
            ],
            "rows": rows,
        }

    if section == "duty":
        duties = (
            db.query(models.DutyAssignment)
            .options(
                joinedload(models.DutyAssignment.staff),
                joinedload(models.DutyAssignment.shift).joinedload(models.StaffShift.shift_block),
                joinedload(models.DutyAssignment.location).joinedload(models.EventLocation.room).joinedload(models.Room.floor).joinedload(models.Floor.building),
                joinedload(models.DutyAssignment.location).joinedload(models.EventLocation.building),
                joinedload(models.DutyAssignment.location).joinedload(models.EventLocation.mat),
                joinedload(models.DutyAssignment.room).joinedload(models.Room.floor).joinedload(models.Floor.building),
            )
            .order_by(models.DutyAssignment.start_time.asc().nullslast())
            .all()
        )
        tasks = db.query(models.Task).options(joinedload(models.Task.shift)).all()
        tasks_map = defaultdict(list)
        for t in tasks:
            sb_id = t.shift.shift_block_id if t.shift else None
            tasks_map[(t.assigned_staff_id, sb_id)].append(t)

        rows = []
        for a in duties:
            loc_name, bldg_name, room_name = resolve_duty_location_hierarchy(a)
            st = to_event_tz(a.start_time)
            et = to_event_tz(a.end_time)
            sb_id = a.shift.shift_block_id if a.shift else None
            d_tasks = tasks_map.get((a.staff_id, sb_id), [])
            tasks_str = ", ".join(f"{t.title} [{t.status.upper()}]" for t in d_tasks) if d_tasks else "—"
            rows.append([
                a.staff.full_name if a.staff else "—",
                a.staff.category if a.staff else "—",
                a.duty_type or "—",
                loc_name,
                bldg_name,
                room_name,
                st.strftime("%d-%b %H:%M") if st else "—",
                et.strftime("%d-%b %H:%M") if et else "—",
                tasks_str,
            ])
        return {
            "columns": ["Staff Name", "Category", "Duty Type", "Location", "Building", "Room", "Start", "End", "Assigned Tasks"],
            "rows": rows,
        }

    if section == "matches":
        matches = (
            db.query(models.Match)
            .order_by(models.Match.tournament_id, models.Match.round_id, models.Match.id)
            .all()
        )
        rows = []
        for m in matches:
            sched_tz = to_event_tz(m.scheduled_at)
            rows.append([
                m.tournament.name if m.tournament else "—",
                m.round.name if m.round else "—",
                m.team_a.name if m.team_a else "TBD",
                m.team_b.name if m.team_b else "TBD",
                m.status,
                f"{m.team_a_score} - {m.team_b_score}",
                m.mat.name if m.mat else "—",
                sched_tz.strftime("%d-%b %H:%M") if sched_tz else "—",
            ])
        return {
            "columns": ["Tournament", "Round", "Team A", "Team B", "Status", "Score", "Mat", "Scheduled"],
            "rows": rows,
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

    if section == "room-map":
        rows = room_report_rows(db)
        return {
            "columns": ["Building", "Floor", "Room", "Room Type", "Capacity", "Allotted", "Occupied", "Free"],
            "rows": [
                [r["building"], r["floor"], r["room"], r["room_type"] or "—", r["capacity"], r["allotted"], r["occupied"], r["free"]]
                for r in rows
            ],
            "row_flags": [r["over_capacity"] for r in rows],
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


@router.get("/live-detail/{section}.pdf")
def live_report_detail_pdf(
    section: str, current: models.OrganizerUser = Depends(require_auth), db: Session = Depends(get_db)
):
    """Printable PDF twin of live_report_detail below — same query, same
    access rule, laid out as a paginated table (pdf_report.build_table_pdf)
    instead of JSON. Covers every report on the Reports & Export hub that
    doesn't already have its own dedicated styled .xlsx (Attendance,
    Arrival, Payments, Duty, Match Progress, Accounts) — Room Map and
    Accommodation have their own PDF endpoints instead since they need
    extra KPI cards their .xlsx siblings also carry.

    Registered *before* the plain /live-detail/{section} route below: since
    {section} is an unconstrained path param it would otherwise greedily
    match "room-map.pdf" as a literal (nonexistent) section name too — a
    Starlette/FastAPI route matches in declaration order, not by
    specificity, so the more specific ".pdf" path has to come first."""
    _require_live_detail_access(section, current)
    data = _live_detail_data(section, db)
    title, subtitle = _LIVE_DETAIL_PDF_META.get(section, (section.upper(), "Report Detail"))
    pdf = build_table_pdf(
        title=title,
        subtitle=subtitle,
        headers=data["columns"],
        rows=data["rows"],
        kpis=[("Total Records", str(len(data["rows"])))],
    )
    return Response(
        content=pdf,
        media_type=PDF_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{section}_report.pdf"'},
    )


@router.get("/live-detail/{section}")
def live_report_detail(
    section: str, current: models.OrganizerUser = Depends(require_auth), db: Session = Depends(get_db)
):
    """JSON row data for one Live Reports card's "click to see everything"
    view in Reports.tsx — see _live_detail_data. Deliberately its own
    on-demand endpoint rather than folded into live-summary: that one gets
    polled every 20s and returning every participant/match/account row on
    every poll would be wasteful — this only runs when someone actually
    opens a card's detail dialog."""
    _require_live_detail_access(section, current)
    return _live_detail_data(section, db)


@router.get("/duties.xlsx", dependencies=[Depends(require_module("staff"))])
def export_duties_xlsx(db: Session = Depends(get_db)):
    duties = (
        db.query(models.DutyAssignment)
        .options(
            joinedload(models.DutyAssignment.staff),
            joinedload(models.DutyAssignment.shift).joinedload(models.StaffShift.shift_block),
            joinedload(models.DutyAssignment.location).joinedload(models.EventLocation.room).joinedload(models.Room.floor).joinedload(models.Floor.building),
            joinedload(models.DutyAssignment.location).joinedload(models.EventLocation.building),
            joinedload(models.DutyAssignment.location).joinedload(models.EventLocation.mat),
            joinedload(models.DutyAssignment.room).joinedload(models.Room.floor).joinedload(models.Floor.building),
        )
        .order_by(models.DutyAssignment.start_time.asc().nullslast())
        .all()
    )

    tasks = (
        db.query(models.Task)
        .options(
            joinedload(models.Task.assigned_staff),
            joinedload(models.Task.shift).joinedload(models.StaffShift.shift_block),
        )
        .order_by(models.Task.due_date.asc().nullslast(), models.Task.id.desc())
        .all()
    )

    tasks_by_staff_block = defaultdict(list)
    for t in tasks:
        sb_id = t.shift.shift_block_id if t.shift else None
        tasks_by_staff_block[(t.assigned_staff_id, sb_id)].append(t)

    wb = openpyxl.Workbook()
    # ---------------------------------------------------------
    # SHEET 1: Duty Roster (with Assigned Tasks column)
    # ---------------------------------------------------------
    ws = wb.active
    ws.title = "Duty Roster"
    max_cols = 9

    next_row = style_header_banner(
        ws,
        tournament_name="STAFF DUTY REPORT",
        subtitle="Duty Assignments Across Every Building, Floor & Room with Integrated Task Roster",
        badge_text="OFFICIAL DUTY ROSTER EXPORT",
        max_col=max_cols,
        start_row=1,
    )

    total_d = len(duties)
    unique_staff = len({d.staff_id for d in duties if d.staff_id})
    unique_buildings = len({
        bldg for d in duties
        for _, bldg, _ in [resolve_duty_location_hierarchy(d)]
        if bldg and bldg != "—"
    })
    linked_tasks_count = sum(
        len(tasks_by_staff_block.get((d.staff_id, d.shift.shift_block_id if d.shift else None), []))
        for d in duties
    )

    cards = [
        ("Total Assignments", total_d, "Duty Slots"),
        ("Staff Assigned", unique_staff, "Individuals"),
        ("Buildings Covered", unique_buildings, "Locations"),
        ("Linked Tasks", linked_tasks_count, "Task Items"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)

    next_row = style_section_bar(ws, "Duty Roster", next_row, max_col=max_cols, icon="🛡️")

    headers = [
        ("STAFF NAME", 24, ALIGN_HEADER_LEFT),
        ("CATEGORY", 20, ALIGN_HEADER_LEFT),
        ("DUTY TYPE", 16, ALIGN_HEADER_CENTER),
        ("LOCATION", 22, ALIGN_HEADER_LEFT),
        ("BUILDING", 18, ALIGN_HEADER_LEFT),
        ("ROOM", 14, ALIGN_HEADER_CENTER),
        ("START", 18, ALIGN_HEADER_CENTER),
        ("END", 18, ALIGN_HEADER_CENTER),
        ("ASSIGNED TASKS", 34, ALIGN_HEADER_LEFT),
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
        loc_name, bldg_name, room_name = resolve_duty_location_hierarchy(d)
        st = to_event_tz(d.start_time)
        et = to_event_tz(d.end_time)
        sb_id = d.shift.shift_block_id if d.shift else None
        d_tasks = tasks_by_staff_block.get((d.staff_id, sb_id), [])
        tasks_text = ", ".join(f"{t.title} [{t.status.upper()}]" for t in d_tasks) if d_tasks else "—"

        row_data = [
            (d.staff.full_name if d.staff else "—", ALIGN_LEFT, FONT_TD_BOLD),
            (d.staff.category if d.staff else "—", ALIGN_LEFT, FONT_TD),
            (d.duty_type or "—", ALIGN_CENTER, FONT_TD),
            (loc_name, ALIGN_LEFT, FONT_TD),
            (bldg_name, ALIGN_LEFT, FONT_TD),
            (room_name, ALIGN_CENTER, FONT_TD),
            (st.strftime("%d %b %Y %H:%M") if st else "—", ALIGN_CENTER, FONT_TD),
            (et.strftime("%d %b %Y %H:%M") if et else "—", ALIGN_CENTER, FONT_TD),
            (tasks_text, ALIGN_LEFT, FONT_TD),
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

    # ---------------------------------------------------------
    # SHEET 2: Dedicated Task Report
    # ---------------------------------------------------------
    ws_tasks = wb.create_sheet(title="Task Report")
    max_task_cols = 9

    next_task_row = style_header_banner(
        ws_tasks,
        tournament_name="STAFF OPERATIONS TASK REPORT",
        subtitle="Individual Task Allocations, Operational Categories, Priorities, Due Dates & Completion Status",
        badge_text="OFFICIAL TASK REGISTER",
        max_col=max_task_cols,
        start_row=1,
    )

    now = datetime.now(timezone.utc)
    total_tasks = len(tasks)
    completed_tasks = sum(1 for t in tasks if t.status == "completed")
    in_prog_tasks = sum(1 for t in tasks if t.status == "in_progress")
    pending_tasks = sum(1 for t in tasks if t.status == "pending")
    overdue_tasks = sum(
        1 for t in tasks
        if t.due_date and t.status != "completed"
        and (t.due_date if t.due_date.tzinfo else t.due_date.replace(tzinfo=timezone.utc)) < now
    )

    task_cards = [
        ("Total Tasks", total_tasks, "Operational Tasks"),
        ("Completed", completed_tasks, "Finished"),
        ("In Progress", in_prog_tasks, "Active"),
        ("Pending", pending_tasks, "Queued"),
        ("Overdue", overdue_tasks, "Needs Attention"),
    ]
    next_task_row = style_kpi_cards(ws_tasks, task_cards, start_row=next_task_row, card_width_cols=1)
    next_task_row = style_section_bar(ws_tasks, "Operational Task Register", next_task_row, max_col=max_task_cols, icon="📋")

    task_headers = [
        ("TASK TITLE", 28, ALIGN_HEADER_LEFT),
        ("ASSIGNED STAFF", 22, ALIGN_HEADER_LEFT),
        ("STAFF CATEGORY", 16, ALIGN_HEADER_LEFT),
        ("SHIFT LINK", 20, ALIGN_HEADER_LEFT),
        ("TASK CATEGORY", 18, ALIGN_HEADER_LEFT),
        ("PRIORITY", 14, ALIGN_HEADER_CENTER),
        ("STATUS", 14, ALIGN_HEADER_CENTER),
        ("DUE DATE", 16, ALIGN_HEADER_CENTER),
        ("OVERDUE", 12, ALIGN_HEADER_CENTER),
    ]

    ws_tasks.row_dimensions[next_task_row].height = 22
    for col_idx, (th_label, _, align) in enumerate(task_headers, start=1):
        cell = ws_tasks.cell(row=next_task_row, column=col_idx, value=th_label)
        cell.font = FONT_TH
        cell.fill = FILL_TH_PRIMARY
        cell.alignment = align
        cell.border = BORDER_HEADER
    next_task_row += 1

    for idx, t in enumerate(tasks, start=1):
        ws_tasks.row_dimensions[next_task_row].height = 20
        fill = FILL_ZEBRA_EVEN if idx % 2 == 0 else FILL_ZEBRA_ODD
        is_completed = (t.status == "completed")
        is_overdue = False
        if t.due_date and not is_completed:
            dt = t.due_date if t.due_date.tzinfo else t.due_date.replace(tzinfo=timezone.utc)
            if dt < now:
                is_overdue = True

        if is_overdue:
            fill = PatternFill("solid", fgColor=CLR_AMBER_BG)

        staff_name = t.assigned_staff.full_name if t.assigned_staff else "Unassigned"
        staff_cat = t.assigned_staff.category if t.assigned_staff else "—"
        shift_name = t.shift.shift_block.name if (t.shift and t.shift.shift_block) else "Shiftless / General"
        due_str = to_event_tz(t.due_date).strftime("%d %b %Y %H:%M") if t.due_date else "No Due Date"

        t_row_data = [
            (t.title, ALIGN_LEFT, FONT_TD_BOLD),
            (staff_name, ALIGN_LEFT, FONT_TD_BOLD if t.assigned_staff else FONT_TD),
            (staff_cat, ALIGN_LEFT, FONT_TD),
            (shift_name, ALIGN_LEFT, FONT_TD),
            (t.category or "General", ALIGN_LEFT, FONT_TD),
            ((t.priority or "normal").upper(), ALIGN_CENTER, FONT_TD),
            ((t.status or "pending").upper(), ALIGN_CENTER, FONT_TD_BOLD),
            (due_str, ALIGN_CENTER, FONT_TD),
            ("OVERDUE" if is_overdue else "ON TIME", ALIGN_CENTER, FONT_TD_BOLD if is_overdue else FONT_TD),
        ]

        for col_idx, (val, align, font) in enumerate(t_row_data, start=1):
            cell = ws_tasks.cell(row=next_task_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_task_row += 1

    ws_tasks.row_dimensions[next_task_row].height = 12
    next_task_row += 1
    style_footer(ws_tasks, next_task_row, max_col=max_task_cols)

    auto_fit_columns(ws_tasks, min_width=8, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws_tasks, freeze_pane="A7")

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


def _slug(text: str) -> str:
    """Filesystem-safe stand-in for a name inside a download filename —
    alnum/space/hyphen/underscore kept, everything else (commas, slashes,
    punctuation) collapsed to underscore."""
    return "".join(c if c.isalnum() or c in " -_" else "_" for c in (text or "")).strip()


def _idcard_filename(participant: models.Participant, team: models.Team) -> str:
    """One card's file name inside an individual-cards ZIP — the school name
    first (so cards from different schools stay identifiable once extracted
    out of the zip, e.g. from the all-teams bundle), then registration_no
    when available (stable/unique, matches the single-participant
    download's naming), falling back to the DB id, plus the athlete's name
    for a human-readable listing in the layout tool's file picker."""
    slug = _slug(participant.full_name) or "participant"
    team_slug = _slug(team.name) or "team"
    return f"{team_slug}_{participant.registration_no or participant.id}_{slug}.pdf"


def _active_participants(participants: list[models.Participant]) -> list[models.Participant]:
    """Every id_card.py caller below filters through this — an inactive
    participant (Participant.is_active, toggled only via the admin-
    password-gated POST /participants/{id}/active) never renders an ID
    card, in any export, without needing every call site to remember the
    filter itself. Members of an inactive team (Team.is_active) are
    excluded too, and so is anyone whose specific age group has been
    individually benched (TeamInactiveAgeGroup) even though their team is
    still active overall."""
    return [
        p for p in participants
        if p.is_active and p.team.is_active
        and not any(g.age_group == p.age_group for g in p.team.inactive_age_groups)
    ]


def _individual_card_files(participants: list[models.Participant], team_by_id: dict[int, models.Team]) -> list[tuple[str, bytes]]:
    """Renders each participant's card as its own standalone one-page PDF
    (same render_id_card_page + build_pdf pairing the single-participant
    download already uses — full physical card size, no sheet grid), for
    bundling into an individual-cards ZIP."""
    files: list[tuple[str, bytes]] = []
    seen_names: dict[str, int] = {}
    for p in sorted(_active_participants(participants), key=id_card.sort_key):
        team = team_by_id[p.team_id]
        card = id_card.render_id_card_page(p, team, _photo_path(p))
        pdf = id_card.build_pdf([card])
        name = _idcard_filename(p, team)
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


def _team_staff_cards(team: models.Team) -> list:
    """Coach/Manager cards appended after a team's participant cards (see
    export_idcard_team and friends below) — Coach first, then Manager, each
    sorted by name. A role with no actual record on the team yet gets one
    blank placeholder card instead (id_card.render_blank_staff_card) rather
    than being skipped, so the export always ends with at least one Coach
    slot and one Manager slot to fill in by hand."""
    coaches = [c for c in team.coaches if (c.role or "Coach") != "Manager"]
    managers = [c for c in team.coaches if c.role == "Manager"]
    cards: list = []
    if coaches:
        cards += [
            id_card.render_staff_id_card(c, team, _coach_photo_path(c))
            for c in sorted(coaches, key=lambda c: c.full_name)
        ]
    else:
        cards.append(id_card.render_blank_staff_card("Coach"))
    if managers:
        cards += [
            id_card.render_staff_id_card(c, team, _coach_photo_path(c))
            for c in sorted(managers, key=lambda c: c.full_name)
        ]
    else:
        cards.append(id_card.render_blank_staff_card("Manager"))
    return cards


def _team_staff_card_files(team: models.Team) -> list[tuple[str, bytes]]:
    """Same Coach/Manager set as _team_staff_cards, but as standalone
    one-page-per-card PDFs (id_card.render_staff_id_card_page /
    render_blank_staff_card_page) for _individual_card_files-style ZIPs."""
    coaches = [c for c in team.coaches if (c.role or "Coach") != "Manager"]
    managers = [c for c in team.coaches if c.role == "Manager"]
    files: list[tuple[str, bytes]] = []
    team_slug = _slug(team.name) or "team"

    def _add(c: "models.Coach | None", role: str):
        if c is not None:
            page = id_card.render_staff_id_card_page(c, team, _coach_photo_path(c))
            slug = _slug(c.full_name) or role.lower()
            name = f"{team_slug}_{role}_{c.id}_{slug}.pdf"
        else:
            page = id_card.render_blank_staff_card_page(role)
            name = f"{team_slug}_{role}_blank.pdf"
        files.append((name, id_card.build_pdf([page])))

    if coaches:
        for c in sorted(coaches, key=lambda c: c.full_name):
            _add(c, "Coach")
    else:
        _add(None, "Coach")
    if managers:
        for c in sorted(managers, key=lambda c: c.full_name):
            _add(c, "Manager")
    else:
        _add(None, "Manager")
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
    ordered = sorted(_active_participants(participants), key=id_card.sort_key)
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
    if not participant.is_active:
        raise HTTPException(400, "This participant is inactive — their ID card is not available.")
    if not participant.team.is_active:
        raise HTTPException(400, "This team is inactive — ID cards are not available.")
    if any(g.age_group == participant.age_group for g in participant.team.inactive_age_groups):
        raise HTTPException(400, f"{participant.full_name}'s age group ({participant.age_group}) is inactive for this team — their ID card is not available.")
    card = id_card.render_id_card_page(participant, participant.team, _photo_path(participant))
    pdf = id_card.build_pdf([card])
    return _pdf_response(pdf, f"idcard-{_slug(participant.team.name)}-{participant.registration_no or participant.id}.pdf")


@router.get("/idcards/team/{team_id}.pdf", dependencies=[Depends(require_module("teams"))])
def export_idcard_team(team_id: int, db: Session = Depends(get_db)):
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    if not team.is_active:
        raise HTTPException(400, "This team is inactive — ID cards are not available.")
    if not team.participants:
        raise HTTPException(404, "This team has no participants to generate cards for")
    # Coach + Manager cards always close out the download, after every
    # participant age group — see _team_staff_cards (blank placeholder cards
    # fill in for a role with no record on the team yet), drawn at their own
    # 8.2x11.5cm size (id_card.STAFF_SHEET_CARD_*_CM) and still
    # filling the last age group's sheet rather than forcing a fresh one
    # whenever there's room for them at that bigger size.
    groups = _team_card_groups(team.participants, team)
    pdf = id_card.build_pdf_sheets_with_staff_tail(groups, _team_staff_cards(team), layout=id_card.A4_SHEET, dpi=id_card.PRINT_DPI)
    return _pdf_response(pdf, f"idcards-{_slug(team.name)}-{team.school_code or team.id}.pdf")


@router.get("/idcards/team/{team_id}/sheet-12x18.pdf", dependencies=[Depends(require_module("teams"))])
def export_idcard_team_12x18(team_id: int, db: Session = Depends(get_db)):
    """Same per-team card set as /idcards/team/{id}.pdf, laid out on 12x18in
    print-shop stock instead of A4 (id_card.SHEET_12X18) — 12 cards/sheet
    instead of 6, for shops printing larger runs on bigger paper."""
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    if not team.is_active:
        raise HTTPException(400, "This team is inactive — ID cards are not available.")
    if not team.participants:
        raise HTTPException(404, "This team has no participants to generate cards for")
    groups = _team_card_groups(team.participants, team)
    pdf = id_card.build_pdf_sheets_with_staff_tail(groups, _team_staff_cards(team), layout=id_card.SHEET_12X18, dpi=id_card.PRINT_DPI)
    return _pdf_response(pdf, f"idcards-{_slug(team.name)}-{team.school_code or team.id}-12x18.pdf")


@router.get("/idcards/team/{team_id}/individual.zip", dependencies=[Depends(require_module("teams"))])
def export_idcard_team_individual(team_id: int, db: Session = Depends(get_db)):
    """Same per-team card set as /idcards/team/{id}.pdf, but as a ZIP of one
    standalone PDF per card instead of a flattened sheet — for print/design
    software (CorelDRAW, Illustrator, InDesign, ...) where cards are picked
    and placed individually onto a custom layout rather than printed as-is."""
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    if not team.is_active:
        raise HTTPException(400, "This team is inactive — ID cards are not available.")
    if not team.participants:
        raise HTTPException(404, "This team has no participants to generate cards for")
    files = _individual_card_files(team.participants, {team.id: team}) + _team_staff_card_files(team)
    return _zip_response(files, f"idcards-{_slug(team.name)}-{team.school_code or team.id}-individual.zip")


@router.get("/idcards/all.pdf", dependencies=[Depends(require_module("teams"))])
def export_idcard_all(db: Session = Depends(get_db)):
    teams = {t.id: t for t in db.query(models.Team).all()}
    participants = (
        db.query(models.Participant)
        .order_by(models.Participant.team_id)
        .all()
    )
    participants = _active_participants(participants)
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
    participants = _active_participants(participants)
    if not participants:
        raise HTTPException(404, "No participants to generate cards for")
    files = _individual_card_files(participants, teams)
    return _zip_response(files, "idcards-all-teams-individual.zip")


def _coach_photo_path(coach: models.Coach):
    if not coach.photo_filename:
        return None
    return ASSETS_COACHES_DIR / coach.photo_filename


@router.get("/idcards/coach/{coach_id}.pdf", dependencies=[Depends(require_module("teams"))])
def export_idcard_coach(coach_id: int, db: Session = Depends(get_db)):
    """One coach/manager's own card, centered on its own full page (a custom
    small-badge size, see id_card.STAFF_PAGE_WIDTH_CM/HEIGHT_CM) — see
    id_card.render_staff_id_card_page. Organizer-only: unlike participants,
    Coach/Manager cards carry an Aadhaar number, so this is deliberately not
    exposed anywhere on the public team portal — only from this admin-gated
    route (require_module("teams"))."""
    coach = db.get(models.Coach, coach_id)
    if not coach:
        raise HTTPException(404, "Coach not found")
    if not coach.team.is_active:
        raise HTTPException(400, "This team is inactive — ID cards are not available.")
    page = id_card.render_staff_id_card_page(coach, coach.team, _coach_photo_path(coach))
    pdf = id_card.build_pdf([page])
    role_slug = (coach.role or "coach").lower()
    return _pdf_response(pdf, f"{role_slug}-idcard-{_slug(coach.team.name)}-{coach.id}.pdf")


# Coach/Manager-sized grids (id_card.staff_sheet_layout), not the plain
# participant A4_SHEET/SHEET_12X18 — this bulk download is entirely Coach/
# Manager cards, so every card on it gets the Coach/Manager size
# (id_card.STAFF_SHEET_CARD_*_CM), same as when they're tiled alongside
# participants in a team's own download.
_BLANK_STAFF_SHEET_LAYOUTS = {
    "a4": id_card.staff_sheet_layout(id_card.A4_SHEET),
    "12x18": id_card.staff_sheet_layout(id_card.SHEET_12X18),
}


@router.get("/idcards/blank/staff.pdf", dependencies=[Depends(require_module("teams"))])
def export_blank_staff_idcards(
    role: str = Query("Coach", pattern="^(Coach|Manager|Participant|Volunteer|Official)$"),
    count: int = Query(..., gt=0, le=500),
    sheet: str = Query("a4", pattern="^(a4|12x18|a7)$"),
):
    """Pre-printing stock: `count` blank copies of the Coach or Manager
    template (no photo/name filled in — id_card.render_blank_staff_card).
    "a4"/"12x18" tile them edge-to-edge (zero gap/margin, never overlapping
    — see SheetLayout) onto grid sheets of that paper at the Coach/Manager
    card size (_BLANK_STAFF_SHEET_LAYOUTS), chunked across as many sheets as
    `count` needs — e.g. 20 cards on "12x18" fills one full sheet plus
    however many that layout's cards_per_sheet leaves for a second; "a7"
    instead gives one card per own page at the custom single-card size
    (id_card.STAFF_PAGE_WIDTH_CM/HEIGHT_CM) — same treatment as the
    single-card download, just repeated `count` times in one multi-page PDF.
    Stateless — no coach/team records involved, just the raw template, for
    an admin who wants physical blank cards ready before anyone's assigned."""
    if role in ("Participant", "Volunteer", "Official"):
        # Same sizes as the filled cards: 6.6x11.5cm single page (8.2x11.5 for
        # Official), or the matching A4/12x18 grids the filled sheets use.
        if sheet == "a7":
            pdf = id_card.build_pdf([id_card.render_blank_participant_card_page(role)] * count)
        else:
            layout = id_card.A4_SHEET if sheet == "a4" else id_card.SHEET_12X18
            if role == "Official":  # Coach/Manager-sized cards
                layout = id_card.staff_sheet_layout(layout)
            blank = id_card.render_blank_participant_card(role)
            pdf = id_card.build_pdf_sheets([[blank] * count], layout=layout, dpi=id_card.PRINT_DPI)
    elif sheet == "a7":
        page = id_card.render_blank_staff_card_page(role)
        pdf = id_card.build_pdf([page] * count)
    else:
        blank = id_card.render_blank_staff_card(role)
        pdf = id_card.build_pdf_sheets([[blank] * count], layout=_BLANK_STAFF_SHEET_LAYOUTS[sheet], dpi=id_card.PRINT_DPI)
    return _pdf_response(pdf, f"blank-{role.lower()}-idcards-{sheet}.pdf")


@router.get("/idcards/back.pdf", dependencies=[Depends(require_module("teams"))])
def export_idcard_back(
    size: str = Query("participant", pattern="^(participant|staff)$"),
    count: int = Query(1, gt=0, le=500),
    sheet: str = Query("a7", pattern="^(a4|12x18|a7)$"),
):
    """The shared ID card back (id_card.render_id_back), `count` copies, in
    the size matching the fronts: "participant" (Participant/Volunteer,
    6.6x11.5cm) or "staff" (Coach/Manager/Official, 8.2x11.5cm). "a7" = one
    per page at that card size; "a4"/"12x18" tile onto the same grids the
    fronts use (staff_sheet_layout for "staff")."""
    if sheet == "a7":
        pdf = id_card.build_pdf([id_card.render_id_back_page(size)] * count)
    else:
        layout = id_card.A4_SHEET if sheet == "a4" else id_card.SHEET_12X18
        if size == "staff":
            layout = id_card.staff_sheet_layout(layout)
        pdf = id_card.build_pdf_sheets([[id_card.render_id_back()] * count], layout=layout, dpi=id_card.PRINT_DPI)
    return _pdf_response(pdf, f"idcard-back-{size}-{sheet}.pdf")


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
