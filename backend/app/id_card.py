"""Renders the fixed CBSE National Kabaddi ID-card graphic
(backend/assets/templates/id_card_template.png) for one participant, and
combines any number of rendered cards into a multi-page PDF.

Rendering one card (photo + text composited onto the fixed background) is
Pillow only — already a dependency for participant/gallery photo
optimization, see image_utils.py — via ImageDraw, exactly as before.

Turning many cards into a *sheet* PDF (build_pdf_sheets) uses ReportLab
instead of Pillow's own "save a list of page-images as a multi-page PDF"
trick (Image.save(..., format="PDF", save_all=True), still used by build_pdf
below for the single-card-per-page case). The difference matters for a
multi-card sheet: saving one big Pillow-composited sheet bitmap via
Image.save embeds that whole page as ONE flattened raster, whereas
ReportLab's canvas.drawImage places each already-rendered card as its own
independent image object on a PDF page it constructs at the exact physical
sheet size — so opening the PDF in layout/print software (CorelDRAW,
Illustrator, InDesign, ...) shows N separately selectable card images per
page, not one solid picture of the whole sheet. Each card's *pixel content*
is still 100% Pillow-rendered raster, same as always; only how multiple
cards get placed onto one PDF page changed.

All of the box/line coordinates below were measured directly off the
1024x1536 template PNG (scanning for the photo box's orange border and the
seven field underlines) — if the template graphic is ever redesigned, these
need to be re-measured, there's no dynamic layout here by design (it's a
fixed print template, not a flowable document).
"""
import io
import re
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.units import cm as _PT_PER_CM
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas

_AGE_GROUP_NUM_RE = re.compile(r"(\d+)")


def sort_key(participant) -> tuple:
    """Age group ascending (Under 14 before Under 17 before Under 19), then
    alphabetical by name within that group — how a printed sheet of cards
    should be ordered, not the plain alphabetical-only order the admin table
    uses. Age groups with no parseable number (or none set) sort last."""
    age_group = participant.age_group or ""
    m = _AGE_GROUP_NUM_RE.search(age_group)
    rank = int(m.group(1)) if m else 9999
    return (rank, age_group, participant.full_name)

TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "assets" / "templates" / "id_card_template.png"
# All box/line coordinates below are measured in this native template
# resolution — compositing (photo + text) happens at this size, and the
# result is scaled to the physical print size only at the very end (see
# PRINT_SIZE_PX/PRINT_DPI), so the measured coordinates never need rescaling.
TEMPLATE_SIZE = (1024, 1536)

# Physical card size the org wants printed: 6.6cm wide x 11.5cm tall. 300 DPI is
# standard print quality; PDF page size comes from pixel-size / DPI, so this
# pins the exact physical output regardless of the template's native pixel
# aspect ratio (1024:1536 = 2:3 ≈ 0.667, vs. the requested 6.6:11.5 ≈ 0.574 — a
# ~14% horizontal squeeze of the whole composited card, text and photo
# included, so the layout stays proportionally intact).
PRINT_DPI = 300
# Used only for the "every participant, tournament-wide" bulk export — at
# full 300 DPI that export is impractically large (measured 200MB+ at
# thousands of participants). 150 DPI keeps text and photos clearly legible
# on an A4 sheet while landing the file much smaller.
BULK_PRINT_DPI = 150
_CM_TO_IN = 1 / 2.54

# Standalone single-card page size (used by the per-participant download —
# one card fills the whole page, at its real 6.6x11.5cm print size).
CARD_WIDTH_CM = 6.6
CARD_HEIGHT_CM = 11.5


def _print_size_px(dpi: int) -> tuple[int, int]:
    return (round(CARD_WIDTH_CM * _CM_TO_IN * dpi), round(CARD_HEIGHT_CM * _CM_TO_IN * dpi))


# --- Sheet layouts (per-team / all-teams downloads) ------------------------
# Sheet cards are the same 6.6x11.5cm as the standalone single-card download: a
# 3x2 grid on A4 (6 per sheet), packed edge-to-edge with zero margin/gutter (cols/rows are
# each capped so cards never overlap: cols*card_width_cm <= width_cm and
# rows*card_height_cm <= height_cm) — any leftover slack that doesn't evenly
# divide the sheet (e.g. A4's 2x11.5=23 of 29.7cm rows) sits unused past the last
# column/row rather than being spread out as margins.
#
# A second, larger layout (SHEET_12X18) is for print shops running bigger
# stock — same 6.6x11.5cm card size, just more of them per page. It's a
# dataclass (rather than another set of bare module constants like the A4
# numbers above) so a second sheet size didn't mean duplicating every
# _a4_size_px/_sheet_card_size_px helper for it too.
@dataclass(frozen=True)
class SheetLayout:
    width_cm: float
    height_cm: float
    cols: int
    rows: int
    card_width_cm: float
    card_height_cm: float

    @property
    def cards_per_sheet(self) -> int:
        return self.cols * self.rows


