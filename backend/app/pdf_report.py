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
    `col_widths` are in cm, one per header column — omit to split the usable
    landscape-A4 width evenly. Every cell value is coerced to `str` (a PDF
    table cell can't hold `None`/numbers the way an openpyxl cell can)."""
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
    header_style = ParagraphStyle("Header", fontName="Helvetica-Bold", fontSize=8.5, textColor=_WHITE, alignment=TA_LEFT, leading=10)

    widths = [w * cm for w in col_widths] if col_widths else [usable_width / len(headers)] * len(headers)
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
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
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
