"""Generic printable-PDF table report builder, shared by any export endpoint
that wants a PDF alongside its existing styled .xlsx (see excel_styler.py for
the Excel equivalent) — currently the Room Map and Accommodation reports
(routers/exports.py). Deliberately simple: one title/subtitle banner, an
optional KPI summary line, then a single table that repeats its header row
on every page (reportlab's Table(repeatRows=1) — this is what actually
makes a 200-row report printable, not just a giant unbroken first page).

Not reused by id_card.py: that module places already-rendered card *images*
onto exact physical-size PDF pages via a raw Canvas, a completely different
shape of problem (image placement vs. flowing a text table across pages).
"""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER

import io

# Same palette as excel_styler.py's CLR_* constants, kept in sync so a PDF
# and its .xlsx sibling read as the same brand, not two different tools.
_OBSIDIAN = colors.HexColor("#0F172A")
_SLATE_600 = colors.HexColor("#475569")
_SLATE_200 = colors.HexColor("#E2E8F0")
_SLATE_50 = colors.HexColor("#F8FAFC")
_GOLD = colors.HexColor("#D97706")
_WHITE = colors.white


_MIN_COL_WIDTH_CM = 1.35  # enough for a ~6-char header at 8.5pt bold without wrapping mid-word
_MAX_COL_FRACTION = 0.30  # no single column may claim more than this share of the page


def _clip_and_redistribute(widths: list[float], lo: float, hi: float) -> list[float]:
    """Clips every width into [lo, hi], taking whatever that adds or removes
    back out of the *other* (still-adjustable) columns in proportion to
    their own current size — so the total stays exactly what it started as.
    Runs to a fixed point: fixing one column can push a previously-fine
    column outside the range too (e.g. redistributing a capped column's
    excess can lift a small column past the max), so a single pass isn't
    always enough. Column count here is always small (a handful to ~20), so
    a few iterations cost nothing."""
    widths = list(widths)
    n = len(widths)
    fixed: set[int] = set()
    for _ in range(n):  # can't take more than n rounds to settle
        free = [i for i in range(n) if i not in fixed]
        newly_fixed = [i for i in free if widths[i] < lo or widths[i] > hi]
        if not newly_fixed:
            break
        delta = 0.0
        for i in newly_fixed:
            clipped = min(hi, max(lo, widths[i]))
            delta += widths[i] - clipped
            widths[i] = clipped
            fixed.add(i)
        remaining_free = [i for i in range(n) if i not in fixed]
        free_total = sum(widths[i] for i in remaining_free)
        if not remaining_free or free_total <= 0:
            break
        for i in remaining_free:
            widths[i] += delta * (widths[i] / free_total)
    return widths


def _auto_col_widths(headers: list[str], rows: list[list], usable_width: float) -> list[float]:
    """Sizes columns by actual content length instead of splitting the page
    evenly — an even split badly under-sizes whichever column happens to
    hold long free text (a school/team name is routinely 3-4x longer than a
    "Present"/"Absent" cell next to it), which forces that one column to
    wrap onto 2-3 lines and roughly halves how many rows fit per printed
    page. Weights are each column's longest value (header included), scaled
    to fill the page width exactly.

    A pure proportional split still isn't enough on its own at either
    extreme: with few columns, one long free-text column can swallow most
    of the page width and starve the rest (_MAX_COL_FRACTION caps any one
    column's share); with many columns, a short one ("Room", "Start") can
    get scaled down to a sliver too narrow for even its own header, wrapping
    it mid-word ("Ro" / "om") — _MIN_COL_WIDTH_CM floors that. Both are
    enforced by taking the adjustment back out of (or from) the other
    columns rather than changing the page's total width."""
    n = len(headers)
    sample = rows[:500]  # measuring every row of a multi-thousand-row report isn't worth it
    max_len = [len(str(h)) for h in headers]
    for row in sample:
        for i, v in enumerate(row):
            if i >= n:
                break
            length = len(str(v)) if v is not None else 0
            if length > max_len[i]:
                max_len[i] = length
    weights = [max(6, length) for length in max_len]
    total_weight = sum(weights)
    widths = [usable_width * w / total_weight for w in weights]
    widths = _clip_and_redistribute(widths, _MIN_COL_WIDTH_CM * cm, _MAX_COL_FRACTION * usable_width)
    return widths


def build_table_pdf(
    title: str,
    subtitle: str,
    headers: list[str],
    rows: list[list[str]],
    col_widths: "list[float] | None" = None,
    kpis: "list[tuple[str, str]] | None" = None,
) -> bytes:
    """Renders one title/subtitle banner, an optional row of "LABEL: value"
    KPI pairs, and a table with `headers` repeated on every printed page.
    `col_widths` are in cm, one per header column — omit to size columns by
    actual content length instead (see _auto_col_widths). Every cell value
    is coerced to `str` (a PDF table cell can't hold `None`/numbers the way
    an openpyxl cell can)."""
    buf = io.BytesIO()
    page_size = landscape(A4)
    doc = SimpleDocTemplate(
        buf,
        pagesize=page_size,
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm,
        topMargin=1.2 * cm,
        bottomMargin=1.2 * cm,
        title=title,
    )
    usable_width = page_size[0] - doc.leftMargin - doc.rightMargin

    title_style = ParagraphStyle("Title", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=_OBSIDIAN, alignment=TA_LEFT, spaceAfter=4)
    subtitle_style = ParagraphStyle("Subtitle", fontName="Helvetica", fontSize=9.5, leading=13, textColor=_SLATE_600, alignment=TA_LEFT, spaceAfter=10)
    kpi_style = ParagraphStyle("Kpi", fontName="Helvetica-Bold", fontSize=9, textColor=_OBSIDIAN, alignment=TA_CENTER)

    story = [Paragraph(title, title_style), Paragraph(subtitle, subtitle_style)]

    if kpis:
        kpi_table = Table(
            [[Paragraph(f"{label}<br/><font size=13>{value}</font>", kpi_style) for label, value in kpis]],
            colWidths=[usable_width / len(kpis)] * len(kpis),
        )
        kpi_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), _SLATE_50),
            ("BOX", (0, 0), (-1, -1), 0.5, _SLATE_200),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, _SLATE_200),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(kpi_table)
        story.append(Spacer(1, 12))

    cell_style = ParagraphStyle("Cell", fontName="Helvetica", fontSize=8, textColor=_OBSIDIAN, alignment=TA_LEFT, leading=10)
    header_style = ParagraphStyle("Header", fontName="Helvetica-Bold", fontSize=7.5, textColor=_WHITE, alignment=TA_LEFT, leading=9)

    widths = [w * cm for w in col_widths] if col_widths else _auto_col_widths(headers, rows, usable_width)
    table_data = [[Paragraph(h, header_style) for h in headers]]
    table_data += [[Paragraph("" if v is None else str(v), cell_style) for v in row] for row in rows]

    table = Table(table_data, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), _OBSIDIAN),
        ("BOX", (0, 0), (-1, -1), 0.75, _SLATE_200),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, _SLATE_200),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]
    for i in range(1, len(table_data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), _SLATE_50))
    table.setStyle(TableStyle(style))
    story.append(table)

    def _footer(canvas, _doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(_SLATE_600)
        canvas.drawRightString(page_size[0] - doc.rightMargin, 0.7 * cm, f"Page {canvas.getPageNumber()}")
        canvas.setFillColor(_GOLD)
        canvas.drawString(doc.leftMargin, 0.7 * cm, "National Cluster Championships 2026-27")
        canvas.restoreState()

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()
