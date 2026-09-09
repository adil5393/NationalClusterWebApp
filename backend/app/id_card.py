"""Renders the fixed CBSE National Kabaddi ID-card graphic
(backend/assets/templates/id_card_template.png) for one participant, and
combines any number of rendered cards into a single multi-page PDF.

There's no PDF library in this project (no reportlab/fpdf/weasyprint) and no
precedent for compositing text onto a fixed background image server-side —
Pillow (already a dependency for participant/gallery photo optimization, see
image_utils.py) can do both: draw text/paste a photo onto the template with
ImageDraw, and save a list of rendered pages straight to a multi-page PDF via
Image.save(..., format="PDF", save_all=True). No new dependency needed.

All of the box/line coordinates below were measured directly off the
1024x1536 template PNG (scanning for the photo box's orange border and the
seven field underlines) — if the template graphic is ever redesigned, these
need to be re-measured, there's no dynamic layout here by design (it's a
fixed print template, not a flowable document).
"""
import io
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

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

# Physical card size the org wants printed: 7cm wide x 10cm tall. 300 DPI is
# standard print quality; PDF page size comes from pixel-size / DPI, so this
# pins the exact physical output regardless of the template's native pixel
# aspect ratio (1024:1536 = 2:3 ≈ 0.667, vs. the requested 7:10 = 0.7 — close
# enough that scaling the whole composited card to this pixel size is an
# imperceptible stretch, not a visible distortion).
PRINT_DPI = 300
# Used only for the "every participant, tournament-wide" bulk export — at
# full 300 DPI that export is impractically large (measured 200MB+ at
# thousands of participants). 150 DPI keeps text and photos clearly legible
# on an A4 sheet while landing the file much smaller.
BULK_PRINT_DPI = 150
_CM_TO_IN = 1 / 2.54

# Standalone single-card page size (used by the per-participant download —
# one card fills the whole page, at its real 7x10cm print size).
CARD_WIDTH_CM = 7.0
CARD_HEIGHT_CM = 10.0


def _print_size_px(dpi: int) -> tuple[int, int]:
    return (round(CARD_WIDTH_CM * _CM_TO_IN * dpi), round(CARD_HEIGHT_CM * _CM_TO_IN * dpi))


# --- A4 sheet layout (per-team / all-teams downloads) ---------------------
# The org wants at least 9 cards per A4 portrait sheet, so cards there are
# printed smaller than the standalone single-card download: a 3x3 grid of
# 6x8.5cm cards (barely narrower than 7x10, same 0.7-ish aspect ratio) with
# even margins/gutters, chosen so the whole grid divides A4 (21 x 29.7cm)
# exactly with no leftover slack:
#   horizontal: 4 gaps (left margin + 2 gutters + right margin) x 0.75cm
#               + 3 cards x 6.0cm = 3 + 18 = 21cm
#   vertical:   4 gaps x 1.05cm + 3 cards x 8.5cm = 4.2 + 25.5 = 29.7cm
A4_WIDTH_CM = 21.0
A4_HEIGHT_CM = 29.7
SHEET_COLS = 3
SHEET_ROWS = 3
CARDS_PER_SHEET = SHEET_COLS * SHEET_ROWS
SHEET_CARD_WIDTH_CM = 6.0
SHEET_CARD_HEIGHT_CM = 8.5
SHEET_MARGIN_X_CM = 0.75
SHEET_MARGIN_Y_CM = 1.05


def _a4_size_px(dpi: int) -> tuple[int, int]:
    return (round(A4_WIDTH_CM * _CM_TO_IN * dpi), round(A4_HEIGHT_CM * _CM_TO_IN * dpi))


def _sheet_card_size_px(dpi: int) -> tuple[int, int]:
    return (round(SHEET_CARD_WIDTH_CM * _CM_TO_IN * dpi), round(SHEET_CARD_HEIGHT_CM * _CM_TO_IN * dpi))