A4_SHEET = SheetLayout(width_cm=21.0, height_cm=29.7, cols=3, rows=2, card_width_cm=6.6, card_height_cm=11.5)
# 12in x 18in print-shop stock (30.48 x 45.72cm), portrait, same 6.6x11.5cm
# card as the A4 sheet: 4 cols (4*6.6=26.4 of 30.48cm) x 3 rows (3*11.5=34.5 of
# 45.72cm — a 4th row wouldn't fit), 12 cards/sheet.
SHEET_12X18 = SheetLayout(width_cm=12 * 2.54, height_cm=18 * 2.54, cols=4, rows=3, card_width_cm=6.6, card_height_cm=11.5)


def _sheet_size_px(layout: SheetLayout, dpi: int) -> tuple[int, int]:
    return (round(layout.width_cm * _CM_TO_IN * dpi), round(layout.height_cm * _CM_TO_IN * dpi))


def _sheet_card_size_px(layout: SheetLayout, dpi: int) -> tuple[int, int]:
    return (round(layout.card_width_cm * _CM_TO_IN * dpi), round(layout.card_height_cm * _CM_TO_IN * dpi))


def render_sheet(cards: list[Image.Image], layout: SheetLayout = A4_SHEET, dpi: int = PRINT_DPI) -> Image.Image:
    """Lays out up to layout.cards_per_sheet already-rendered cards (native
    TEMPLATE_SIZE resolution, i.e. straight from render_id_card) into one
    sheet, left-to-right then top-to-bottom, packed edge-to-edge with zero
    margin/gutter (layout.cols/rows are chosen so this never overlaps — see
    SheetLayout's docstring). Fewer than a full page leaves the remaining
    grid cells blank — callers are expected to chunk a team's cards into
    groups of layout.cards_per_sheet themselves (see build_team_sheets),
    since a new team (or age group) must never share a sheet with what came
    before it."""
    sheet = Image.new("RGB", _sheet_size_px(layout, dpi), "white")
    card_size = _sheet_card_size_px(layout, dpi)
    for i, card in enumerate(cards[: layout.cards_per_sheet]):
        row, col = divmod(i, layout.cols)
        x = col * card_size[0]
        y = row * card_size[1]
        sheet.paste(card.resize(card_size, Image.LANCZOS), (x, y))
    return sheet


def build_team_sheets(
    cards: list[Image.Image], layout: SheetLayout = A4_SHEET, dpi: int = PRINT_DPI
) -> list[Image.Image]:
    """Chunks one team's rendered cards into groups of layout.cards_per_sheet
    and lays out one sheet per group — the last, possibly-partial group still
    gets its own sheet rather than bleeding into whatever comes next."""
    if not cards:
        return []
    return [
        render_sheet(cards[i : i + layout.cards_per_sheet], layout=layout, dpi=dpi)
        for i in range(0, len(cards), layout.cards_per_sheet)
    ]


