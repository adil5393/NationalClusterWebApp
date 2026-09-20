"""Staff Operations Reports — organizer-wide operational reporting and executive XLSX workbooks.

Provides 8 official reports:
1. Staff Master Report (Directory with credentials linkage status, sans password hashes)
2. Shift Roster Report (Date -> ShiftBlock -> Staff; includes unassigned staff)
3. Operational Area Report (ShiftBlock -> Area -> In-Charges -> Staff/Duties; non-inflated staff count)
4. In-Charge Report (Leadership responsibilities & distinct reporting staff)
5. Duty Assignment Report (Detailed duty log with outside-shift overflow and fallback labels)
6. Task Report (Tasks with derived overdue detection)
7. Individual Staff Report (Comprehensive work plan & reporting hierarchy for a single staff member)
8. Operational Issues Report (Diagnostic detection of gaps, unassigned duties, missing in-charges, outside shift, overdue tasks)

Gated strictly by require_staff_operator — self-service staff accounts cannot access these endpoints.
"""
from collections import defaultdict
from datetime import datetime, date, timedelta, timezone
import io
from typing import Any, Dict, List, Optional, Set, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill
from openpyxl.worksheet.worksheet import Worksheet
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..config import to_event_tz
from ..pdf_report import build_table_pdf
from .event_locations import resolve_duty_location_hierarchy, resolve_location_display
from ..excel_styler import (
    ALIGN_CENTER,
    ALIGN_HEADER_CENTER,
    ALIGN_HEADER_LEFT,
    ALIGN_HEADER_RIGHT,
    ALIGN_LEFT,
    ALIGN_RIGHT,
    BORDER_CELL,
    BORDER_HEADER,
    CLR_AMBER_BG,
    CLR_AMBER_TEXT,
    CLR_GRAY_BG,
    CLR_GRAY_TEXT,
    CLR_GREEN_BG,
    CLR_GREEN_TEXT,
    CLR_OBSIDIAN,
    CLR_RED_BG,
    CLR_RED_TEXT,
    CLR_SLATE_50,
    CLR_SLATE_200,
    CLR_SLATE_800,
    CLR_WHITE,
    FILL_BANNER,
    FILL_KPI_CARD,
    FILL_SECTION,
    FILL_TH_PRIMARY,
    FILL_TH_SECONDARY,
    FILL_ZEBRA_EVEN,
    FILL_ZEBRA_ODD,
    FONT_FAMILY,
    FONT_TD,
    FONT_TD_BOLD,
    FONT_TD_MUTED,
    FONT_TH,
    auto_fit_columns,
    enable_sheet_ergonomics,
    style_footer,
    style_header_banner,
    style_kpi_cards,
    style_section_bar,
)
from ..security import require_staff_operator

router = APIRouter(prefix="/api/staff-reports", tags=["staff-reports"])

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


# ---------------------------------------------------------------------------
# Query & Calculation Utilities
# ---------------------------------------------------------------------------