def render_sheet(cards: list[Image.Image], dpi: int = PRINT_DPI) -> Image.Image:
    """Lays out up to CARDS_PER_SHEET already-rendered cards (native
    TEMPLATE_SIZE resolution, i.e. straight from render_id_card) into one
    A4 page, left-to-right then top-to-bottom. Fewer than a full 9 leaves
    the remaining grid cells blank — callers are expected to chunk a team's
    cards into groups of CARDS_PER_SHEET themselves (see build_team_sheets),
    since a new team must never share a sheet with the previous one."""
    sheet = Image.new("RGB", _a4_size_px(dpi), "white")
    card_size = _sheet_card_size_px(dpi)
    margin_x_px = round(SHEET_MARGIN_X_CM * _CM_TO_IN * dpi)
    margin_y_px = round(SHEET_MARGIN_Y_CM * _CM_TO_IN * dpi)
    for i, card in enumerate(cards[:CARDS_PER_SHEET]):
        row, col = divmod(i, SHEET_COLS)
        x = margin_x_px + col * (card_size[0] + margin_x_px)
        y = margin_y_px + row * (card_size[1] + margin_y_px)
        sheet.paste(card.resize(card_size, Image.LANCZOS), (x, y))
    return sheet


def build_team_sheets(cards: list[Image.Image], dpi: int = PRINT_DPI) -> list[Image.Image]:
    """Chunks one team's rendered cards into groups of CARDS_PER_SHEET and
    lays out one A4 sheet per group — the last, possibly-partial group still
    gets its own sheet rather than bleeding into whatever comes next."""
    if not cards:
        return []
    return [
        render_sheet(cards[i : i + CARDS_PER_SHEET], dpi=dpi)
        for i in range(0, len(cards), CARDS_PER_SHEET)
    ]


# Inset a few px inside the orange border so the photo never overlaps it.
PHOTO_BOX = (364, 466, 660, 776)

FONT_BOLD_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
VALUE_COLOR = (15, 23, 42)
VALUE_MAX_SIZE = 32
VALUE_MIN_SIZE = 16
VALUE_X = 425
VALUE_MAX_WIDTH = 535

# (field key, [baseline y, ...]) — value text is drawn just above each
# printed underline, left-aligned starting at VALUE_X. School Name gets two
# lines on this template (it's the one field long enough to regularly need
# wrapping — a school's full name rarely fits in one line at a readable
# size), everything else is a single line.
FIELD_LINES = [
    ("name", [939]),
    ("father_name", [987]),
    ("dob", [1037]),
    ("uid", [1088]),
    ("class_", [1139]),
    ("category", [1188]),
    ("school", [1235, 1280]),
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


def _fit_font_multiline(draw: ImageDraw.ImageDraw, text: str, max_width: int, max_lines: int) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    size = VALUE_MAX_SIZE
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


def _draw_value(draw: ImageDraw.ImageDraw, baseline_ys: list[int], text: "str | None") -> None:
    if not text:
        return
    if len(baseline_ys) == 1:
        font = _fit_font(draw, text, VALUE_MAX_WIDTH)
        draw.text((VALUE_X, baseline_ys[0]), text, font=font, fill=VALUE_COLOR, anchor="ls")
        return
    font, lines = _fit_font_multiline(draw, text, VALUE_MAX_WIDTH, len(baseline_ys))
    for baseline_y, line in zip(baseline_ys, lines):
        draw.text((VALUE_X, baseline_y), line, font=font, fill=VALUE_COLOR, anchor="ls")


def _paste_photo(card: Image.Image, photo_path: "Path | None") -> None:
    if not photo_path or not photo_path.exists():
        return  # template's own placeholder silhouette shows through
    try:
        photo = Image.open(photo_path).convert("RGB")
    except Exception:  # noqa: BLE001
        return
    box_w = PHOTO_BOX[2] - PHOTO_BOX[0]
    box_h = PHOTO_BOX[3] - PHOTO_BOX[1]
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
    card.paste(photo, (PHOTO_BOX[0], PHOTO_BOX[1]))


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
    """A single card filling its own full 7x10cm page — what the
    per-participant download uses."""
    return render_id_card(participant, team, photo_path).resize(_print_size_px(dpi), Image.LANCZOS)


def build_pdf(cards: list[Image.Image], dpi: int = PRINT_DPI) -> bytes:
    if not cards:
        raise ValueError("build_pdf requires at least one card")
    buf = io.BytesIO()
    cards[0].save(
        buf, format="PDF", save_all=True, append_images=cards[1:],
        resolution=float(dpi),
    )
    return buf.getvalue()