def build_pdf_sheets(
    card_groups: list[list[Image.Image]], layout: SheetLayout = A4_SHEET, dpi: int = PRINT_DPI
) -> bytes:
    """The non-flattening counterpart to build_team_sheets + build_pdf: same
    grid math as render_sheet (identical card size, packed edge-to-edge with
    zero margin/gutter, computed here in points via SheetLayout's *_cm
    fields rather than pixel math, so the PDF's physical dimensions are
    never accidentally derived from a bitmap's pixel size) and the same
    per-card downscale to the PRINT_DPI-equivalent resolution — but each
    card is drawn onto a real ReportLab PDF page as its own independently
    embedded image object at the correct grid position, instead of being
    pasted onto one shared Pillow sheet bitmap first.

    `card_groups` is a list of card-image lists (e.g. one inner list per
    team, or per age group within a team) — each group always starts a
    fresh sheet page, exactly like build_team_sheets chunking a single
    team's cards, so a sheet never mixes cards from two different groups
    even if that leaves a group's last sheet partially empty. Pass a single
    group (`[cards]`) for the common one-group case, or append a trailing
    list's items onto an existing group instead of adding it as its own
    group when those cards should keep filling the same sheet rather than
    force a fresh one (see routers/exports.py's export_idcard_team)."""
    if not any(card_groups):
        raise ValueError("build_pdf_sheets requires at least one card")

    page_w_pt = layout.width_cm * _PT_PER_CM
    page_h_pt = layout.height_cm * _PT_PER_CM
    card_w_pt = layout.card_width_cm * _PT_PER_CM
    card_h_pt = layout.card_height_cm * _PT_PER_CM
    card_px_size = _sheet_card_size_px(layout, dpi)

    buf = io.BytesIO()
    pdf = Canvas(buf, pagesize=(page_w_pt, page_h_pt))
    for group in card_groups:
        for start in range(0, len(group), layout.cards_per_sheet):
            for i, card in enumerate(group[start : start + layout.cards_per_sheet]):
                row, col = divmod(i, layout.cols)
                x = col * card_w_pt
                y = page_h_pt - (row + 1) * card_h_pt
                resized = card.resize(card_px_size, Image.LANCZOS)
                pdf.drawImage(ImageReader(resized), x, y, width=card_w_pt, height=card_h_pt)
            pdf.showPage()
    pdf.save()
    return buf.getvalue()


# Coach/Manager cards are a fixed 8.2 x 11.5cm wherever they're tiled onto a
# sheet (matching STAFF_PAGE_WIDTH_CM/HEIGHT_CM below, the standalone page).
STAFF_SHEET_CARD_WIDTH_CM = 8.2
STAFF_SHEET_CARD_HEIGHT_CM = 11.5