def _normalize_dt(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _duty_shift_overflow_minutes(duty: models.DutyAssignment) -> int | None:
    """Calculate minutes duty extends outside shift window."""
    shift = duty.shift
    if not shift or (not duty.start_time and not duty.end_time):
        return None
    d_start = _normalize_dt(duty.start_time)
    d_end = _normalize_dt(duty.end_time)
    s_start = _normalize_dt(shift.start_time)
    s_end = _normalize_dt(shift.end_time)
    minutes = 0
    if d_start and s_start and d_start < s_start:
        minutes += int((s_start - d_start).total_seconds() // 60)
    if d_end and s_end and d_end > s_end:
        minutes += int((d_end - s_end).total_seconds() // 60)
    return minutes or None


def _duty_location_name(duty: models.DutyAssignment) -> str:
    """Live display name for a duty's location — resolved through the
    linked Mat/Building/Room when duty.location is a wrapper (see
    routers/event_locations.py resolve_location_display), a standalone
    EventLocation's own name, or the true-legacy direct Room reference
    (duty.room, no EventLocation at all). "Not Assigned" only when neither
    is set, matching this report's existing display convention."""
    if duty.location:
        return resolve_location_display(duty.location)["name"]
    if duty.room:
        floor = duty.room.floor
        building = floor.building if floor else None
        return f"{building.name} · {duty.room.name}" if building else duty.room.name
    return "Not Assigned"


def _format_time_span(start: datetime | None, end: datetime | None) -> str:
    if not start and not end:
        return "Not Scheduled"
    start_tz = to_event_tz(start)
    end_tz = to_event_tz(end)
    st_str = start_tz.strftime("%H:%M") if start_tz else "—"
    end_str = end_tz.strftime("%H:%M") if end_tz else "—"
    return f"{st_str} - {end_str}"


def _format_date(dt: datetime | None) -> str:
    if not dt:
        return "—"
    dt_tz = to_event_tz(dt)
    return dt_tz.strftime("%Y-%m-%d")


def _get_incharges_map(db: Session) -> Dict[Tuple[int, int], List[models.StaffMember]]:
    """Map of (shift_block_id, operational_area_id) -> list of in-charge StaffMembers."""
    rows = (
        db.query(models.ShiftOperationalIncharge)
        .options(joinedload(models.ShiftOperationalIncharge.staff))
        .all()
    )
    res: Dict[Tuple[int, int], List[models.StaffMember]] = defaultdict(list)
    for r in rows:
        if r.staff:
            res[(r.shift_block_id, r.operational_area_id)].append(r.staff)
    return res


def _get_tasks_by_staff_and_shift_block(db: Session) -> Dict[Tuple[Optional[int], Optional[int]], List[Dict[str, Any]]]:
    """Every Task, indexed by (assigned_staff_id, shift_block_id) — lets the
    Duty Report (_query_duty_assignments) surface each duty's own tasks
    inline, instead of a separate Task Audit lookup. Keyed by shift_block_id
    rather than Task.shift_id: a DutyAssignment and a Task can each point at
    a different StaffShift row within the same ShiftBlock, and matching at
    the block level is what actually ties a task to "this duty's shift" the
    way an organizer means it. A task with no shift (shift_block_id None) is
    a general to-do for that staff member and only surfaces on that staff's
    own shiftless duty rows, for the same reason — it isn't tied to any one
    of their shifts specifically."""
    now = datetime.now(timezone.utc)
    tasks = db.query(models.Task).options(joinedload(models.Task.shift)).all()
    index: Dict[Tuple[Optional[int], Optional[int]], List[Dict[str, Any]]] = defaultdict(list)
    for t in tasks:
        shift_block_id = t.shift.shift_block_id if t.shift else None
        is_completed = (t.status == "completed")
        is_overdue = False
        if t.due_date and not is_completed:
            dt = t.due_date if t.due_date.tzinfo else t.due_date.replace(tzinfo=timezone.utc)
            if dt < now:
                is_overdue = True

        index[(t.assigned_staff_id, shift_block_id)].append({
            "id": t.id,
            "title": t.title,
            "status": t.status,
            "priority": t.priority or "normal",
            "category": t.category or "General",
            "is_overdue": is_overdue,
            "due_date_display": _format_date(t.due_date) if t.due_date else "No Due Date",
            "due_date_iso": t.due_date.isoformat() if t.due_date else None,
        })
    return index


# ---------------------------------------------------------------------------
# Filter Metadata Endpoint
# ---------------------------------------------------------------------------

@router.get("/meta")
def get_reports_metadata(db: Session = Depends(get_db)):
    """Returns dynamic filter options for Staff Operations Reports."""
    shifts = (
        db.query(models.ShiftBlock)
        .order_by(models.ShiftBlock.start_time.asc())
        .all()
    )
    staff = (
        db.query(models.StaffMember)
        .order_by(models.StaffMember.full_name.asc())
        .all()
    )
    areas = (
        db.query(models.OperationalArea)
        .filter(models.OperationalArea.is_active.is_(True))
        .order_by(models.OperationalArea.sort_order.asc(), models.OperationalArea.name.asc())
        .all()
    )
    locations = (
        db.query(models.EventLocation)
        .filter(models.EventLocation.is_active.is_(True))
        .order_by(models.EventLocation.sort_order.asc(), models.EventLocation.name.asc())
        .all()
    )

    categories = sorted({s.category for s in staff if s.category})
    if not categories:
        categories = list(schemas.STAFF_CATEGORIES)

    task_categories = [
        c[0] for c in db.query(models.Task.category).distinct().order_by(models.Task.category.asc()).all() if c[0]
    ]

    return {
        "shift_blocks": [
            {"id": s.id, "name": s.name, "date": _format_date(s.start_time), "start": s.start_time.isoformat() if s.start_time else None, "end": s.end_time.isoformat() if s.end_time else None}
            for s in shifts
        ],
        "staff_members": [
            {"id": sm.id, "full_name": sm.full_name, "category": sm.category, "phone": sm.phone}
            for sm in staff
        ],
        "staff_categories": categories,
        "operational_areas": [
            {"id": a.id, "name": a.name, "code": a.code}
            for a in areas
        ],
        "locations": [
            {"id": l.id, **resolve_location_display(l)}
            for l in locations
        ],
        "task_categories": task_categories,
        "task_statuses": ["pending", "in_progress", "completed"],
        "task_priorities": ["low", "normal", "high", "urgent"],
        "issue_types": [
            "STAFF_WITHOUT_DUTY",
            "AREA_WITHOUT_INCHARGE",
            "DUTY_WITHOUT_AREA",
            "DUTY_WITHOUT_LOCATION",
            "DUTY_OUTSIDE_SHIFT",
            "TASK_OVERDUE",
            "TASK_UNASSIGNED",
            "ORPHANED_INCHARGE",
        ],
    }


# ---------------------------------------------------------------------------
# 1. Staff Master Report
# ---------------------------------------------------------------------------

def _query_staff_master(db: Session, category: Optional[str] = None, staff_id: Optional[int] = None) -> List[Dict[str, Any]]:
    q = db.query(models.StaffMember).options(joinedload(models.StaffMember.organizer_users))
    if category:
        q = q.filter(models.StaffMember.category == category)
    if staff_id:
        q = q.filter(models.StaffMember.id == staff_id)
    staff_members = q.order_by(models.StaffMember.full_name.asc()).all()

    results = []
    for s in staff_members:
        linked_user = s.organizer_users[0] if s.organizer_users else None
        results.append({
            "id": s.id,
            "full_name": s.full_name,
            "category": s.category or "General",
            "phone": s.phone or "—",
            "email": s.email or "—",
            "login_linked": bool(linked_user),
            "username": linked_user.username if linked_user else "—",
            "is_active": linked_user.is_active if linked_user else None,
            "notes": s.notes or "",
        })
    return results


@router.get("/staff-master")
def get_staff_master_report(
    category: Optional[str] = Query(None),
    staff_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    rows = _query_staff_master(db, category, staff_id)
    return {"total": len(rows), "rows": rows}


@router.get("/staff-master.xlsx")
def export_staff_master_xlsx(
    category: Optional[str] = Query(None),
    staff_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    rows = _query_staff_master(db, category, staff_id)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Staff Master"
    max_cols = 7

    next_row = style_header_banner(
        ws,
        tournament_name="STAFF OPERATIONS MASTER DIRECTORY",
        subtitle="Complete Staff Personnel, Deployment Category & System Access Roster",
        badge_text="OFFICIAL STAFF MASTER",
        max_col=max_cols,
        start_row=1,
    )

    total_s = len(rows)
    linked_s = sum(1 for r in rows if r["login_linked"])
    unique_cats = len({r["category"] for r in rows})
    active_logins = sum(1 for r in rows if r["is_active"] is True)

    cards = [
        ("Total Staff", total_s, "Registered Personnel"),
        ("Categories", unique_cats, "Functional Areas"),
        ("Logins Linked", linked_s, "Portal Accounts"),
        ("Active Logins", active_logins, "Enabled Access"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)
    next_row = style_section_bar(ws, "Staff Master Directory", next_row, max_col=max_cols, icon="👥")

    headers = [
        ("STAFF NAME", 24, ALIGN_HEADER_LEFT),
        ("CATEGORY", 18, ALIGN_HEADER_LEFT),
        ("PHONE", 16, ALIGN_HEADER_CENTER),
        ("EMAIL", 26, ALIGN_HEADER_LEFT),
        ("LOGIN LINKED", 14, ALIGN_HEADER_CENTER),
        ("USERNAME", 18, ALIGN_HEADER_LEFT),
        ("ACCOUNT STATUS", 16, ALIGN_HEADER_CENTER),
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
        status_label = "ACTIVE" if r["is_active"] is True else ("INACTIVE" if r["is_active"] is False else "NO LOGIN")

        row_data = [
            (r["full_name"], ALIGN_LEFT, FONT_TD_BOLD),
            (r["category"], ALIGN_LEFT, FONT_TD),
            (r["phone"], ALIGN_CENTER, FONT_TD),
            (r["email"], ALIGN_LEFT, FONT_TD),
            ("YES" if r["login_linked"] else "NO", ALIGN_CENTER, FONT_TD_BOLD),
            (r["username"], ALIGN_LEFT, FONT_TD),
            (status_label, ALIGN_CENTER, FONT_TD_BOLD),
        ]
        for col_idx, (val, align, font) in enumerate(row_data, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_row += 1

    style_footer(ws, next_row + 1, max_col=max_cols)
    auto_fit_columns(ws, min_width=10, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws, freeze_pane="A7")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="staff_master_report.xlsx"'},
    )


# ---------------------------------------------------------------------------
# 2. Shift Roster Report
# ---------------------------------------------------------------------------

def _query_shift_roster(
    db: Session,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    shift_block_id: Optional[int] = None,
    staff_id: Optional[int] = None,
    category: Optional[str] = None,
    operational_area_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Who is working in each shift and what are they doing?
    CRITICAL: Staff assigned to a ShiftBlock MUST appear even when they have NO duty.
    """
    incharges_map = _get_incharges_map(db)

    sb_query = db.query(models.ShiftBlock).filter(models.ShiftBlock.status != "CANCELLED")
    if shift_block_id:
        sb_query = sb_query.filter(models.ShiftBlock.id == shift_block_id)
    if date_from:
        try:
            df = datetime.fromisoformat(date_from).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
            sb_query = sb_query.filter(models.ShiftBlock.end_time >= df)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc)
            sb_query = sb_query.filter(models.ShiftBlock.start_time <= dt)
        except ValueError:
            pass

    shift_blocks = sb_query.order_by(models.ShiftBlock.start_time.asc()).all()
    shift_block_ids = [sb.id for sb in shift_blocks]

    if not shift_block_ids:
        return []

    ss_query = (
        db.query(models.StaffShift)
        .filter(models.StaffShift.shift_block_id.in_(shift_block_ids))
        .options(
            joinedload(models.StaffShift.staff),
            joinedload(models.StaffShift.shift_block),
            joinedload(models.StaffShift.duties).joinedload(models.DutyAssignment.operational_area),
            joinedload(models.StaffShift.duties).joinedload(models.DutyAssignment.location),
        )
    )
    if staff_id:
        ss_query = ss_query.filter(models.StaffShift.staff_id == staff_id)
    if category:
        ss_query = ss_query.join(models.StaffMember, models.StaffShift.staff_id == models.StaffMember.id).filter(
            models.StaffMember.category == category
        )

    staff_shifts = ss_query.order_by(models.StaffShift.shift_block_id.asc(), models.StaffShift.id.asc()).all()

    rows = []
    for ss in staff_shifts:
        sb = ss.shift_block
        staff = ss.staff
        if not sb or not staff:
            continue

        duties = ss.duties
        if operational_area_id:
            duties = [d for d in duties if d.operational_area_id == operational_area_id]

        if not duties:
            if operational_area_id is not None:
                continue
            # CRITICAL: A staff member assigned to a ShiftBlock MUST appear even when they have NO DUTY!
            rows.append({
                "date": _format_date(sb.start_time),
                "shift_id": sb.id,
                "shift_name": sb.name,
                "shift_start": sb.start_time.isoformat() if sb.start_time else None,
                "shift_end": sb.end_time.isoformat() if sb.end_time else None,
                "shift_time_span": _format_time_span(sb.start_time, sb.end_time),
                "staff_id": staff.id,
                "staff_name": staff.full_name,
                "category": staff.category or "General",
                "phone": staff.phone or "—",
                "operational_area_id": None,
                "operational_area": "—",
                "specific_duty": "Not Assigned",
                "duty_start": None,
                "duty_end": None,
                "duty_time_span": "—",
                "location_id": None,
                "location": "—",
                "incharges": "—",
                "incharges_phones": "—",
                "outside_shift_warning": None,
                "overflow_minutes": None,
                "has_duty": False,
            })
        else:
            for d in duties:
                overflow = _duty_shift_overflow_minutes(d)
                inc_list = incharges_map.get((sb.id, d.operational_area_id), []) if d.operational_area_id else []
                inc_names = ", ".join(inc.full_name for inc in inc_list) if inc_list else "—"
                inc_phones = ", ".join(inc.phone for inc in inc_list if inc.phone) if inc_list else "—"

                rows.append({
                    "date": _format_date(sb.start_time),
                    "shift_id": sb.id,
                    "shift_name": sb.name,
                    "shift_start": sb.start_time.isoformat() if sb.start_time else None,
                    "shift_end": sb.end_time.isoformat() if sb.end_time else None,
                    "shift_time_span": _format_time_span(sb.start_time, sb.end_time),
                    "staff_id": staff.id,
                    "staff_name": staff.full_name,
                    "category": staff.category or "General",
                    "phone": staff.phone or "—",
                    "operational_area_id": d.operational_area_id,
                    "operational_area": d.operational_area.name if d.operational_area else "Unclassified",
                    "specific_duty": d.duty_type or "General Duty",
                    "duty_start": d.start_time.isoformat() if d.start_time else None,
                    "duty_end": d.end_time.isoformat() if d.end_time else None,
                    "duty_time_span": _format_time_span(d.start_time, d.end_time),
                    "location_id": d.location_id,
                    "location": _duty_location_name(d),
                    "incharges": inc_names,
                    "incharges_phones": inc_phones,
                    "outside_shift_warning": f"+{overflow}m Outside Shift" if overflow else None,
                    "overflow_minutes": overflow,
                    "has_duty": True,
                })

    return rows


@router.get("/shift-roster")
def get_shift_roster_report(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    shift_block_id: Optional[int] = Query(None),
    staff_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    operational_area_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    rows = _query_shift_roster(
        db,
        date_from=date_from,
        date_to=date_to,
        shift_block_id=shift_block_id,
        staff_id=staff_id,
        category=category,
        operational_area_id=operational_area_id,
    )
    return {"total": len(rows), "rows": rows}


@router.get("/shift-roster.xlsx")
def export_shift_roster_xlsx(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    shift_block_id: Optional[int] = Query(None),
    staff_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    operational_area_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    rows = _query_shift_roster(
        db,
        date_from=date_from,
        date_to=date_to,
        shift_block_id=shift_block_id,
        staff_id=staff_id,
        category=category,
        operational_area_id=operational_area_id,
    )

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Shift Roster"
    max_cols = 12

    next_row = style_header_banner(
        ws,
        tournament_name="TOURNAMENT SHIFT ROSTER & DEPLOYMENT",
        subtitle="Shift-by-Shift Staff Roster, Duty Allocations & Lead In-Charges",
        badge_text="OFFICIAL SHIFT ROSTER",
        max_col=max_cols,
        start_row=1,
    )

    total_records = len(rows)
    distinct_staff = len({r["staff_id"] for r in rows})
    unassigned_count = sum(1 for r in rows if not r["has_duty"])
    outside_shift_count = sum(1 for r in rows if r["overflow_minutes"])

    cards = [
        ("Total Roster Rows", total_records, "Staff Deployments"),
        ("Distinct Staff", distinct_staff, "Assigned to Shifts"),
        ("No Duty Assigned", unassigned_count, "Staffing Gaps"),
        ("Outside Shift Duties", outside_shift_count, "Extended Windows"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)
    next_row = style_section_bar(ws, "Workforce Shift Deployment", next_row, max_col=max_cols, icon="🕒")

    headers = [
        ("DATE", 12, ALIGN_HEADER_CENTER),
        ("SHIFT NAME", 20, ALIGN_HEADER_LEFT),
        ("SHIFT TIME", 16, ALIGN_HEADER_CENTER),
        ("STAFF NAME", 22, ALIGN_HEADER_LEFT),
        ("CATEGORY", 16, ALIGN_HEADER_LEFT),
        ("PHONE", 15, ALIGN_HEADER_CENTER),
        ("OPERATIONAL AREA", 22, ALIGN_HEADER_LEFT),
        ("SPECIFIC DUTY", 20, ALIGN_HEADER_LEFT),
        ("DUTY TIME", 16, ALIGN_HEADER_CENTER),
        ("LOCATION", 18, ALIGN_HEADER_LEFT),
        ("IN-CHARGE(S)", 20, ALIGN_HEADER_LEFT),
        ("NOTES / WARNING", 20, ALIGN_HEADER_CENTER),
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
        if not r["has_duty"]:
            fill = PatternFill("solid", fgColor=CLR_AMBER_BG)

        warning_text = r["outside_shift_warning"] or ("No Duty Assigned" if not r["has_duty"] else "—")
        row_data = [
            (r["date"], ALIGN_CENTER, FONT_TD),
            (r["shift_name"], ALIGN_LEFT, FONT_TD_BOLD),
            (r["shift_time_span"], ALIGN_CENTER, FONT_TD),
            (r["staff_name"], ALIGN_LEFT, FONT_TD_BOLD),
            (r["category"], ALIGN_LEFT, FONT_TD),
            (r["phone"], ALIGN_CENTER, FONT_TD),
            (r["operational_area"], ALIGN_LEFT, FONT_TD),
            (r["specific_duty"], ALIGN_LEFT, FONT_TD_BOLD if not r["has_duty"] else FONT_TD),
            (r["duty_time_span"], ALIGN_CENTER, FONT_TD),
            (r["location"], ALIGN_LEFT, FONT_TD),
            (r["incharges"], ALIGN_LEFT, FONT_TD),
            (warning_text, ALIGN_CENTER, FONT_TD_BOLD if (not r["has_duty"] or r["overflow_minutes"]) else FONT_TD),
        ]
        for col_idx, (val, align, font) in enumerate(row_data, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_row += 1

    style_footer(ws, next_row + 1, max_col=max_cols)
    auto_fit_columns(ws, min_width=10, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws, freeze_pane="A7")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="shift_roster_report.xlsx"'},
    )


# ---------------------------------------------------------------------------
# 3. Operational Area Report
# ---------------------------------------------------------------------------

def _query_operational_area_report(
    db: Session,
    target_date: Optional[str] = None,
    shift_block_id: Optional[int] = None,
    operational_area_id: Optional[int] = None,
    staff_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Structure: ShiftBlock -> Operational Area -> In-Charges -> Staff/Duties
    CRITICAL: Avoid inflating distinct staff counts when a staff member has multiple duties in the same area.
    """
    incharges_map = _get_incharges_map(db)

    duties_q = (
        db.query(models.DutyAssignment)
        .join(models.StaffShift, models.DutyAssignment.shift_id == models.StaffShift.id)
        .join(models.ShiftBlock, models.StaffShift.shift_block_id == models.ShiftBlock.id)
        .options(
            joinedload(models.DutyAssignment.staff),
            joinedload(models.DutyAssignment.shift).joinedload(models.StaffShift.shift_block),
            joinedload(models.DutyAssignment.operational_area),
            joinedload(models.DutyAssignment.location),
        )
    )

    if shift_block_id:
        duties_q = duties_q.filter(models.StaffShift.shift_block_id == shift_block_id)
    if operational_area_id:
        duties_q = duties_q.filter(models.DutyAssignment.operational_area_id == operational_area_id)
    if staff_id:
        duties_q = duties_q.filter(models.DutyAssignment.staff_id == staff_id)

    if target_date:
        try:
            d_start = datetime.fromisoformat(target_date).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
            d_end = datetime.fromisoformat(target_date).replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc)
            duties_q = duties_q.filter(models.ShiftBlock.start_time <= d_end, models.ShiftBlock.end_time >= d_start)
        except ValueError:
            pass

    duties = duties_q.order_by(models.ShiftBlock.start_time.asc(), models.DutyAssignment.operational_area_id.asc(), models.DutyAssignment.id.asc()).all()

    grouped = defaultdict(lambda: defaultdict(list))
    for d in duties:
        sb = d.shift.shift_block
        area_id = d.operational_area_id or 0
        grouped[sb.id][area_id].append(d)

    area_objects = {a.id: a for a in db.query(models.OperationalArea).all()}
    shift_objects = {sb.id: sb for sb in db.query(models.ShiftBlock).all()}

    blocks_output = []
    flat_rows = []

    for sb_id, areas_dict in grouped.items():
        sb = shift_objects.get(sb_id)
        if not sb:
            continue

        areas_list = []
        for a_id, duty_list in areas_dict.items():
            area_obj = area_objects.get(a_id) if a_id != 0 else None
            area_name = area_obj.name if area_obj else "Unclassified"
            inc_list = incharges_map.get((sb.id, a_id), []) if a_id != 0 else []
            inc_names = [inc.full_name for inc in inc_list]
            inc_phones = [inc.phone for inc in inc_list if inc.phone]

            # Distinct staff count for this area (non-inflated)
            distinct_staff_ids = {d.staff_id for d in duty_list}

            staff_duty_rows = []
            for d in duty_list:
                row = {
                    "duty_id": d.id,
                    "staff_id": d.staff_id,
                    "staff_name": d.staff.full_name if d.staff else "—",
                    "staff_phone": d.staff.phone if d.staff else "—",
                    "category": d.staff.category if d.staff else "—",
                    "specific_duty": d.duty_type,
                    "duty_time_span": _format_time_span(d.start_time, d.end_time),
                    "location": _duty_location_name(d),
                }
                staff_duty_rows.append(row)
                flat_rows.append({
                    "date": _format_date(sb.start_time),
                    "shift_name": sb.name,
                    "shift_time_span": _format_time_span(sb.start_time, sb.end_time),
                    "operational_area": area_name,
                    "incharges": ", ".join(inc_names) if inc_names else "—",
                    "incharges_phones": ", ".join(inc_phones) if inc_phones else "—",
                    "staff_name": row["staff_name"],
                    "staff_phone": row["staff_phone"],
                    "category": row["category"],
                    "specific_duty": row["specific_duty"],
                    "duty_time": row["duty_time_span"],
                    "location": row["location"],
                })

            areas_list.append({
                "operational_area_id": a_id if a_id != 0 else None,
                "operational_area_name": area_name,
                "incharges": inc_names,
                "incharges_phones": inc_phones,
                "distinct_staff_count": len(distinct_staff_ids),
                "total_duties_count": len(duty_list),
                "duties": staff_duty_rows,
            })

        blocks_output.append({
            "shift_block_id": sb.id,
            "shift_name": sb.name,
            "date": _format_date(sb.start_time),
            "start_time": sb.start_time.isoformat() if sb.start_time else None,
            "end_time": sb.end_time.isoformat() if sb.end_time else None,
            "time_span": _format_time_span(sb.start_time, sb.end_time),
            "areas": areas_list,
        })

    return {
        "total_shifts": len(blocks_output),
        "total_records": len(flat_rows),
        "shifts": blocks_output,
        "flat_rows": flat_rows,
    }


@router.get("/operational-areas")
def get_operational_areas_report(
    date: Optional[str] = Query(None),
    shift_block_id: Optional[int] = Query(None),
    operational_area_id: Optional[int] = Query(None),
    staff_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    return _query_operational_area_report(
        db,
        target_date=date,
        shift_block_id=shift_block_id,
        operational_area_id=operational_area_id,
        staff_id=staff_id,
    )


@router.get("/operational-areas.xlsx")
def export_operational_areas_xlsx(
    date: Optional[str] = Query(None),
    shift_block_id: Optional[int] = Query(None),
    operational_area_id: Optional[int] = Query(None),
    staff_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    data = _query_operational_area_report(
        db,
        target_date=date,
        shift_block_id=shift_block_id,
        operational_area_id=operational_area_id,
        staff_id=staff_id,
    )
    rows = data["flat_rows"]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Operational Areas"
    max_cols = 11

    next_row = style_header_banner(
        ws,
        tournament_name="OPERATIONAL TEAM & RESPONSIBILITY REPORT",
        subtitle="Workforce Distribution across Operational Areas, Leads & Specific Duties",
        badge_text="OFFICIAL TEAM REPORT",
        max_col=max_cols,
        start_row=1,
    )

    total_deployments = len(rows)
    distinct_teams = len({r["operational_area"] for r in rows})
    distinct_staff = len({r["staff_name"] for r in rows})
    distinct_shifts = len({r["shift_name"] for r in rows})

    cards = [
        ("Total Deployments", total_deployments, "Duty Records"),
        ("Operational Teams", distinct_teams, "Active Areas"),
        ("Distinct Staff", distinct_staff, "Deployed"),
        ("Shift Blocks", distinct_shifts, "Operating Windows"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)
    next_row = style_section_bar(ws, "Operational Teams Deployment", next_row, max_col=max_cols, icon="🏢")

    headers = [
        ("DATE", 12, ALIGN_HEADER_CENTER),
        ("SHIFT", 18, ALIGN_HEADER_LEFT),
        ("OPERATIONAL AREA", 22, ALIGN_HEADER_LEFT),
        ("IN-CHARGE NAME(S)", 22, ALIGN_HEADER_LEFT),
        ("IN-CHARGE PHONE(S)", 18, ALIGN_HEADER_CENTER),
        ("STAFF NAME", 22, ALIGN_HEADER_LEFT),
        ("STAFF PHONE", 15, ALIGN_HEADER_CENTER),
        ("CATEGORY", 16, ALIGN_HEADER_LEFT),
        ("SPECIFIC DUTY", 20, ALIGN_HEADER_LEFT),
        ("DUTY TIME", 16, ALIGN_HEADER_CENTER),
        ("LOCATION", 18, ALIGN_HEADER_LEFT),
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
        row_data = [
            (r["date"], ALIGN_CENTER, FONT_TD),
            (r["shift_name"], ALIGN_LEFT, FONT_TD_BOLD),
            (r["operational_area"], ALIGN_LEFT, FONT_TD_BOLD),
            (r["incharges"], ALIGN_LEFT, FONT_TD),
            (r["incharges_phones"], ALIGN_CENTER, FONT_TD),
            (r["staff_name"], ALIGN_LEFT, FONT_TD_BOLD),
            (r["staff_phone"], ALIGN_CENTER, FONT_TD),
            (r["category"], ALIGN_LEFT, FONT_TD),
            (r["specific_duty"], ALIGN_LEFT, FONT_TD),
            (r["duty_time"], ALIGN_CENTER, FONT_TD),
            (r["location"], ALIGN_LEFT, FONT_TD),
        ]
        for col_idx, (val, align, font) in enumerate(row_data, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_row += 1

    style_footer(ws, next_row + 1, max_col=max_cols)
    auto_fit_columns(ws, min_width=10, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws, freeze_pane="A7")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="operational_area_report.xlsx"'},
    )


# ---------------------------------------------------------------------------
# 4. In-Charge Report
# ---------------------------------------------------------------------------

def _query_incharge_report(
    db: Session,
    staff_id: Optional[int] = None,
    shift_block_id: Optional[int] = None,
    operational_area_id: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Who is leading what?
    For every in-charge show: Staff Name, Phone, ShiftBlock, Date, Operational Area, Distinct Staff Reporting.
    One StaffMember may lead multiple Operational Areas and ShiftBlocks.
    """
    q = (
        db.query(models.ShiftOperationalIncharge)
        .options(
            joinedload(models.ShiftOperationalIncharge.staff),
            joinedload(models.ShiftOperationalIncharge.shift_block),
            joinedload(models.ShiftOperationalIncharge.operational_area),
        )
    )

    if staff_id:
        q = q.filter(models.ShiftOperationalIncharge.staff_id == staff_id)
    if shift_block_id:
        q = q.filter(models.ShiftOperationalIncharge.shift_block_id == shift_block_id)
    if operational_area_id:
        q = q.filter(models.ShiftOperationalIncharge.operational_area_id == operational_area_id)

    records = q.order_by(models.ShiftOperationalIncharge.shift_block_id.asc(), models.ShiftOperationalIncharge.operational_area_id.asc()).all()

    # Distinct reporting staff per (shift_block_id, operational_area_id)
    reporting_staff_map: Dict[Tuple[int, int], List[models.StaffMember]] = defaultdict(list)
    duties = (
        db.query(models.DutyAssignment)
        .join(models.StaffShift, models.DutyAssignment.shift_id == models.StaffShift.id)
        .options(joinedload(models.DutyAssignment.staff))
        .all()
    )
    seen_reporting: Set[Tuple[int, int, int]] = set()
    for d in duties:
        if not d.shift or not d.operational_area_id or not d.staff:
            continue
        key = (d.shift.shift_block_id, d.operational_area_id, d.staff_id)
        if key not in seen_reporting:
            seen_reporting.add(key)
            reporting_staff_map[(d.shift.shift_block_id, d.operational_area_id)].append(d.staff)

    rows = []
    for r in records:
        staff = r.staff
        sb = r.shift_block
        area = r.operational_area
        if not staff or not sb or not area:
            continue

        reporting_staff = reporting_staff_map.get((sb.id, area.id), [])
        staff_names = [s.full_name for s in reporting_staff]

        rows.append({
            "incharge_id": r.id,
            "staff_id": staff.id,
            "staff_name": staff.full_name,
            "phone": staff.phone or "—",
            "category": staff.category or "General",
            "shift_block_id": sb.id,
            "shift_name": sb.name,
            "date": _format_date(sb.start_time),
            "shift_time_span": _format_time_span(sb.start_time, sb.end_time),
            "operational_area_id": area.id,
            "operational_area": area.name,
            "distinct_staff_count": len(reporting_staff),
            "reporting_staff_names": ", ".join(staff_names) if staff_names else "None Assigned Yet",
        })

    return rows


@router.get("/incharges")
def get_incharge_report(
    staff_id: Optional[int] = Query(None),
    shift_block_id: Optional[int] = Query(None),
    operational_area_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    rows = _query_incharge_report(db, staff_id, shift_block_id, operational_area_id)
    return {"total": len(rows), "rows": rows}


@router.get("/incharges.xlsx")
def export_incharge_xlsx(
    staff_id: Optional[int] = Query(None),
    shift_block_id: Optional[int] = Query(None),
    operational_area_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    rows = _query_incharge_report(db, staff_id, shift_block_id, operational_area_id)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "In-Charges"
    max_cols = 8

    next_row = style_header_banner(
        ws,
        tournament_name="OPERATIONAL LEADERSHIP & IN-CHARGE REPORT",
        subtitle="Leadership Allocations by Shift Block & Operational Team with Reporting Staff",
        badge_text="OFFICIAL LEADERSHIP REPORT",
        max_col=max_cols,
        start_row=1,
    )

    total_leads = len(rows)
    distinct_leaders = len({r["staff_id"] for r in rows})
    total_reporting = sum(r["distinct_staff_count"] for r in rows)
    distinct_areas = len({r["operational_area_id"] for r in rows})

    cards = [
        ("Leadership Slots", total_leads, "Shift Assignments"),
        ("Distinct In-Charges", distinct_leaders, "Lead Coordinators"),
        ("Total Supervised", total_reporting, "Staff Assignments"),
        ("Areas Covered", distinct_areas, "Functional Teams"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)
    next_row = style_section_bar(ws, "Shift Operational In-Charges", next_row, max_col=max_cols, icon="🎖️")

    headers = [
        ("LEAD / IN-CHARGE", 22, ALIGN_HEADER_LEFT),
        ("PHONE", 16, ALIGN_HEADER_CENTER),
        ("DATE", 12, ALIGN_HEADER_CENTER),
        ("SHIFT BLOCK", 20, ALIGN_HEADER_LEFT),
        ("OPERATIONAL AREA", 22, ALIGN_HEADER_LEFT),
        ("DISTINCT STAFF REPORTING", 16, ALIGN_HEADER_CENTER),
        ("REPORTING STAFF NAMES", 35, ALIGN_HEADER_LEFT),
        ("CATEGORY", 16, ALIGN_HEADER_LEFT),
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
        row_data = [
            (r["staff_name"], ALIGN_LEFT, FONT_TD_BOLD),
            (r["phone"], ALIGN_CENTER, FONT_TD),
            (r["date"], ALIGN_CENTER, FONT_TD),
            (r["shift_name"], ALIGN_LEFT, FONT_TD),
            (r["operational_area"], ALIGN_LEFT, FONT_TD_BOLD),
            (r["distinct_staff_count"], ALIGN_CENTER, FONT_TD_BOLD),
            (r["reporting_staff_names"], ALIGN_LEFT, FONT_TD),
            (r["category"], ALIGN_LEFT, FONT_TD),
        ]
        for col_idx, (val, align, font) in enumerate(row_data, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_row += 1

    style_footer(ws, next_row + 1, max_col=max_cols)
    auto_fit_columns(ws, min_width=10, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws, freeze_pane="A7")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="incharge_report.xlsx"'},
    )


# ---------------------------------------------------------------------------
# 5. Duty Assignment Report
# ---------------------------------------------------------------------------

def _query_duty_assignments(
    db: Session,
    target_date: Optional[str] = None,
    shift_block_id: Optional[int] = None,
    staff_id: Optional[int] = None,
    category: Optional[str] = None,
    operational_area_id: Optional[int] = None,
    duty_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """One row per DutyAssignment.
    Fallbacks:
    Historical duty with no operational_area_id -> "Unclassified"
    Shiftless/emergency duty -> "No Shift / Emergency"
    Duty with no EventLocation -> "Not Assigned"
    NEVER hide these records!
    """
    incharges_map = _get_incharges_map(db)
    tasks_map = _get_tasks_by_staff_and_shift_block(db)

    q = (
        db.query(models.DutyAssignment)
        .options(
            joinedload(models.DutyAssignment.staff),
            joinedload(models.DutyAssignment.shift).joinedload(models.StaffShift.shift_block),
            joinedload(models.DutyAssignment.operational_area),
            joinedload(models.DutyAssignment.location).joinedload(models.EventLocation.room).joinedload(models.Room.floor).joinedload(models.Floor.building),
            joinedload(models.DutyAssignment.location).joinedload(models.EventLocation.building),
            joinedload(models.DutyAssignment.location).joinedload(models.EventLocation.mat),
            joinedload(models.DutyAssignment.room).joinedload(models.Room.floor).joinedload(models.Floor.building),
        )
    )

    if staff_id:
        q = q.filter(models.DutyAssignment.staff_id == staff_id)
    if operational_area_id:
        q = q.filter(models.DutyAssignment.operational_area_id == operational_area_id)
    if duty_type:
        q = q.filter(models.DutyAssignment.duty_type.ilike(f"%{duty_type}%"))

    if shift_block_id:
        q = q.join(models.StaffShift, models.DutyAssignment.shift_id == models.StaffShift.id).filter(
            models.StaffShift.shift_block_id == shift_block_id
        )

    if category:
        q = q.join(models.StaffMember, models.DutyAssignment.staff_id == models.StaffMember.id).filter(
            models.StaffMember.category == category
        )

    duties = q.order_by(models.DutyAssignment.start_time.asc().nullslast(), models.DutyAssignment.id.desc()).all()

    rows = []
    for d in duties:
        staff = d.staff
        shift = d.shift
        sb = shift.shift_block if shift else None
        area = d.operational_area

        d_date = _format_date(d.start_time or (sb.start_time if sb else None))
        if target_date and d_date != target_date:
            continue

        overflow = _duty_shift_overflow_minutes(d)
        inc_list = incharges_map.get((sb.id, area.id), []) if (sb and area) else []
        inc_names = ", ".join(inc.full_name for inc in inc_list) if inc_list else "—"

        duration_str = "—"
        if d.start_time and d.end_time:
            diff = _normalize_dt(d.end_time) - _normalize_dt(d.start_time)
            mins = int(diff.total_seconds() // 60)
            hrs = mins // 60
            rmins = mins % 60
            duration_str = f"{hrs}h {rmins}m" if hrs > 0 else f"{rmins}m"

        loc_name, bldg_name, room_name = resolve_duty_location_hierarchy(d)
        st_tz = to_event_tz(d.start_time)
        et_tz = to_event_tz(d.end_time)
        duty_tasks = tasks_map.get((d.staff_id, sb.id if sb else None), [])

        rows.append({
            "id": d.id,
            "staff_id": d.staff_id,
            "staff_name": staff.full_name if staff else "—",
            "category": staff.category if staff else "General",
            "phone": staff.phone if staff else "—",
            "date": d_date,
            "shift_block_id": sb.id if sb else None,
            "shift_name": sb.name if sb else "No Shift / Emergency",
            "operational_area_id": d.operational_area_id,
            "operational_area": area.name if area else "Unclassified",
            "specific_duty": d.duty_type,
            "location_id": d.location_id,
            "location": loc_name,
            "building": bldg_name,
            "room": room_name,
            "start_time": st_tz.isoformat() if st_tz else None,
            "end_time": et_tz.isoformat() if et_tz else None,
            "start_time_display": st_tz.strftime("%H:%M") if st_tz else "—",
            "end_time_display": et_tz.strftime("%H:%M") if et_tz else "—",
            "duty_time_span": _format_time_span(d.start_time, d.end_time),
            "duration": duration_str,
            "incharges": inc_names,
            "outside_shift": bool(overflow),
            "overflow_minutes": overflow,
            "notes": d.notes or "",
            "tasks": duty_tasks,
            "task_count": len(duty_tasks),
        })

    return rows


@router.get("/duties")
def get_duty_assignments_report(
    date: Optional[str] = Query(None),
    shift_block_id: Optional[int] = Query(None),
    staff_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    operational_area_id: Optional[int] = Query(None),
    duty_type: Optional[str] = Query(None),
    has_tasks: Optional[bool] = Query(None),
    task_status: Optional[str] = Query(None),
    task_priority: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    rows = _query_duty_assignments(
        db,
        target_date=date,
        shift_block_id=shift_block_id,
        staff_id=staff_id,
        category=category,
        operational_area_id=operational_area_id,
        duty_type=duty_type,
    )
    if has_tasks is True:
        rows = [r for r in rows if r["task_count"] > 0]
    elif has_tasks is False:
        rows = [r for r in rows if r["task_count"] == 0]
    if task_status:
        rows = [r for r in rows if any(t.get("status") == task_status for t in r["tasks"])]
    if task_priority:
        rows = [r for r in rows if any(t.get("priority") == task_priority for t in r["tasks"])]

    total_tasks = sum(r["task_count"] for r in rows)
    completed_tasks = sum(sum(1 for t in r["tasks"] if t["status"] == "completed") for r in rows)
    overdue_tasks = sum(sum(1 for t in r["tasks"] if t.get("is_overdue")) for r in rows)

    return {
        "total": len(rows),
        "rows": rows,
        "task_summary": {
            "total_linked_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "pending_tasks": total_tasks - completed_tasks,
            "overdue_tasks": overdue_tasks,
            "duties_with_tasks": sum(1 for r in rows if r["task_count"] > 0),
        },
    }


@router.get("/duties.xlsx")
def export_duty_assignments_xlsx(
    date: Optional[str] = Query(None),
    shift_block_id: Optional[int] = Query(None),
    staff_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    operational_area_id: Optional[int] = Query(None),
    duty_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    rows = _query_duty_assignments(
        db,
        target_date=date,
        shift_block_id=shift_block_id,
        staff_id=staff_id,
        category=category,
        operational_area_id=operational_area_id,
        duty_type=duty_type,
    )

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Duty Assignments"
    max_cols = 16

    next_row = style_header_banner(
        ws,
        tournament_name="STAFF DUTY ASSIGNMENT MASTER REGISTER",
        subtitle="Individual Operational Duty Assignments, Timings, Locations, Shift Compliance & Linked Tasks",
        badge_text="OFFICIAL DUTY REGISTER",
        max_col=max_cols,
        start_row=1,
    )

    total_duties = len(rows)
    distinct_staff = len({r["staff_id"] for r in rows})
    outside_shift = sum(1 for r in rows if r["outside_shift"])
    unclassified_areas = sum(1 for r in rows if r["operational_area"] == "Unclassified")
    duties_with_tasks = sum(1 for r in rows if r["task_count"])

    cards = [
        ("Total Duty Records", total_duties, "Logged Assignments"),
        ("Distinct Staff", distinct_staff, "Assigned"),
        ("Outside Shift", outside_shift, "Overflow Alerts"),
        ("Unclassified Area", unclassified_areas, "Legacy/Unmapped"),
        ("Duties With Tasks", duties_with_tasks, "Task-Linked"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)
    next_row = style_section_bar(ws, "Duty Assignments Log", next_row, max_col=max_cols, icon="📋")

    headers = [
        ("STAFF NAME", 22, ALIGN_HEADER_LEFT),
        ("CATEGORY", 16, ALIGN_HEADER_LEFT),
        ("DATE", 12, ALIGN_HEADER_CENTER),
        ("SHIFT BLOCK", 20, ALIGN_HEADER_LEFT),
        ("OPERATIONAL AREA", 20, ALIGN_HEADER_LEFT),
        ("SPECIFIC DUTY", 20, ALIGN_HEADER_LEFT),
        ("LOCATION", 20, ALIGN_HEADER_LEFT),
        ("BUILDING", 18, ALIGN_HEADER_LEFT),
        ("ROOM", 14, ALIGN_HEADER_CENTER),
        ("START", 14, ALIGN_HEADER_CENTER),
        ("END", 14, ALIGN_HEADER_CENTER),
        ("DURATION", 12, ALIGN_HEADER_CENTER),
        ("IN-CHARGE(S)", 20, ALIGN_HEADER_LEFT),
        ("OUTSIDE SHIFT", 14, ALIGN_HEADER_CENTER),
        ("OVERFLOW", 12, ALIGN_HEADER_CENTER),
        ("ASSIGNED TASKS", 32, ALIGN_HEADER_LEFT),
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
        if r["outside_shift"]:
            fill = PatternFill("solid", fgColor=CLR_AMBER_BG)

        row_data = [
            (r["staff_name"], ALIGN_LEFT, FONT_TD_BOLD),
            (r["category"], ALIGN_LEFT, FONT_TD),
            (r["date"], ALIGN_CENTER, FONT_TD),
            (r["shift_name"], ALIGN_LEFT, FONT_TD),
            (r["operational_area"], ALIGN_LEFT, FONT_TD_BOLD),
            (r["specific_duty"], ALIGN_LEFT, FONT_TD),
            (r["location"], ALIGN_LEFT, FONT_TD),
            (r["building"], ALIGN_LEFT, FONT_TD),
            (r["room"], ALIGN_CENTER, FONT_TD),
            (r["start_time_display"], ALIGN_CENTER, FONT_TD),
            (r["end_time_display"], ALIGN_CENTER, FONT_TD),
            (r["duration"], ALIGN_CENTER, FONT_TD),
            (r["incharges"], ALIGN_LEFT, FONT_TD),
            ("YES" if r["outside_shift"] else "NO", ALIGN_CENTER, FONT_TD_BOLD),
            (f"+{r['overflow_minutes']}m" if r["overflow_minutes"] else "—", ALIGN_CENTER, FONT_TD_BOLD if r["overflow_minutes"] else FONT_TD),
            (
                ", ".join(f"{t['title']} [{t['status'].upper()}]" for t in r["tasks"]) if r["tasks"] else "—",
                ALIGN_LEFT,
                FONT_TD,
            ),
        ]
        for col_idx, (val, align, font) in enumerate(row_data, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_row += 1

    style_footer(ws, next_row + 1, max_col=max_cols)
    auto_fit_columns(ws, min_width=10, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws, freeze_pane="A7")

    # ---------------------------------------------------------
    # SHEET 2: Dedicated Task Report
    # ---------------------------------------------------------
    task_rows = _query_tasks_report(db, staff_id=staff_id, shift_block_id=shift_block_id)
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

    total_tasks = len(task_rows)
    completed_tasks = sum(1 for t in task_rows if t["status"] == "completed")
    in_prog_tasks = sum(1 for t in task_rows if t["status"] == "in_progress")
    pending_tasks = sum(1 for t in task_rows if t["status"] == "pending")
    overdue_tasks = sum(1 for t in task_rows if t.get("is_overdue"))

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

    for idx, t in enumerate(task_rows, start=1):
        ws_tasks.row_dimensions[next_task_row].height = 20
        fill = FILL_ZEBRA_EVEN if idx % 2 == 0 else FILL_ZEBRA_ODD
        if t.get("is_overdue"):
            fill = PatternFill("solid", fgColor=CLR_AMBER_BG)

        t_row_data = [
            (t["title"], ALIGN_LEFT, FONT_TD_BOLD),
            (t["assigned_staff"], ALIGN_LEFT, FONT_TD_BOLD if t["assigned_staff"] != "Unassigned" else FONT_TD),
            (t["staff_category"], ALIGN_LEFT, FONT_TD),
            (t["shift_name"], ALIGN_LEFT, FONT_TD),
            (t["category"], ALIGN_LEFT, FONT_TD),
            (t["priority"].upper(), ALIGN_CENTER, FONT_TD),
            (t["status"].upper(), ALIGN_CENTER, FONT_TD_BOLD),
            (t["due_date_display"], ALIGN_CENTER, FONT_TD),
            ("OVERDUE" if t.get("is_overdue") else "ON TIME", ALIGN_CENTER, FONT_TD_BOLD if t.get("is_overdue") else FONT_TD),
        ]

        for col_idx, (val, align, font) in enumerate(t_row_data, start=1):
            cell = ws_tasks.cell(row=next_task_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_task_row += 1

    style_footer(ws_tasks, next_task_row + 1, max_col=max_task_cols)
    auto_fit_columns(ws_tasks, min_width=10, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws_tasks, freeze_pane="A7")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="duty_assignment_report.xlsx"'},
    )


# ---------------------------------------------------------------------------
# 6. Task Report
# ---------------------------------------------------------------------------

def _query_tasks_report(
    db: Session,
    staff_id: Optional[int] = None,
    shift_block_id: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    overdue_only: bool = False,
) -> List[Dict[str, Any]]:
    """Tasks report with derived overdue status.
    Overdue is DERIVED: due_date passed AND status != 'completed'.
    Preserves shiftless tasks. Unassigned tasks show: Assigned Staff = "Unassigned".
    """
    now = datetime.now(timezone.utc)

    q = (
        db.query(models.Task)
        .options(
            joinedload(models.Task.assigned_staff),
            joinedload(models.Task.shift).joinedload(models.StaffShift.shift_block),
        )
    )

    if staff_id:
        q = q.filter(models.Task.assigned_staff_id == staff_id)
    if status:
        q = q.filter(models.Task.status == status)
    if priority:
        q = q.filter(models.Task.priority == priority)
    if category:
        q = q.filter(models.Task.category == category)
    if shift_block_id:
        q = q.join(models.StaffShift, models.Task.shift_id == models.StaffShift.id).filter(
            models.StaffShift.shift_block_id == shift_block_id
        )

    tasks = q.order_by(models.Task.due_date.asc().nullslast(), models.Task.id.desc()).all()

    rows = []
    for t in tasks:
        staff = t.assigned_staff
        shift = t.shift
        sb = shift.shift_block if shift else None

        is_completed = (t.status == "completed")
        is_overdue = False
        if t.due_date and not is_completed:
            dt = t.due_date if t.due_date.tzinfo else t.due_date.replace(tzinfo=timezone.utc)
            if dt < now:
                is_overdue = True

        if overdue_only and not is_overdue:
            continue

        rows.append({
            "id": t.id,
            "title": t.title,
            "description": t.description or "",
            "assigned_staff_id": t.assigned_staff_id,
            "assigned_staff": staff.full_name if staff else "Unassigned",
            "staff_category": staff.category if staff else "—",
            "shift_block_id": sb.id if sb else None,
            "shift_name": sb.name if sb else "Shiftless / General",
            "category": t.category,
            "priority": t.priority,
            "status": t.status,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "due_date_display": _format_date(t.due_date) if t.due_date else "No Due Date",
            "is_overdue": is_overdue,
        })

    return rows


@router.get("/tasks")
def get_task_report(
    staff_id: Optional[int] = Query(None),
    shift_block_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    overdue_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    rows = _query_tasks_report(
        db,
        staff_id=staff_id,
        shift_block_id=shift_block_id,
        status=status,
        priority=priority,
        category=category,
        overdue_only=overdue_only,
    )
    return {"total": len(rows), "rows": rows}


@router.get("/tasks.xlsx")
def export_task_xlsx(
    staff_id: Optional[int] = Query(None),
    shift_block_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    overdue_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    rows = _query_tasks_report(
        db,
        staff_id=staff_id,
        shift_block_id=shift_block_id,
        status=status,
        priority=priority,
        category=category,
        overdue_only=overdue_only,
    )

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Tasks"
    max_cols = 9

    next_row = style_header_banner(
        ws,
        tournament_name="ORGANIZATIONAL TASK AUDIT REPORT",
        subtitle="Operational Work Items, Priority Matrix, Assignees & Deadline Compliance",
        badge_text="OFFICIAL TASK REPORT",
        max_col=max_cols,
        start_row=1,
    )

    total_tasks = len(rows)
    completed_tasks = sum(1 for r in rows if r["status"] == "completed")
    overdue_tasks = sum(1 for r in rows if r["is_overdue"])
    unassigned_tasks = sum(1 for r in rows if r["assigned_staff"] == "Unassigned")

    cards = [
        ("Total Tasks", total_tasks, "Logged Items"),
        ("Completed", completed_tasks, "Finished Work"),
        ("Overdue Tasks", overdue_tasks, "Urgent Attention"),
        ("Unassigned", unassigned_tasks, "Awaiting Staff"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)
    next_row = style_section_bar(ws, "Task Execution Log", next_row, max_col=max_cols, icon="📌")

    headers = [
        ("TASK TITLE", 28, ALIGN_HEADER_LEFT),
        ("ASSIGNED STAFF", 22, ALIGN_HEADER_LEFT),
        ("STAFF CATEGORY", 16, ALIGN_HEADER_LEFT),
        ("SHIFT LINK", 20, ALIGN_HEADER_LEFT),
        ("TASK CATEGORY", 16, ALIGN_HEADER_LEFT),
        ("PRIORITY", 14, ALIGN_HEADER_CENTER),
        ("STATUS", 14, ALIGN_HEADER_CENTER),
        ("DUE DATE", 14, ALIGN_HEADER_CENTER),
        ("OVERDUE", 12, ALIGN_HEADER_CENTER),
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
        if r["is_overdue"]:
            fill = PatternFill("solid", fgColor=CLR_RED_BG)

        row_data = [
            (r["title"], ALIGN_LEFT, FONT_TD_BOLD),
            (r["assigned_staff"], ALIGN_LEFT, FONT_TD),
            (r["staff_category"], ALIGN_LEFT, FONT_TD),
            (r["shift_name"], ALIGN_LEFT, FONT_TD),
            (r["category"], ALIGN_LEFT, FONT_TD),
            (r["priority"].upper(), ALIGN_CENTER, FONT_TD_BOLD),
            (r["status"].upper(), ALIGN_CENTER, FONT_TD),
            (r["due_date_display"], ALIGN_CENTER, FONT_TD),
            ("OVERDUE" if r["is_overdue"] else "OK", ALIGN_CENTER, FONT_TD_BOLD),
        ]
        for col_idx, (val, align, font) in enumerate(row_data, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_row += 1

    style_footer(ws, next_row + 1, max_col=max_cols)
    auto_fit_columns(ws, min_width=10, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws, freeze_pane="A7")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="task_report.xlsx"'},
    )


# ---------------------------------------------------------------------------
# 7. Individual Staff Report
# ---------------------------------------------------------------------------

def _query_individual_staff_report(db: Session, staff_id: int) -> Dict[str, Any]:
    """Complete tournament work plan for a single staff member.
    Suitable for browser printing or giving directly to the staff member.
    """
    staff = db.get(models.StaffMember, staff_id)
    if not staff:
        raise HTTPException(status_code=404, detail="Staff member not found")

    incharges_map = _get_incharges_map(db)
    now = datetime.now(timezone.utc)

    # 1. Shifts & Duties
    staff_shifts = (
        db.query(models.StaffShift)
        .filter(models.StaffShift.staff_id == staff_id)
        .options(
            joinedload(models.StaffShift.shift_block),
            joinedload(models.StaffShift.duties).joinedload(models.DutyAssignment.operational_area),
            joinedload(models.StaffShift.duties).joinedload(models.DutyAssignment.location),
        )
        .order_by(models.StaffShift.id.asc())
        .all()
    )

    shifts_data = []
    for ss in staff_shifts:
        sb = ss.shift_block
        if not sb or sb.status == "CANCELLED":
            continue

        duties_data = []
        for d in ss.duties:
            area = d.operational_area
            inc_list = incharges_map.get((sb.id, d.operational_area_id), []) if d.operational_area_id else []
            duties_data.append({
                "duty_id": d.id,
                "duty_type": d.duty_type,
                "operational_area": area.name if area else "Unclassified",
                "location": _duty_location_name(d),
                "time_span": _format_time_span(d.start_time, d.end_time),
                "notes": d.notes or "",
                "incharges": [
                    {"full_name": inc.full_name, "phone": inc.phone or "—"}
                    for inc in inc_list
                ],
            })

        shifts_data.append({
            "shift_block_id": sb.id,
            "shift_name": sb.name,
            "date": _format_date(sb.start_time),
            "time_span": _format_time_span(sb.start_time, sb.end_time),
            "status": sb.derived_status,
            "notes": ss.notes or sb.notes or "",
            "duties": duties_data,
        })

    # Shiftless / Emergency duties
    shiftless_duties = (
        db.query(models.DutyAssignment)
        .filter(models.DutyAssignment.staff_id == staff_id, models.DutyAssignment.shift_id.is_(None))
        .options(
            joinedload(models.DutyAssignment.operational_area),
            joinedload(models.DutyAssignment.location),
        )
        .all()
    )
    shiftless_data = [
        {
            "duty_id": d.id,
            "duty_type": d.duty_type,
            "operational_area": d.operational_area.name if d.operational_area else "Unclassified",
            "location": _duty_location_name(d),
            "time_span": _format_time_span(d.start_time, d.end_time),
            "notes": d.notes or "",
        }
        for d in shiftless_duties
    ]

    # 2. Tasks
    tasks = (
        db.query(models.Task)
        .filter(models.Task.assigned_staff_id == staff_id)
        .order_by(models.Task.due_date.asc().nullslast())
        .all()
    )
    open_tasks = []
    completed_tasks = []
    overdue_tasks = []

    for t in tasks:
        is_completed = (t.status == "completed")
        is_overdue = False
        if t.due_date and not is_completed:
            dt = t.due_date if t.due_date.tzinfo else t.due_date.replace(tzinfo=timezone.utc)
            if dt < now:
                is_overdue = True

        task_dict = {
            "id": t.id,
            "title": t.title,
            "category": t.category,
            "priority": t.priority,
            "status": t.status,
            "due_date": _format_date(t.due_date) if t.due_date else "No Due Date",
            "is_overdue": is_overdue,
        }
        if is_completed:
            completed_tasks.append(task_dict)
        else:
            open_tasks.append(task_dict)
            if is_overdue:
                overdue_tasks.append(task_dict)

    # 3. In-Charge Responsibilities
    incharge_records = (
        db.query(models.ShiftOperationalIncharge)
        .filter(models.ShiftOperationalIncharge.staff_id == staff_id)
        .options(
            joinedload(models.ShiftOperationalIncharge.shift_block),
            joinedload(models.ShiftOperationalIncharge.operational_area),
        )
        .all()
    )
    incharge_responsibilities = []
    for inc in incharge_records:
        sb = inc.shift_block
        area = inc.operational_area
        if not sb or not area:
            continue

        rep_staff_ids = (
            db.query(models.DutyAssignment.staff_id)
            .join(models.StaffShift, models.DutyAssignment.shift_id == models.StaffShift.id)
            .filter(
                models.StaffShift.shift_block_id == sb.id,
                models.DutyAssignment.operational_area_id == area.id,
            )
            .distinct()
            .all()
        )
        incharge_responsibilities.append({
            "shift_block_id": sb.id,
            "shift_name": sb.name,
            "date": _format_date(sb.start_time),
            "time_span": _format_time_span(sb.start_time, sb.end_time),
            "operational_area_id": area.id,
            "operational_area": area.name,
            "distinct_staff_reporting": len(rep_staff_ids),
        })

    return {
        "staff": {
            "id": staff.id,
            "full_name": staff.full_name,
            "category": staff.category or "General",
            "phone": staff.phone or "—",
            "email": staff.email or "—",
            "notes": staff.notes or "",
        },
        "shifts": shifts_data,
        "shiftless_duties": shiftless_data,
        "tasks": {
            "open": open_tasks,
            "completed": completed_tasks,
            "overdue": overdue_tasks,
        },
        "incharge_responsibilities": incharge_responsibilities,
    }


@router.get("/individual")
def get_individual_staff_report(
    staff_id: int = Query(...),
    db: Session = Depends(get_db),
):
    return _query_individual_staff_report(db, staff_id)


@router.get("/individual.xlsx")
def export_individual_staff_xlsx(
    staff_id: int = Query(...),
    db: Session = Depends(get_db),
):
    data = _query_individual_staff_report(db, staff_id)
    staff = data["staff"]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = staff["full_name"][:30]
    max_cols = 6

    next_row = style_header_banner(
        ws,
        tournament_name=f"STAFF WORK PLAN: {staff['full_name'].upper()}",
        subtitle=f"Category: {staff['category']} | Phone: {staff['phone']} | Email: {staff['email']}",
        badge_text="OFFICIAL STAFF WORK PLAN",
        max_col=max_cols,
        start_row=1,
    )

    total_shifts = len(data["shifts"])
    total_duties = sum(len(s["duties"]) for s in data["shifts"]) + len(data["shiftless_duties"])
    open_tasks = len(data["tasks"]["open"])
    incharge_slots = len(data["incharge_responsibilities"])

    cards = [
        ("Assigned Shifts", total_shifts, "Work Blocks"),
        ("Duties Assigned", total_duties, "Specific Roles"),
        ("Open Tasks", open_tasks, "To-Do Items"),
        ("In-Charge Roles", incharge_slots, "Team Leads"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)

    # 1. SHIFTS & OPERATIONAL DUTIES
    next_row = style_section_bar(ws, "Shifts & Operational Duties", next_row, max_col=max_cols, icon="🕒")

    headers = [
        ("DATE", 14, ALIGN_HEADER_CENTER),
        ("SHIFT BLOCK", 22, ALIGN_HEADER_LEFT),
        ("OPERATIONAL AREA", 22, ALIGN_HEADER_LEFT),
        ("SPECIFIC DUTY", 22, ALIGN_HEADER_LEFT),
        ("TIMINGS & LOCATION", 24, ALIGN_HEADER_LEFT),
        ("REPORT TO (IN-CHARGES)", 26, ALIGN_HEADER_LEFT),
    ]
    ws.row_dimensions[next_row].height = 22
    for col_idx, (th_label, _, align) in enumerate(headers, start=1):
        cell = ws.cell(row=next_row, column=col_idx, value=th_label)
        cell.font = FONT_TH
        cell.fill = FILL_TH_PRIMARY
        cell.alignment = align
        cell.border = BORDER_HEADER
    next_row += 1

    idx = 1
    for s in data["shifts"]:
        duties = s["duties"]
        if not duties:
            ws.row_dimensions[next_row].height = 20
            fill = FILL_ZEBRA_EVEN if idx % 2 == 0 else FILL_ZEBRA_ODD
            row_data = [
                (s["date"], ALIGN_CENTER, FONT_TD),
                (f"{s['shift_name']} ({s['time_span']})", ALIGN_LEFT, FONT_TD_BOLD),
                ("—", ALIGN_LEFT, FONT_TD),
                ("Duty: Not Assigned", ALIGN_LEFT, FONT_TD_MUTED),
                ("—", ALIGN_LEFT, FONT_TD),
                ("—", ALIGN_LEFT, FONT_TD),
            ]
            for col_idx, (val, align, font) in enumerate(row_data, start=1):
                cell = ws.cell(row=next_row, column=col_idx, value=val)
                cell.font = font
                cell.alignment = align
                cell.fill = fill
                cell.border = BORDER_CELL
            next_row += 1
            idx += 1
        else:
            for d in duties:
                ws.row_dimensions[next_row].height = 20
                fill = FILL_ZEBRA_EVEN if idx % 2 == 0 else FILL_ZEBRA_ODD
                inc_text = ", ".join(f"{i['full_name']} ({i['phone']})" for i in d["incharges"]) if d["incharges"] else "—"
                time_loc = f"{d['time_span']} @ {d['location']}"

                row_data = [
                    (s["date"], ALIGN_CENTER, FONT_TD),
                    (f"{s['shift_name']}", ALIGN_LEFT, FONT_TD_BOLD),
                    (d["operational_area"], ALIGN_LEFT, FONT_TD),
                    (d["duty_type"], ALIGN_LEFT, FONT_TD_BOLD),
                    (time_loc, ALIGN_LEFT, FONT_TD),
                    (inc_text, ALIGN_LEFT, FONT_TD),
                ]
                for col_idx, (val, align, font) in enumerate(row_data, start=1):
                    cell = ws.cell(row=next_row, column=col_idx, value=val)
                    cell.font = font
                    cell.alignment = align
                    cell.fill = fill
                    cell.border = BORDER_CELL
                next_row += 1
                idx += 1

    # 2. IN-CHARGE RESPONSIBILITIES
    if data["incharge_responsibilities"]:
        next_row += 1
        next_row = style_section_bar(ws, "Leadership & In-Charge Roles", next_row, max_col=max_cols, icon="🎖️")
        inc_headers = [
            ("DATE", 14, ALIGN_HEADER_CENTER),
            ("SHIFT BLOCK", 22, ALIGN_HEADER_LEFT),
            ("SHIFT TIMINGS", 18, ALIGN_HEADER_CENTER),
            ("OPERATIONAL AREA", 24, ALIGN_HEADER_LEFT),
            ("STAFF REPORTING", 16, ALIGN_HEADER_CENTER),
            ("ROLE TYPE", 20, ALIGN_HEADER_CENTER),
        ]
        ws.row_dimensions[next_row].height = 22
        for col_idx, (th_label, _, align) in enumerate(inc_headers, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=th_label)
            cell.font = FONT_TH
            cell.fill = FILL_TH_SECONDARY
            cell.alignment = align
            cell.border = BORDER_HEADER
        next_row += 1

        for inc_idx, inc in enumerate(data["incharge_responsibilities"], start=1):
            ws.row_dimensions[next_row].height = 20
            fill = FILL_ZEBRA_EVEN if inc_idx % 2 == 0 else FILL_ZEBRA_ODD
            inc_row_data = [
                (inc["date"], ALIGN_CENTER, FONT_TD),
                (inc["shift_name"], ALIGN_LEFT, FONT_TD_BOLD),
                (inc["time_span"], ALIGN_CENTER, FONT_TD),
                (inc["operational_area"], ALIGN_LEFT, FONT_TD_BOLD),
                (f"{inc['distinct_staff_reporting']} Staff", ALIGN_CENTER, FONT_TD_BOLD),
                ("Shift Lead / Coordinator", ALIGN_CENTER, FONT_TD),
            ]
            for col_idx, (val, align, font) in enumerate(inc_row_data, start=1):
                cell = ws.cell(row=next_row, column=col_idx, value=val)
                cell.font = font
                cell.alignment = align
                cell.fill = fill
                cell.border = BORDER_CELL
            next_row += 1

    # 3. TASKS
    all_tasks = data["tasks"]["open"] + data["tasks"]["completed"]
    if all_tasks:
        next_row += 1
        next_row = style_section_bar(ws, "Assigned Tasks", next_row, max_col=max_cols, icon="📌")
        task_headers = [
            ("TASK TITLE", 28, ALIGN_HEADER_LEFT),
            ("CATEGORY", 18, ALIGN_HEADER_LEFT),
            ("PRIORITY", 14, ALIGN_HEADER_CENTER),
            ("STATUS", 14, ALIGN_HEADER_CENTER),
            ("DUE DATE", 16, ALIGN_HEADER_CENTER),
            ("COMPLIANCE", 16, ALIGN_HEADER_CENTER),
        ]
        ws.row_dimensions[next_row].height = 22
        for col_idx, (th_label, _, align) in enumerate(task_headers, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=th_label)
            cell.font = FONT_TH
            cell.fill = FILL_TH_SECONDARY
            cell.alignment = align
            cell.border = BORDER_HEADER
        next_row += 1

        for t_idx, t in enumerate(all_tasks, start=1):
            ws.row_dimensions[next_row].height = 20
            fill = FILL_ZEBRA_EVEN if t_idx % 2 == 0 else FILL_ZEBRA_ODD
            if t["is_overdue"]:
                fill = PatternFill("solid", fgColor=CLR_RED_BG)

            t_row_data = [
                (t["title"], ALIGN_LEFT, FONT_TD_BOLD),
                (t["category"], ALIGN_LEFT, FONT_TD),
                (t["priority"].upper(), ALIGN_CENTER, FONT_TD),
                (t["status"].upper(), ALIGN_CENTER, FONT_TD_BOLD),
                (t["due_date"], ALIGN_CENTER, FONT_TD),
                ("OVERDUE" if t["is_overdue"] else ("COMPLETED" if t["status"] == "completed" else "PENDING"), ALIGN_CENTER, FONT_TD_BOLD),
            ]
            for col_idx, (val, align, font) in enumerate(t_row_data, start=1):
                cell = ws.cell(row=next_row, column=col_idx, value=val)
                cell.font = font
                cell.alignment = align
                cell.fill = fill
                cell.border = BORDER_CELL
            next_row += 1

    style_footer(ws, next_row + 1, max_col=max_cols)
    auto_fit_columns(ws, min_width=10, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws, freeze_pane="A7")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="work_plan_{staff["full_name"].replace(" ", "_").lower()}.xlsx"'},
    )


# ---------------------------------------------------------------------------
# 8. Operational Issues Report (Diagnostic Engine)
# ---------------------------------------------------------------------------

def _diagnose_operational_issues(
    db: Session,
    issue_type: Optional[str] = None,
    target_date: Optional[str] = None,
    shift_block_id: Optional[int] = None,
    operational_area_id: Optional[int] = None,
    staff_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Diagnostic report that detects Staff Operations problems:
    A. Staff assigned to a ShiftBlock but NO duty assigned.
    B. ShiftBlock + OperationalArea has duties/staff but NO in-charge.
    C. Duty has no OperationalArea.
    D. Duty has no EventLocation.
    E. Duty falls outside its ShiftBlock window.
    F. Task overdue and incomplete.
    G. Task has no assignee.
    H. Any invalid/orphaned in-charge relationship if such data exists.

    This report is diagnostic only — do NOT automatically fix anything.
    """
    now = datetime.now(timezone.utc)
    incharges_map = _get_incharges_map(db)

    issues: List[Dict[str, Any]] = []

    counters = {
        "staff_without_duties": 0,
        "areas_without_incharge": 0,
        "duties_without_area": 0,
        "duties_without_location": 0,
        "outside_shift_duties": 0,
        "overdue_tasks": 0,
        "unassigned_tasks": 0,
        "orphaned_incharges": 0,
    }

    # A. Staff assigned to a ShiftBlock but NO duty assigned
    staff_shifts = (
        db.query(models.StaffShift)
        .options(
            joinedload(models.StaffShift.shift_block),
            joinedload(models.StaffShift.staff),
            joinedload(models.StaffShift.duties),
        )
        .all()
    )

    for ss in staff_shifts:
        sb = ss.shift_block
        staff = ss.staff
        if not sb or sb.status == "CANCELLED" or not staff:
            continue
        if len(ss.duties) == 0:
            counters["staff_without_duties"] += 1
            issues.append({
                "issue_type": "STAFF_WITHOUT_DUTY",
                "severity": "WARNING",
                "date": _format_date(sb.start_time),
                "shift_id": sb.id,
                "shift_name": sb.name,
                "staff_id": staff.id,
                "staff_name": staff.full_name,
                "operational_area_id": None,
                "operational_area": "—",
                "related_entity": f"StaffShift #{ss.id}",
                "description": f"{staff.full_name} is scheduled on {sb.name} but has no operational duties assigned.",
            })

    # B. ShiftBlock + OperationalArea has duties/staff but NO in-charge
    duties = (
        db.query(models.DutyAssignment)
        .options(
            joinedload(models.DutyAssignment.staff),
            joinedload(models.DutyAssignment.shift).joinedload(models.StaffShift.shift_block),
            joinedload(models.DutyAssignment.operational_area),
            joinedload(models.DutyAssignment.location),
            joinedload(models.DutyAssignment.room),
        )
        .all()
    )

    area_duties_map: Dict[Tuple[int, int], List[models.DutyAssignment]] = defaultdict(list)
    for d in duties:
        sb = d.shift.shift_block if d.shift else None
        if sb and sb.status != "CANCELLED" and d.operational_area_id:
            area_duties_map[(sb.id, d.operational_area_id)].append(d)

    area_objects = {a.id: a for a in db.query(models.OperationalArea).all()}
    shift_objects = {sb.id: sb for sb in db.query(models.ShiftBlock).all()}

    for (sb_id, a_id), duty_list in area_duties_map.items():
        if (sb_id, a_id) not in incharges_map or len(incharges_map[(sb_id, a_id)]) == 0:
            counters["areas_without_incharge"] += 1
            sb = shift_objects.get(sb_id)
            area = area_objects.get(a_id)
            sb_name = sb.name if sb else f"Shift #{sb_id}"
            area_name = area.name if area else f"Area #{a_id}"
            distinct_staff = len({d.staff_id for d in duty_list})
            issues.append({
                "issue_type": "AREA_WITHOUT_INCHARGE",
                "severity": "CRITICAL",
                "date": _format_date(sb.start_time) if sb else "—",
                "shift_id": sb_id,
                "shift_name": sb_name,
                "staff_id": None,
                "staff_name": "—",
                "operational_area_id": a_id,
                "operational_area": area_name,
                "related_entity": f"{distinct_staff} Staff / {len(duty_list)} Duties",
                "description": f"{area_name} on {sb_name} has {distinct_staff} active staff but NO in-charge coordinator assigned.",
            })

    # C, D, E: Duty checks
    for d in duties:
        sb = d.shift.shift_block if d.shift else None
        staff = d.staff
        area = d.operational_area
        loc = d.location or d.room

        # C. Duty has no OperationalArea
        if not d.operational_area_id:
            counters["duties_without_area"] += 1
            issues.append({
                "issue_type": "DUTY_WITHOUT_AREA",
                "severity": "WARNING",
                "date": _format_date(d.start_time or (sb.start_time if sb else None)),
                "shift_id": sb.id if sb else None,
                "shift_name": sb.name if sb else "No Shift",
                "staff_id": staff.id if staff else None,
                "staff_name": staff.full_name if staff else "—",
                "operational_area_id": None,
                "operational_area": "Unclassified",
                "related_entity": f"Duty #{d.id} ({d.duty_type})",
                "description": f"Duty '{d.duty_type}' assigned to {staff.full_name if staff else '—'} is not mapped to any Operational Area.",
            })

        # D. Duty has no EventLocation
        if not loc:
            counters["duties_without_location"] += 1
            issues.append({
                "issue_type": "DUTY_WITHOUT_LOCATION",
                "severity": "WARNING",
                "date": _format_date(d.start_time or (sb.start_time if sb else None)),
                "shift_id": sb.id if sb else None,
                "shift_name": sb.name if sb else "No Shift",
                "staff_id": staff.id if staff else None,
                "staff_name": staff.full_name if staff else "—",
                "operational_area_id": d.operational_area_id,
                "operational_area": area.name if area else "Unclassified",
                "related_entity": f"Duty #{d.id} ({d.duty_type})",
                "description": f"Duty '{d.duty_type}' has no EventLocation specified.",
            })

        # E. Duty falls outside its ShiftBlock window
        overflow = _duty_shift_overflow_minutes(d)
        if overflow:
            counters["outside_shift_duties"] += 1
            issues.append({
                "issue_type": "DUTY_OUTSIDE_SHIFT",
                "severity": "INFO",
                "date": _format_date(sb.start_time if sb else None),
                "shift_id": sb.id if sb else None,
                "shift_name": sb.name if sb else "—",
                "staff_id": staff.id if staff else None,
                "staff_name": staff.full_name if staff else "—",
                "operational_area_id": d.operational_area_id,
                "operational_area": area.name if area else "Unclassified",
                "related_entity": f"Duty #{d.id} (+{overflow}m)",
                "description": f"Duty timings extend {overflow} minutes outside {sb.name if sb else 'shift'} operating window.",
            })

    # F & G: Task checks
    tasks = (
        db.query(models.Task)
        .options(
            joinedload(models.Task.assigned_staff),
            joinedload(models.Task.shift).joinedload(models.StaffShift.shift_block),
        )
        .all()
    )

    for t in tasks:
        staff = t.assigned_staff
        sb = t.shift.shift_block if t.shift else None

        # F. Task overdue and incomplete
        if t.due_date and t.status != "completed":
            dt = t.due_date if t.due_date.tzinfo else t.due_date.replace(tzinfo=timezone.utc)
            if dt < now:
                counters["overdue_tasks"] += 1
                issues.append({
                    "issue_type": "TASK_OVERDUE",
                    "severity": "CRITICAL",
                    "date": _format_date(t.due_date),
                    "shift_id": sb.id if sb else None,
                    "shift_name": sb.name if sb else "Shiftless",
                    "staff_id": staff.id if staff else None,
                    "staff_name": staff.full_name if staff else "Unassigned",
                    "operational_area_id": None,
                    "operational_area": "—",
                    "related_entity": f"Task #{t.id} ({t.title})",
                    "description": f"Task '{t.title}' is overdue ({_format_date(t.due_date)}) and still in '{t.status}' status.",
                })

        # G. Task has no assignee
        if not t.assigned_staff_id:
            counters["unassigned_tasks"] += 1
            issues.append({
                "issue_type": "TASK_UNASSIGNED",
                "severity": "WARNING",
                "date": _format_date(t.due_date) if t.due_date else "—",
                "shift_id": sb.id if sb else None,
                "shift_name": sb.name if sb else "Shiftless",
                "staff_id": None,
                "staff_name": "Unassigned",
                "operational_area_id": None,
                "operational_area": "—",
                "related_entity": f"Task #{t.id} ({t.title})",
                "description": f"Task '{t.title}' has no staff member assigned to complete it.",
            })

    # H. Invalid or orphaned in-charge relationship
    incharges = db.query(models.ShiftOperationalIncharge).all()
    for inc in incharges:
        if not db.get(models.ShiftBlock, inc.shift_block_id) or not db.get(models.OperationalArea, inc.operational_area_id) or not db.get(models.StaffMember, inc.staff_id):
            counters["orphaned_incharges"] += 1
            issues.append({
                "issue_type": "ORPHANED_INCHARGE",
                "severity": "CRITICAL",
                "date": "—",
                "shift_id": inc.shift_block_id,
                "shift_name": f"Shift #{inc.shift_block_id}",
                "staff_id": inc.staff_id,
                "staff_name": f"Staff #{inc.staff_id}",
                "operational_area_id": inc.operational_area_id,
                "operational_area": f"Area #{inc.operational_area_id}",
                "related_entity": f"InCharge Record #{inc.id}",
                "description": f"In-charge link #{inc.id} references deleted or non-existent entity.",
            })

    filtered_issues = issues
    if issue_type:
        filtered_issues = [i for i in filtered_issues if i["issue_type"] == issue_type]
    if target_date:
        filtered_issues = [i for i in filtered_issues if i["date"] == target_date]
    if shift_block_id:
        filtered_issues = [i for i in filtered_issues if i["shift_id"] == shift_block_id]
    if operational_area_id:
        filtered_issues = [i for i in filtered_issues if i["operational_area_id"] == operational_area_id]
    if staff_id:
        filtered_issues = [i for i in filtered_issues if i["staff_id"] == staff_id]

    return {
        "counters": counters,
        "total_issues": len(filtered_issues),
        "issues": filtered_issues,
    }


@router.get("/operational-issues")
def get_operational_issues_report(
    issue_type: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    shift_block_id: Optional[int] = Query(None),
    operational_area_id: Optional[int] = Query(None),
    staff_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    return _diagnose_operational_issues(
        db,
        issue_type=issue_type,
        target_date=date,
        shift_block_id=shift_block_id,
        operational_area_id=operational_area_id,
        staff_id=staff_id,
    )


@router.get("/operational-issues.xlsx")
def export_operational_issues_xlsx(
    issue_type: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    shift_block_id: Optional[int] = Query(None),
    operational_area_id: Optional[int] = Query(None),
    staff_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    data = _diagnose_operational_issues(
        db,
        issue_type=issue_type,
        target_date=date,
        shift_block_id=shift_block_id,
        operational_area_id=operational_area_id,
        staff_id=staff_id,
    )
    issues = data["issues"]
    counters = data["counters"]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Operational Issues"
    max_cols = 8

    next_row = style_header_banner(
        ws,
        tournament_name="STAFF OPERATIONS DIAGNOSTIC & EXCEPTION AUDIT",
        subtitle="Automated Gaps & Conflict Detection across Shifts, Operational Areas, Duties & Tasks",
        badge_text="OFFICIAL AUDIT REPORT",
        max_col=max_cols,
        start_row=1,
    )

    cards = [
        ("Staff Without Duties", counters["staff_without_duties"], "Staffing Gaps"),
        ("Areas Without Lead", counters["areas_without_incharge"], "Unsupervised Teams"),
        ("Duties Missing Loc", counters["duties_without_location"], "Unmapped Duties"),
        ("Outside Shift Duties", counters["outside_shift_duties"], "Overflow Warnings"),
        ("Overdue Tasks", counters["overdue_tasks"], "Urgent Items"),
    ]
    next_row = style_kpi_cards(ws, cards, start_row=next_row, card_width_cols=1)
    next_row = style_section_bar(ws, "Operational Exceptions & Issue Log", next_row, max_col=max_cols, icon="⚠️")

    headers = [
        ("SEVERITY", 12, ALIGN_HEADER_CENTER),
        ("ISSUE TYPE", 24, ALIGN_HEADER_LEFT),
        ("DATE", 12, ALIGN_HEADER_CENTER),
        ("SHIFT BLOCK", 20, ALIGN_HEADER_LEFT),
        ("STAFF MEMBER", 22, ALIGN_HEADER_LEFT),
        ("OPERATIONAL AREA", 22, ALIGN_HEADER_LEFT),
        ("RELATED ENTITY", 22, ALIGN_HEADER_LEFT),
        ("DESCRIPTION", 45, ALIGN_HEADER_LEFT),
    ]

    ws.row_dimensions[next_row].height = 22
    for col_idx, (th_label, _, align) in enumerate(headers, start=1):
        cell = ws.cell(row=next_row, column=col_idx, value=th_label)
        cell.font = FONT_TH
        cell.fill = FILL_TH_PRIMARY
        cell.alignment = align
        cell.border = BORDER_HEADER
    next_row += 1

    for idx, r in enumerate(issues, start=1):
        ws.row_dimensions[next_row].height = 20
        fill = FILL_ZEBRA_EVEN if idx % 2 == 0 else FILL_ZEBRA_ODD
        if r["severity"] == "CRITICAL":
            fill = PatternFill("solid", fgColor=CLR_RED_BG)
        elif r["severity"] == "WARNING":
            fill = PatternFill("solid", fgColor=CLR_AMBER_BG)

        row_data = [
            (r["severity"], ALIGN_CENTER, FONT_TD_BOLD),
            (r["issue_type"].replace("_", " "), ALIGN_LEFT, FONT_TD_BOLD),
            (r["date"], ALIGN_CENTER, FONT_TD),
            (r["shift_name"], ALIGN_LEFT, FONT_TD),
            (r["staff_name"], ALIGN_LEFT, FONT_TD),
            (r["operational_area"], ALIGN_LEFT, FONT_TD),
            (r["related_entity"], ALIGN_LEFT, FONT_TD),
            (r["description"], ALIGN_LEFT, FONT_TD),
        ]
        for col_idx, (val, align, font) in enumerate(row_data, start=1):
            cell = ws.cell(row=next_row, column=col_idx, value=val)
            cell.font = font
            cell.alignment = align
            cell.fill = fill
            cell.border = BORDER_CELL
        next_row += 1

    style_footer(ws, next_row + 1, max_col=max_cols)
    auto_fit_columns(ws, min_width=10, max_width=45, extra_padding=3)
    enable_sheet_ergonomics(ws, freeze_pane="A7")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": 'attachment; filename="operational_issues_report.xlsx"'},
    )


# ---------------------------------------------------------------------------
# Printable PDFs — shared by every report above EXCEPT "individual". Most of
# these (staff-master, shift-roster, incharges, duties, tasks,
# operational-issues) are flat by nature; operational-areas is nested
# (ShiftBlock -> Area -> Staff) on screen but its query already produces a
# pre-flattened "flat_rows" list too — the exact rows its own .xlsx renders
# — so it gets a PDF the same way, just sourced from that instead of the
# nested "areas" structure. Only "individual" has no entry here: it's a
# single person's whole work-plan document (several distinct sub-tables:
# shifts, duties, in-charge-of areas, tasks), not one table to flatten — the
# frontend's own browser Print button (StaffOperationsReportsPanel.tsx)
# covers that one instead.
# ---------------------------------------------------------------------------
def _staff_master_row(r: Dict[str, Any]) -> list:
    status_label = "ACTIVE" if r["is_active"] is True else ("INACTIVE" if r["is_active"] is False else "NO LOGIN")
    return [r["full_name"], r["category"], r["phone"], r["email"], "YES" if r["login_linked"] else "NO", r["username"], status_label]


def _shift_roster_row(r: Dict[str, Any]) -> list:
    warning = r["outside_shift_warning"] or ("No Duty Assigned" if not r["has_duty"] else "—")
    return [
        r["date"], r["shift_name"], r["shift_time_span"], r["staff_name"], r["category"], r["phone"],
        r["operational_area"], r["specific_duty"], r["duty_time_span"], r["location"], r["incharges"], warning,
    ]


def _incharge_row(r: Dict[str, Any]) -> list:
    return [
        r["staff_name"], r["phone"], r["date"], r["shift_name"], r["operational_area"],
        r["distinct_staff_count"], r["reporting_staff_names"], r["category"],
    ]


def _duty_pdf_row(r: Dict[str, Any]) -> list:
    tasks = ", ".join(f"{t['title']} [{t['status'].upper()}]" for t in r["tasks"]) if r["tasks"] else "—"
    return [
        r["staff_name"], r["category"], r["date"], r["shift_name"], r["operational_area"], r["specific_duty"],
        r["location"], r["building"], r["room"], r["start_time_display"], r["end_time_display"], r["duration"],
        r["incharges"], "YES" if r["outside_shift"] else "NO",
        f"+{r['overflow_minutes']}m" if r["overflow_minutes"] else "—", tasks,
    ]


def _task_pdf_row(r: Dict[str, Any]) -> list:
    return [
        r["title"], r["assigned_staff"], r["staff_category"], r["shift_name"], r["category"],
        r["priority"].upper() if r["priority"] else "—", r["status"].upper() if r["status"] else "—",
        r["due_date_display"], "OVERDUE" if r["is_overdue"] else "OK",
    ]


def _operational_area_pdf_row(r: Dict[str, Any]) -> list:
    return [
        r["date"], r["shift_name"], r["operational_area"], r["incharges"], r["incharges_phones"],
        r["staff_name"], r["staff_phone"], r["category"], r["specific_duty"], r["duty_time"], r["location"],
    ]


def _issue_pdf_row(r: Dict[str, Any]) -> list:
    return [
        r["severity"], r["issue_type"].replace("_", " "), r["date"], r["shift_name"],
        r["staff_name"], r["operational_area"], r["related_entity"], r["description"],
    ]


_FLAT_REPORT_PDF_SPECS: Dict[str, Dict[str, Any]] = {
    "staff-master": {
        "title": "STAFF MASTER REPORT",
        "subtitle": "Directory With Credentials Linkage Status",
        "headers": ["Staff Name", "Category", "Phone", "Email", "Login Linked", "Username", "Account Status"],
        "row": _staff_master_row,
    },
    "shift-roster": {
        "title": "SHIFT ROSTER REPORT",
        "subtitle": "Date to Shift Block to Staff Deployment, Including Unassigned Staff",
        "headers": [
            "Date", "Shift Name", "Shift Time", "Staff Name", "Category", "Phone", "Operational Area",
            "Specific Duty", "Duty Time", "Location", "In-Charge(s)", "Notes / Warning",
        ],
        "row": _shift_roster_row,
    },
    "operational-areas": {
        "title": "OPERATIONAL TEAM & RESPONSIBILITY REPORT",
        "subtitle": "Workforce Distribution Across Operational Areas, Leads & Specific Duties",
        "headers": [
            "Date", "Shift", "Operational Area", "In-Charge Name(s)", "In-Charge Phone(s)",
            "Staff Name", "Staff Phone", "Category", "Specific Duty", "Duty Time", "Location",
        ],
        "row": _operational_area_pdf_row,
    },
    "incharges": {
        "title": "IN-CHARGE REPORT",
        "subtitle": "Leadership Responsibilities & Distinct Reporting Staff",
        "headers": [
            "Lead / In-Charge", "Phone", "Date", "Shift Block", "Operational Area",
            "Distinct Staff Reporting", "Reporting Staff Names", "Category",
        ],
        "row": _incharge_row,
    },
    "duties": {
        "title": "DUTY ASSIGNMENT REPORT",
        "subtitle": "Individual Operational Duty Assignments, Timings, Locations, Shift Compliance & Linked Tasks",
        "headers": [
            "Staff Name", "Category", "Date", "Shift Block", "Operational Area", "Specific Duty", "Location",
            "Building", "Room", "Start", "End", "Duration", "In-Charge(s)", "Outside Shift", "Overflow", "Assigned Tasks",
        ],
        "row": _duty_pdf_row,
    },
    "tasks": {
        "title": "TASK REPORT",
        "subtitle": "Tasks With Derived Overdue Detection",
        "headers": ["Task Title", "Assigned Staff", "Staff Category", "Shift Link", "Task Category", "Priority", "Status", "Due Date", "Overdue"],
        "row": _task_pdf_row,
    },
    "operational-issues": {
        "title": "OPERATIONAL ISSUES REPORT",
        "subtitle": "Diagnostic Detection of Gaps, Unassigned Duties, Missing In-Charges, Outside Shift, Overdue Tasks",
        "headers": ["Severity", "Issue Type", "Date", "Shift Block", "Staff Member", "Operational Area", "Related Entity", "Description"],
        "row": _issue_pdf_row,
    },
}


@router.get("/{report}.pdf")
def export_flat_report_pdf(
    report: str,
    date: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    shift_block_id: Optional[int] = Query(None),
    staff_id: Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    operational_area_id: Optional[int] = Query(None),
    duty_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    overdue_only: bool = Query(False),
    issue_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Printable PDF for any of the flat-row Staff Operations reports (see
    _FLAT_REPORT_PDF_SPECS) — each report's own existing query function
    reused as-is (same filters, same result set and same columns as its
    .xlsx sibling — operational-areas uses its query's own "flat_rows", the
    exact same pre-flattened rows its .xlsx already renders), just piped
    through pdf_report.build_table_pdf instead of an openpyxl workbook.
    404s only for "individual" — see the module docstring above this
    section for why that one stays Print-only."""
    spec = _FLAT_REPORT_PDF_SPECS.get(report)
    if not spec:
        raise HTTPException(404, f"No printable PDF for '{report}' — use the Print button for this report instead.")

    if report == "staff-master":
        rows = _query_staff_master(db, category, staff_id)
    elif report == "shift-roster":
        rows = _query_shift_roster(
            db, date_from=date_from, date_to=date_to, shift_block_id=shift_block_id,
            staff_id=staff_id, category=category, operational_area_id=operational_area_id,
        )
    elif report == "operational-areas":
        rows = _query_operational_area_report(
            db, target_date=date, shift_block_id=shift_block_id,
            operational_area_id=operational_area_id, staff_id=staff_id,
        )["flat_rows"]
    elif report == "incharges":
        rows = _query_incharge_report(db, staff_id, shift_block_id, operational_area_id)
    elif report == "duties":
        rows = _query_duty_assignments(
            db, target_date=date, shift_block_id=shift_block_id, staff_id=staff_id,
            category=category, operational_area_id=operational_area_id, duty_type=duty_type,
        )
    elif report == "tasks":
        rows = _query_tasks_report(
            db, staff_id=staff_id, shift_block_id=shift_block_id, status=status,
            priority=priority, category=category, overdue_only=overdue_only,
        )
    else:  # operational-issues
        rows = _diagnose_operational_issues(
            db, issue_type=issue_type, target_date=date, shift_block_id=shift_block_id,
            operational_area_id=operational_area_id, staff_id=staff_id,
        )["issues"]

    table_rows = [spec["row"](r) for r in rows]
    pdf = build_table_pdf(
        title=spec["title"],
        subtitle=spec["subtitle"],
        headers=spec["headers"],
        rows=table_rows,
        kpis=[("Total Records", str(len(table_rows)))],
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{report.replace("-", "_")}_report.pdf"'},
    )