def staff_sheet_layout(base: SheetLayout) -> SheetLayout:
    """The Coach/Manager equivalent of a participant SheetLayout: same
    physical page (width_cm/height_cm), but with the fixed staff card size
    and cols/rows recomputed by floor division — the staff card doesn't
    tile the page into the same grid as the participant card does, and
    packing stays edge-to-edge with zero gap/margin (see SheetLayout's own
    docstring), so cols/rows are capped to whatever actually fits without
    overlapping. Used both for a pure Coach/Manager sheet (see
    routers/exports.py's export_blank_staff_idcards) and internally by
    build_pdf_sheets_with_staff_tail below."""
    card_w = STAFF_SHEET_CARD_WIDTH_CM
    card_h = STAFF_SHEET_CARD_HEIGHT_CM
    cols = max(1, int(base.width_cm // card_w))
    rows = max(1, int(base.height_cm // card_h))
    return SheetLayout(width_cm=base.width_cm, height_cm=base.height_cm, cols=cols, rows=rows, card_width_cm=card_w, card_height_cm=card_h)


def build_pdf_sheets_with_staff_tail(
    participant_groups: list[list[Image.Image]],
    staff_cards: list[Image.Image],
    layout: SheetLayout = A4_SHEET,
    dpi: int = PRINT_DPI,
) -> bytes:
    """Like build_pdf_sheets, but `staff_cards` (Coach/Manager) are drawn at
    the fixed staff card size (STAFF_SHEET_CARD_WIDTH_CM x
    STAFF_SHEET_CARD_HEIGHT_CM) instead of layout's own participant card size. They still keep filling whatever room is left below the last
    participant row on the final participant page — rather than always
    forcing a fresh page — whenever that leftover space is tall enough for
    at least one row of the staff cards; any staff cards that don't fit
    there spill onto their own additional page(s), packed edge-to-edge at
    the bigger size with no participant cards on them.

    `participant_groups` is chunked into pages exactly like build_pdf_sheets
    (a group boundary always starts a fresh page). Pass `[]` for a
    staff-cards-only PDF (e.g. nothing to fit them after)."""
    if not any(participant_groups) and not staff_cards:
        raise ValueError("build_pdf_sheets_with_staff_tail requires at least one card")

    page_w_pt = layout.width_cm * _PT_PER_CM
    page_h_pt = layout.height_cm * _PT_PER_CM
    card_w_pt = layout.card_width_cm * _PT_PER_CM
    card_h_pt = layout.card_height_cm * _PT_PER_CM
    card_px_size = _sheet_card_size_px(layout, dpi)

    big = staff_sheet_layout(layout)
    big_w_pt = big.card_width_cm * _PT_PER_CM
    big_h_pt = big.card_height_cm * _PT_PER_CM
    big_px_size = _sheet_card_size_px(big, dpi)

    buf = io.BytesIO()
    pdf = Canvas(buf, pagesize=(page_w_pt, page_h_pt))

    def _draw_small(chunk: list[Image.Image]) -> None:
        for i, card in enumerate(chunk):
            row, col = divmod(i, layout.cols)
            x = col * card_w_pt
            y = page_h_pt - (row + 1) * card_h_pt
            resized = card.resize(card_px_size, Image.LANCZOS)
            pdf.drawImage(ImageReader(resized), x, y, width=card_w_pt, height=card_h_pt)

    def _draw_big(chunk: list[Image.Image], y_offset_cm: float) -> None:
        for i, card in enumerate(chunk):
            row, col = divmod(i, big.cols)
            x = col * big_w_pt
            y = page_h_pt - y_offset_cm * _PT_PER_CM - (row + 1) * big_h_pt
            resized = card.resize(big_px_size, Image.LANCZOS)
            pdf.drawImage(ImageReader(resized), x, y, width=big_w_pt, height=big_h_pt)

    participant_pages = [
        group[start : start + layout.cards_per_sheet]
        for group in participant_groups
        for start in range(0, len(group), layout.cards_per_sheet)
    ]

    remaining_staff = list(staff_cards)
    if participant_pages:
        for page in participant_pages[:-1]:
            _draw_small(page)
            pdf.showPage()
        last_page = participant_pages[-1]
        _draw_small(last_page)
        rows_used = -(-len(last_page) // layout.cols)  # ceil division
        leftover_height_cm = layout.height_cm - rows_used * layout.card_height_cm
        capacity_here = big.cols * int(leftover_height_cm // big.card_height_cm)
        if capacity_here > 0 and remaining_staff:
            _draw_big(remaining_staff[:capacity_here], rows_used * layout.card_height_cm)
            remaining_staff = remaining_staff[capacity_here:]
        pdf.showPage()

    # Whatever staff cards didn't fit on the last participant page (or all
    # of them, if there were no participant cards at all) get their own
    # page(s), packed at the staff size only.
    for start in range(0, len(remaining_staff), big.cards_per_sheet):
        _draw_big(remaining_staff[start : start + big.cards_per_sheet], 0)
        pdf.showPage()

    pdf.save()
    return buf.getvalue()


# Inset a few px inside the orange border so the photo never overlaps it.
PHOTO_BOX = (367, 486, 663, 798)

FONT_BOLD_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
VALUE_COLOR = (15, 23, 42)
VALUE_MAX_SIZE = 32
VALUE_MIN_SIZE = 16
VALUE_X = 425
VALUE_MAX_WIDTH = 535
# Measured px from a field's text baseline down to its own printed
# underline (consistent across every field on this template — see the
# FIELD_LINES values vs. the underline rows they were measured against).
UNDERLINE_OFFSET = 12

# (field key, [baseline y, ...]) — value text is drawn just above each
# printed underline, left-aligned starting at VALUE_X. School Name gets two
# lines on this template (it's the one field long enough to regularly need
# wrapping — a school's full name rarely fits in one line at a readable
# size), everything else is a single line.
FIELD_LINES = [
    ("name", [959]),
    ("father_name", [1007]),
    ("dob", [1056]),
    ("uid", [1105]),
    ("class_", [1155]),
    ("category", [1202]),
    ("school", [1243, 1275]),
]


def _fit_font(draw: ImageDraw.ImageDraw, text: str, max_width: int) -> ImageFont.FreeTypeFont:
    size = VALUE_MAX_SIZE
    while size > VALUE_MIN_SIZE:
        font = ImageFont.truetype(FONT_BOLD_PATH, size)
        if draw.textlength(text, font=font) <= max_width:
            return font
        size -= 2
    return ImageFont.truetype(FONT_BOLD_PATH, VALUE_MIN_SIZE)


def _wrap_to_lines(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int, max_lines: int) -> list[str]:
    """Greedy word-wrap into at most max_lines lines that each fit max_width
    at the given font. If it still doesn't fit within max_lines, the last
    line is truncated with an ellipsis rather than overflowing the card."""
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=font) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
            if len(lines) == max_lines:
                break
    if current and len(lines) < max_lines:
        lines.append(current)
    if not lines:
        lines = [text]

    if len(lines) > max_lines:
        lines = lines[:max_lines]
    # if words remain unplaced (broke out of the loop above, or the wrap
    # simply produced more lines than allowed), mark the last line truncated
    consumed = " ".join(lines)
    if len(consumed) < len(text.rstrip()):
        last = lines[max_lines - 1]
        while draw.textlength(last + "…", font=font) > max_width and len(last) > 1:
            last = last[:-1].rstrip()
        lines[max_lines - 1] = last + "…"
    return lines


def _fit_font_multiline(draw: ImageDraw.ImageDraw, text: str, max_width: int, max_lines: int, max_size: int = VALUE_MAX_SIZE) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    size = max_size
    while size > VALUE_MIN_SIZE:
        font = ImageFont.truetype(FONT_BOLD_PATH, size)
        if draw.textlength(text, font=font) <= max_width:
            return font, [text]
        lines = _wrap_to_lines(draw, text, font, max_width, max_lines)
        if len(lines) <= max_lines and all(draw.textlength(line, font=font) <= max_width for line in lines):
            return font, lines
        size -= 2
    font = ImageFont.truetype(FONT_BOLD_PATH, VALUE_MIN_SIZE)
    return font, _wrap_to_lines(draw, text, font, max_width, max_lines)


def _draw_value(
    draw: ImageDraw.ImageDraw,
    baseline_ys: list[int],
    text: "str | None",
    x: int = VALUE_X,
    max_width: int = VALUE_MAX_WIDTH,
) -> None:
    if not text:
        return
    if len(baseline_ys) == 1:
        font = _fit_font(draw, text, max_width)
        draw.text((x, baseline_ys[0]), text, font=font, fill=VALUE_COLOR, anchor="ls")
        return
    # Cap the font size so a wrapped line's ascender never reaches up past
    # the printed underline of the line above it. Baseline-to-baseline
    # spacing alone isn't the right budget for that: the line above's own
    # underline already eats UNDERLINE_OFFSET px of that gap, and a font's
    # actual ascent (queried from the font itself, not assumed) is what can
    # collide with it — templates don't all give multi-line fields the same
    # breathing room (e.g. school name's two lines sit closer together on
    # some template revisions than others), so this is derived from the
    # measured baselines rather than hardcoded.
    clearance = min(b - a for a, b in zip(baseline_ys, baseline_ys[1:])) - UNDERLINE_OFFSET
    max_size = VALUE_MAX_SIZE
    while max_size > VALUE_MIN_SIZE:
        ascent, _descent = ImageFont.truetype(FONT_BOLD_PATH, max_size).getmetrics()
        if ascent <= clearance:
            break
        max_size -= 2
    font, lines = _fit_font_multiline(draw, text, max_width, len(baseline_ys), max_size=max_size)
    for baseline_y, line in zip(baseline_ys, lines):
        draw.text((x, baseline_y), line, font=font, fill=VALUE_COLOR, anchor="ls")


def _paste_photo(card: Image.Image, photo_path: "Path | None", box: tuple[int, int, int, int] = PHOTO_BOX) -> None:
    if not photo_path or not photo_path.exists():
        return  # template's own placeholder silhouette shows through
    try:
        photo = Image.open(photo_path).convert("RGB")
    except Exception:  # noqa: BLE001
        return
    box_w = box[2] - box[0]
    box_h = box[3] - box[1]
    # Center-crop to the box's aspect ratio first (object-fit: cover), then
    # resize — avoids stretching a non-square photo.
    src_w, src_h = photo.size
    target_ratio = box_w / box_h
    src_ratio = src_w / src_h
    if src_ratio > target_ratio:
        new_w = int(src_h * target_ratio)
        x0 = (src_w - new_w) // 2
        photo = photo.crop((x0, 0, x0 + new_w, src_h))
    else:
        new_h = int(src_w / target_ratio)
        y0 = (src_h - new_h) // 2
        photo = photo.crop((0, y0, src_w, y0 + new_h))
    photo = photo.resize((box_w, box_h), Image.LANCZOS)
    card.paste(photo, (box[0], box[1]))


def render_id_card(participant, team, photo_path: "Path | None" = None) -> Image.Image:
    """Composites one participant's card at the template's native
    resolution (TEMPLATE_SIZE) — the size every other function in this
    module scales down from, whether that's a full-page standalone card
    (render_id_card_page) or a small grid cell on an A4 sheet (render_sheet).
    `photo_path` is the absolute path to the participant's photo file on
    disk, if any (resolved by the caller from participant.photo_filename)."""
    card = Image.open(TEMPLATE_PATH).convert("RGB").resize(TEMPLATE_SIZE)
    _paste_photo(card, photo_path)

    draw = ImageDraw.Draw(card)
    values = {
        "name": participant.full_name,
        "father_name": participant.father_name,
        "dob": participant.date_of_birth.strftime("%d-%m-%Y") if participant.date_of_birth else None,
        "uid": participant.registration_no,
        "class_": participant.student_class,
        "category": participant.age_group,
        "school": team.school or team.name,
    }
    for key, baseline_ys in FIELD_LINES:
        _draw_value(draw, baseline_ys, values.get(key))

    return card


def render_id_card_page(participant, team, photo_path: "Path | None" = None, dpi: int = PRINT_DPI) -> Image.Image:
    """A single card filling its own full 6.6x11.5cm page — what the
    per-participant download uses."""
    return render_id_card(participant, team, photo_path).resize(_print_size_px(dpi), Image.LANCZOS)


# --- Volunteer ID cards ------------------------------------------------
# A separate, much simpler template (backend/assets/templates/
# volunteer_id_card_template.png) — same TEMPLATE_SIZE/physical card size as
# the participant card (so it reuses every sheet/PDF helper above
# unchanged), but only a photo + Name + Class, no team/school affiliation.
# Box/line coordinates measured the same way as PHOTO_BOX/FIELD_LINES above
# — re-measure if this template is ever redesigned.
VOLUNTEER_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "assets" / "templates" / "volunteer_id_card_template.png"
VOLUNTEER_PHOTO_BOX = (366, 486, 662, 800)
VOLUNTEER_VALUE_X = 407
VOLUNTEER_VALUE_MAX_WIDTH = 550
VOLUNTEER_FIELD_LINES = [
    ("full_name", [1047]),
    ("student_class", [1177]),
]


def render_volunteer_id_card(volunteer, photo_path: "Path | None" = None) -> Image.Image:
    """Composites one volunteer's card at the template's native resolution
    — mirrors render_id_card above but against the volunteer template/
    coordinates and a smaller field set (no team, no CBSE UID, ...)."""
    card = Image.open(VOLUNTEER_TEMPLATE_PATH).convert("RGB").resize(TEMPLATE_SIZE)
    _paste_photo(card, photo_path, box=VOLUNTEER_PHOTO_BOX)

    draw = ImageDraw.Draw(card)
    values = {"full_name": volunteer.full_name, "student_class": volunteer.student_class}
    for key, baseline_ys in VOLUNTEER_FIELD_LINES:
        _draw_value(draw, baseline_ys, values.get(key), x=VOLUNTEER_VALUE_X, max_width=VOLUNTEER_VALUE_MAX_WIDTH)

    return card


def render_volunteer_id_card_page(volunteer, photo_path: "Path | None" = None, dpi: int = PRINT_DPI) -> Image.Image:
    """A single volunteer card filling its own full 6.6x11.5cm page — what the
    per-volunteer download uses."""
    return render_volunteer_id_card(volunteer, photo_path).resize(_print_size_px(dpi), Image.LANCZOS)


# --- Official ID cards (CBSE officials monitoring the game) -----------------
# Its own designed template (backend/assets/templates/official_id_card_template
# .png, 1024x1536 like the participant/volunteer one) with Name / Designation /
# Organization / Official ID No. / Mobile No. filled in and Signature left
# blank for physical signing. Printed at the Coach/Manager size
# (STAFF_PAGE_WIDTH_CM x STAFF_PAGE_HEIGHT_CM, and tiled with
# staff_sheet_layout on sheets), not the participant/volunteer size. Photo box
# and underline rows measured off the template like everything above.
OFFICIAL_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "assets" / "templates" / "official_id_card_template.png"
OFFICIAL_PHOTO_BOX = (370, 410, 654, 716)
OFFICIAL_VALUE_X = 395
OFFICIAL_VALUE_MAX_WIDTH = 555
OFFICIAL_FIELD_LINES = [
    ("full_name", [924]),
    ("designation", [985]),
    ("organization", [1048]),
    ("official_id_no", [1113]),
    ("phone", [1180]),
]


def render_official_id_card(official, photo_path: "Path | None" = None) -> Image.Image:
    """Composites one official's card at the template's native resolution
    (TEMPLATE_SIZE) — mirrors render_volunteer_id_card."""
    card = Image.open(OFFICIAL_TEMPLATE_PATH).convert("RGB").resize(TEMPLATE_SIZE)
    _paste_photo(card, photo_path, box=OFFICIAL_PHOTO_BOX)

    draw = ImageDraw.Draw(card)
    values = {
        "full_name": official.full_name,
        "designation": official.designation,
        "organization": official.organization,
        "official_id_no": official.official_id_no,
        "phone": official.phone,
    }
    for key, baseline_ys in OFFICIAL_FIELD_LINES:
        _draw_value(draw, baseline_ys, values.get(key), x=OFFICIAL_VALUE_X, max_width=OFFICIAL_VALUE_MAX_WIDTH)

    return card


def render_official_id_card_page(official, photo_path: "Path | None" = None, dpi: int = PRINT_DPI) -> Image.Image:
    """A single official card filling its own full page at the Coach/Manager
    size (STAFF_PAGE_WIDTH_CM x STAFF_PAGE_HEIGHT_CM)."""
    return render_official_id_card(official, photo_path).resize(_staff_page_size_px(dpi), Image.LANCZOS)


def render_blank_participant_card(kind: str) -> Image.Image:
    """The bare Participant or Volunteer template — no photo, no text — at
    native TEMPLATE_SIZE, for pre-printing blank card stock (see
    routers/exports.py's blank-bulk download)."""
    path = {"Volunteer": VOLUNTEER_TEMPLATE_PATH, "Official": OFFICIAL_TEMPLATE_PATH}.get(kind, TEMPLATE_PATH)
    return Image.open(path).convert("RGB").resize(TEMPLATE_SIZE)


def render_blank_participant_card_page(kind: str, dpi: int = PRINT_DPI) -> Image.Image:
    """A single blank Participant/Volunteer card filling its own full 6.6x11.5cm
    page — same page treatment as render_id_card_page. An Official card uses
    the Coach/Manager page size instead, like render_official_id_card_page."""
    size = _staff_page_size_px(dpi) if kind == "Official" else _print_size_px(dpi)
    return render_blank_participant_card(kind).resize(size, Image.LANCZOS)


# --- ID card back (shared, static artwork) ----------------------------------
# One 1024x1536 back-side graphic (backend/assets/templates/
# id_card_back_template.png), no per-person data. Printed in two physical
# sizes to match the fronts: "participant" (Participant/Volunteer,
# CARD_WIDTH_CM x CARD_HEIGHT_CM) and "staff" (Coach/Manager/Official,
# STAFF_PAGE_WIDTH_CM x STAFF_PAGE_HEIGHT_CM, with staff_sheet_layout grids).
BACK_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "assets" / "templates" / "id_card_back_template.png"


def render_id_back() -> Image.Image:
    return Image.open(BACK_TEMPLATE_PATH).convert("RGB").resize(TEMPLATE_SIZE)


def render_id_back_page(size: str, dpi: int = PRINT_DPI) -> Image.Image:
    """One back filling its own page at the front-card size for `size`
    ("participant" or "staff")."""
    px = _staff_page_size_px(dpi) if size == "staff" else _print_size_px(dpi)
    return render_id_back().resize(px, Image.LANCZOS)


def build_pdf(cards: list[Image.Image], dpi: int = PRINT_DPI) -> bytes:
    if not cards:
        raise ValueError("build_pdf requires at least one card")
    buf = io.BytesIO()
    cards[0].save(
        buf, format="PDF", save_all=True, append_images=cards[1:],
        resolution=float(dpi),
    )
    return buf.getvalue()


# --- Coach / Manager ("staff") ID cards ------------------------------------
# One shared layout (backend/assets/templates/{coach,manager}_id_card_
# template.png) used for both roles — same photo box and field positions,
# just different artwork/heading per role. Box/line coordinates measured the
# same way as PHOTO_BOX/FIELD_LINES above, off the coach template resized to
# STAFF_TEMPLATE_SIZE (the manager template lands within ~5px of the same
# lines once resized to this same canvas — close enough to share one set of
# coordinates rather than keep two nearly-identical tables in sync).
STAFF_TEMPLATE_SIZE = (1024, 1280)
STAFF_TEMPLATE_PATHS = {
    "Coach": Path(__file__).resolve().parent.parent / "assets" / "templates" / "coach_id_card_template.png",
    "Manager": Path(__file__).resolve().parent.parent / "assets" / "templates" / "manager_id_card_template.png",
}
STAFF_PHOTO_BOX = (398, 378, 623, 602)
STAFF_VALUE_X = 390
STAFF_VALUE_MAX_WIDTH = 549
STAFF_FIELD_LINES = [
    ("full_name", [781]),
    ("aadhaar_no", [846]),
    ("phone", [918]),
    ("school", [979, 1023]),
    # Signature is left blank for physical signing — no field drawn for it.
]

# Physical page size for a *single* Coach/Manager card download — a custom
# small-badge size (not a fixed named paper size), currently 8.2 x 11.5cm —
# change these two constants directly for any future resize. The card art
# (STAFF_TEMPLATE_SIZE, 0.8 aspect vs. this page's ~0.713) is scaled to fill
# the page exactly, a ~11% horizontal squeeze of the whole card, so it has no
# blank margins and the layout stays proportionally intact.
STAFF_PAGE_WIDTH_CM = 8.2
STAFF_PAGE_HEIGHT_CM = 11.5


def _staff_page_size_px(dpi: int) -> tuple[int, int]:
    return (round(STAFF_PAGE_WIDTH_CM * _CM_TO_IN * dpi), round(STAFF_PAGE_HEIGHT_CM * _CM_TO_IN * dpi))


def _contain_fit_page(card: Image.Image, page_w: int, page_h: int) -> Image.Image:
    """Centers `card` on a blank white page of exactly (page_w, page_h)
    pixels, scaled up to the largest size that preserves its own aspect
    ratio — used instead of a plain resize wherever the card's aspect
    doesn't exactly match the target page, so nothing stretches."""
    page = Image.new("RGB", (page_w, page_h), "white")
    card_ratio = card.width / card.height
    page_ratio = page_w / page_h
    if card_ratio > page_ratio:
        new_w, new_h = page_w, round(page_w / card_ratio)
    else:
        new_h, new_w = page_h, round(page_h * card_ratio)
    resized = card.resize((new_w, new_h), Image.LANCZOS)
    page.paste(resized, ((page_w - new_w) // 2, (page_h - new_h) // 2))
    return page


def _template_for_role(role: "str | None") -> Path:
    return STAFF_TEMPLATE_PATHS.get(role or "Coach", STAFF_TEMPLATE_PATHS["Coach"])


def render_staff_id_card(coach, team, photo_path: "Path | None" = None) -> Image.Image:
    """Composites one coach/manager's card at the template's native
    resolution — mirrors render_id_card/render_volunteer_id_card above,
    picking the Coach or Manager template by coach.role."""
    card = Image.open(_template_for_role(coach.role)).convert("RGB").resize(STAFF_TEMPLATE_SIZE)
    _paste_photo(card, photo_path, box=STAFF_PHOTO_BOX)

    draw = ImageDraw.Draw(card)
    values = {
        "full_name": coach.full_name,
        "aadhaar_no": coach.aadhaar_no,
        "phone": coach.phone,
        "school": team.school or team.name if team else None,
    }
    for key, baseline_ys in STAFF_FIELD_LINES:
        _draw_value(draw, baseline_ys, values.get(key), x=STAFF_VALUE_X, max_width=STAFF_VALUE_MAX_WIDTH)

    return card


def render_staff_id_card_page(coach, team, photo_path: "Path | None" = None, dpi: int = PRINT_DPI) -> Image.Image:
    """A single filled card centered on its own full page — what the
    per-coach/manager download uses (see STAFF_PAGE_WIDTH_CM/HEIGHT_CM)."""
    return render_staff_id_card(coach, team, photo_path).resize(_staff_page_size_px(dpi), Image.LANCZOS)


def render_blank_staff_card(role: str) -> Image.Image:
    """The bare template — no photo, no text — for pre-printing blank card
    stock (see routers/exports.py's blank-bulk download), and as the
    stand-in card for a team with no Coach/Manager on record yet (see
    routers/exports.py's _team_staff_cards)."""
    return Image.open(_template_for_role(role)).convert("RGB").resize(STAFF_TEMPLATE_SIZE)


def render_blank_staff_card_page(role: str, dpi: int = PRINT_DPI) -> Image.Image:
    """A single blank card centered on its own full page — the "one per
    page" bulk-blank option, same page treatment as render_staff_id_card_page."""
    return render_blank_staff_card(role).resize(_staff_page_size_px(dpi), Image.LANCZOS)
