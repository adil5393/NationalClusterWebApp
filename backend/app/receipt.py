"""Renders two kinds of single-page A4 PDF documents for a team's
registration-fee ledger (see models.Payment / routers/payments.py):

- Invoice (render_invoice): the team's full current billing state — every
  member across every BILL this team has ever had, at whatever per-member
  rate each bill used, plus aggregate subtotal/discount/total billed and
  live Total Paid/Balance Due. Downloaded on demand (routers/payments.py
  get_invoice), not produced as a side effect of billing or recording a
  payment — those are both record-only, so this always reflects "now."
- Refund voucher (render_refund_voucher): letterhead + payment meta +
  reason + a red amount box showing what was refunded, plus the team's
  Total Billed/Total Paid/Net Collected for context.

Both share the same letterhead/meta-row/signature-footer layout, drawn once
via _draw_letterhead/_draw_meta_block/_draw_signature_footer below.

Same "no PDF library, Pillow draws + saves as PDF" approach as id_card.py —
kept in its own module since these documents' shape (fixed A4 page,
dynamic-height table) is a different layout problem from the fixed-template
ID card.
"""
import io
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Flat per-member registration fee (Rs.) — the default a bill uses unless the
# organizer overrides it; change here if the org's default fee ever changes.
REGISTRATION_FEE = 500

HOST_SCHOOL_NAME = "New Angels Sr. Sec. School, Pratapgarh, Uttar Pradesh"
TOURNAMENT_NAME = "CBSE Kabaddi Nationals Championship 2026-2027"
LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "monogram" / "logo.png"

PRINT_DPI = 200
_CM_TO_IN = 1 / 2.54
A4_WIDTH_CM, A4_HEIGHT_CM = 21.0, 29.7
PAGE_W = round(A4_WIDTH_CM * _CM_TO_IN * PRINT_DPI)
PAGE_H = round(A4_HEIGHT_CM * _CM_TO_IN * PRINT_DPI)
MARGIN = round(1.5 * _CM_TO_IN * PRINT_DPI)

FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
FONT_REGULAR_PATH = str(FONT_DIR / "DejaVuSans.ttf")
FONT_BOLD_PATH = str(FONT_DIR / "DejaVuSans-Bold.ttf")

INK = (15, 23, 42)
MUTED = (71, 85, 105)
GOLD = (217, 119, 6)  # brand accent (Amber 600), matches excel_styler.CLR_GOLD
RULE = (148, 163, 184)
TABLE_HEADER_FILL = (30, 41, 59)
TABLE_HEADER_TEXT = (255, 255, 255)
ZEBRA_FILL = (241, 245, 249)
TOTAL_FILL = (226, 232, 240)
REFUND_RED = (185, 28, 28)  # Red 700 — refund amount stands out as money leaving, not being collected
REFUND_FILL = (254, 242, 242)  # Red 50
PAID_GREEN = (21, 128, 61)  # Green 700 — payment received

# Table row height is picked to fit whatever's available between the meta
# block and the reserved signature footer (see render_invoice_image) — these
# just bound how small/large a row is allowed to get so a 3-member team
# doesn't get absurdly tall rows, and a 30-member team doesn't get
# unreadably short ones.
ROW_H_MIN = round(0.7 * _CM_TO_IN * PRINT_DPI)
ROW_H_MAX = round(1.1 * _CM_TO_IN * PRINT_DPI)

# Column widths as fractions of the table's content width (must sum to 1.0).
COL_FRACTIONS = {"no": 0.08, "name": 0.47, "role": 0.20, "amount": 0.25}

# Space reserved at the bottom of every document for the signature footer
# (see _draw_signature_footer) — content must lay out above this, not into it.
SIGNATURE_BLOCK_H = round(2.2 * _CM_TO_IN * PRINT_DPI)


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD_PATH if bold else FONT_REGULAR_PATH, size)


def _centered_text(draw: ImageDraw.ImageDraw, y: int, text: str, font: ImageFont.FreeTypeFont, fill) -> None:
    w = draw.textlength(text, font=font)
    draw.text(((PAGE_W - w) / 2, y), text, font=font, fill=fill)


def _new_page() -> "tuple[Image.Image, ImageDraw.ImageDraw]":
    img = Image.new("RGB", (PAGE_W, PAGE_H), "white")
    return img, ImageDraw.Draw(img)


def _draw_letterhead(draw: ImageDraw.ImageDraw, img: Image.Image, subtitle: str) -> int:
    """Logo + tournament name + host school name + document subtitle,
    centered, ending with a horizontal rule. Shared by all three document
    kinds — same letterhead, different subtitle/body below it. Returns the
    y position just below the rule."""
    y = MARGIN
    if LOGO_PATH.exists():
        logo = Image.open(LOGO_PATH).convert("RGBA")
        logo_h = round(2.4 * _CM_TO_IN * PRINT_DPI)
        ratio = logo_h / logo.height
        logo = logo.resize((round(logo.width * ratio), logo_h), Image.LANCZOS)
        img.paste(logo, (round((PAGE_W - logo.width) / 2), y), logo)
        y += logo_h + round(0.25 * _CM_TO_IN * PRINT_DPI)

    _centered_text(draw, y, TOURNAMENT_NAME, _font(19, bold=True), GOLD)
    y += 32
    _centered_text(draw, y, HOST_SCHOOL_NAME, _font(34, bold=True), INK)
    y += 48
    _centered_text(draw, y, subtitle, _font(20), MUTED)
    y += 40

    draw.line([(MARGIN, y), (PAGE_W - MARGIN, y)], fill=RULE, width=2)
    y += round(0.5 * _CM_TO_IN * PRINT_DPI)
    return y


def _draw_meta_block(
    draw: ImageDraw.ImageDraw,
    y: int,
    team,
    left_label: str,
    txn_date: date,
    payment_mode: "str | None" = None,
    transaction_id: "str | None" = None,
) -> int:
    """The two-line "who / when [/ how paid]" block shared by all three
    document kinds:
        {left_label}: {team.name}                         Date: dd-mm-yyyy
        School Code: X          [Payment Mode: Cash|UPI • Txn ID: ...]
    payment_mode is omitted entirely for a BILL (an invoice, not a payment —
    see render_invoice_image), and given for PAYMENT/REFUND. Returns y just
    below it."""
    meta_font = _font(19, bold=True)
    line_gap = 34

    draw.text((MARGIN, y), f"{left_label}: {team.name}", font=meta_font, fill=INK)
    date_text = f"Date: {txn_date.strftime('%d-%m-%Y')}"
    draw.text((PAGE_W - MARGIN - draw.textlength(date_text, font=meta_font), y), date_text, font=meta_font, fill=INK)
    y += line_gap

    school_code_text = f"School Code: {team.school_code or '—'}"
    draw.text((MARGIN, y), school_code_text, font=_font(17), fill=MUTED)

    if payment_mode:
        payment_text = (
            f"Payment Mode: UPI  •  Txn ID: {transaction_id}"
            if payment_mode == "UPI"
            else "Payment Mode: Cash"
        )
        draw.text(
            (PAGE_W - MARGIN - draw.textlength(payment_text, font=meta_font), y),
            payment_text, font=meta_font, fill=INK,
        )
    return y + line_gap + round(0.35 * _CM_TO_IN * PRINT_DPI)


def _draw_signature_footer(draw: ImageDraw.ImageDraw) -> None:
    """Two blank signature lines, fixed near the bottom of every document
    regardless of how much content is above them (see SIGNATURE_BLOCK_H,
    which every layout reserves space for)."""
    line_y = PAGE_H - MARGIN - round(0.6 * _CM_TO_IN * PRINT_DPI)
    line_w = round(6.0 * _CM_TO_IN * PRINT_DPI)
    label_font = _font(16, bold=True)

    left_x = MARGIN
    draw.line([(left_x, line_y), (left_x + line_w, line_y)], fill=RULE, width=1)
    _centered = "Manager Signature"
    tw = draw.textlength(_centered, font=label_font)
    draw.text((left_x + (line_w - tw) / 2, line_y + 10), _centered, font=label_font, fill=MUTED)

    right_x = PAGE_W - MARGIN - line_w
    draw.line([(right_x, line_y), (right_x + line_w, line_y)], fill=RULE, width=1)
    _centered2 = "Principal Signature"
    tw2 = draw.textlength(_centered2, font=label_font)
    draw.text((right_x + (line_w - tw2) / 2, line_y + 10), _centered2, font=label_font, fill=MUTED)


def render_invoice_image(
    team,
    members: list[dict],
    subtotal: int,
    discount: int,
    total_paid: int,
    invoice_date: date,
) -> Image.Image:
    """The team's full current billing state, downloaded on demand from the
    Invoice tab (routers/payments.py get_invoice) rather than produced as a
    side effect of billing or paying — so it always reflects the latest
    picture, not a frozen snapshot from whenever a bill or payment happened.

    members: [{"name": str, "role": str, "amount": int}, ...] — every member
    across every BILL this team has ever had, each at whatever per-member
    rate that particular bill used (bills can use different rates over
    time). subtotal is the sum of those member amounts; discount is the sum
    of every bill's discount; total_paid comes from summing PAYMENT rows.
    Balance due is derived here (subtotal - discount - total_paid) rather
    than passed in, so this module stays the single source of truth for
    that arithmetic. Split from render_invoice (which just saves this as a
    PDF) the same way id_card.render_id_card is split from
    render_id_card_page — lets tests inspect/save the rendered page
    directly instead of round-tripping through PDF bytes, which Pillow can
    produce but not re-open."""
    img, draw = _new_page()
    y = _draw_letterhead(draw, img, "Registration Fee Invoice")
    y = _draw_meta_block(draw, y, team, "Billed To", invoice_date)

    # ---------- Table ----------
    table_left, table_right = MARGIN, PAGE_W - MARGIN
    content_w = table_right - table_left
    col_w = {k: round(content_w * f) for k, f in COL_FRACTIONS.items()}
    # Rounding all four widths independently can leave/overshoot a few px —
    # fold that slack into the name column, the one column an odd few px
    # never looks wrong on.
    col_w["name"] += content_w - sum(col_w.values())
    col_x = {}
    cursor = table_left
    for key in ("no", "name", "role", "amount"):
        col_x[key] = cursor
        cursor += col_w[key]

    total_billed = subtotal - discount
    balance_due = total_billed - total_paid
    summary_rows = 1 + (1 if discount else 0)  # [Subtotal if discount] + Total Billed
    STATUS_BLOCK_H = round(1.3 * _CM_TO_IN * PRINT_DPI)
    rows_needed = 1 + len(members) + summary_rows  # header + members + summary rows
    available_h = (PAGE_H - MARGIN - SIGNATURE_BLOCK_H - STATUS_BLOCK_H) - y
    row_h = max(ROW_H_MIN, min(ROW_H_MAX, available_h // rows_needed))
    header_font = _font(17, bold=True)
    body_font = _font(16)
    total_font = _font(18, bold=True)

    def _cell(text, x, w, cy, font, fill, align="center", pad=14):
        tw = draw.textlength(text, font=font)
        if align == "left":
            tx = x + pad
        elif align == "right":
            tx = x + w - pad - tw
        else:
            tx = x + (w - tw) / 2
        draw.text((tx, cy), text, font=font, fill=fill, anchor="lm")

    # Header row
    draw.rectangle([table_left, y, table_right, y + row_h], fill=TABLE_HEADER_FILL)
    header_mid = y + row_h / 2
    _cell("S.No", col_x["no"], col_w["no"], header_mid, header_font, TABLE_HEADER_TEXT)
    _cell("Member Name", col_x["name"], col_w["name"], header_mid, header_font, TABLE_HEADER_TEXT, align="left")
    _cell("Role", col_x["role"], col_w["role"], header_mid, header_font, TABLE_HEADER_TEXT)
    _cell("Amount (Rs.)", col_x["amount"], col_w["amount"], header_mid, header_font, TABLE_HEADER_TEXT)
    y += row_h

    for i, member in enumerate(members, start=1):
        if i % 2 == 0:
            draw.rectangle([table_left, y, table_right, y + row_h], fill=ZEBRA_FILL)
        mid = y + row_h / 2
        _cell(str(i), col_x["no"], col_w["no"], mid, body_font, INK)
        _cell(member["name"], col_x["name"], col_w["name"], mid, body_font, INK, align="left")
        _cell(member["role"], col_x["role"], col_w["role"], mid, body_font, MUTED)
        _cell(f"{member['amount']:,}", col_x["amount"], col_w["amount"], mid, body_font, INK, align="right")
        draw.line([(table_left, y + row_h), (table_right, y + row_h)], fill=RULE, width=1)
        y += row_h

    table_top = y - row_h * (1 + len(members))

    # Subtotal row (only shown distinctly when there's a discount to explain;
    # otherwise subtotal == total billed and one row covers both)
    if discount:
        subtotal_mid = y + row_h / 2
        _cell(f"Subtotal ({len(members)} member{'s' if len(members) != 1 else ''})",
              col_x["no"], col_w["no"] + col_w["name"] + col_w["role"], subtotal_mid, body_font, INK, align="left")
        _cell(f"{subtotal:,}", col_x["amount"], col_w["amount"], subtotal_mid, body_font, INK, align="right")
        y += row_h

        discount_mid = y + row_h / 2
        _cell("Discount", col_x["no"], col_w["no"] + col_w["name"] + col_w["role"], discount_mid, body_font, REFUND_RED, align="left")
        _cell(f"− {discount:,}", col_x["amount"], col_w["amount"], discount_mid, body_font, REFUND_RED, align="right")
        y += row_h

    # Total Billed row
    draw.rectangle([table_left, y, table_right, y + row_h], fill=TOTAL_FILL)
    total_mid = y + row_h / 2
    total_label = "Total Billed" if discount else f"Total Billed ({len(members)} member{'s' if len(members) != 1 else ''})"
    _cell(total_label, col_x["no"], col_w["no"] + col_w["name"] + col_w["role"], total_mid, total_font, INK, align="left")
    _cell(f"{total_billed:,}", col_x["amount"], col_w["amount"], total_mid, total_font, INK, align="right")
    y += row_h

    # Outer table border. Column separators stop above the summary rows (not
    # drawn through them) since those labels span the first three columns
    # rather than being cell-per-column like every member row above them.
    total_row_top = y - row_h * summary_rows
    draw.rectangle([table_left, table_top, table_right, y], outline=RULE, width=2)
    for key in ("no", "name", "role"):
        x = col_x[key] + col_w[key]
        draw.line([(x, table_top), (x, total_row_top)], fill=RULE, width=1)
    # ...except the amount column's separator, which still applies to the summary rows.
    amount_x = col_x["amount"]
    draw.line([(amount_x, table_top), (amount_x, y)], fill=RULE, width=1)

    # ---------- Payment status (live, not frozen at billing time) ----------
    y += round(0.35 * _CM_TO_IN * PRINT_DPI)
    status_font = _font(19, bold=True)
    paid_text = f"Total Paid: Rs. {total_paid:,}"
    draw.text((MARGIN, y), paid_text, font=status_font, fill=PAID_GREEN if total_paid else MUTED)
    if balance_due > 0:
        balance_text = f"Balance Due: Rs. {balance_due:,}"
        draw.text((PAGE_W - MARGIN - draw.textlength(balance_text, font=status_font), y), balance_text, font=status_font, fill=REFUND_RED)
    else:
        paid_full_text = "PAID IN FULL"
        draw.text((PAGE_W - MARGIN - draw.textlength(paid_full_text, font=status_font), y), paid_full_text, font=status_font, fill=PAID_GREEN)

    _draw_signature_footer(draw)
    return img


def render_invoice(
    team,
    members: list[dict],
    subtotal: int,
    discount: int,
    total_paid: int,
    invoice_date: date,
) -> bytes:
    """The team's full current billing-state PDF, built from render_invoice_image."""
    img = render_invoice_image(team, members, subtotal, discount, total_paid, invoice_date)
    buf = io.BytesIO()
    img.save(buf, format="PDF", resolution=float(PRINT_DPI))
    return buf.getvalue()


def _render_amount_box_image(
    team,
    subtitle: str,
    left_label: str,
    amount: int,
    amount_label: str,
    box_color: tuple,
    box_fill: tuple,
    payment_mode: str,
    transaction_id: "str | None",
    txn_date: date,
    reason: "str | None" = None,
    balance_line: "str | None" = None,
    details: "list[tuple[str, int]] | None" = None,
) -> Image.Image:
    """Shared layout behind PAYMENT and REFUND documents — letterhead, meta
    (with payment info), an optional details stats row, an optional reason
    line, one large colored amount box, an optional balance line below it,
    and the signature footer. The only differences between a payment
    receipt and a refund voucher are the subtitle/labels/colors/details, so
    this one function draws both."""
    img, draw = _new_page()
    y = _draw_letterhead(draw, img, subtitle)
    y = _draw_meta_block(draw, y, team, left_label, txn_date, payment_mode, transaction_id)
    y += round(0.3 * _CM_TO_IN * PRINT_DPI)

    box_left, box_right = MARGIN, PAGE_W - MARGIN

    if details:
        stats_font = _font(16, bold=True)
        stats_text = "   •   ".join(f"{label}: Rs. {value:,}" for label, value in details)
        draw.text((box_left, y), stats_text, font=stats_font, fill=MUTED)
        y += round(0.6 * _CM_TO_IN * PRINT_DPI)

    if reason:
        draw.text((box_left, y), "Reason", font=_font(17, bold=True), fill=MUTED)
        y += 30
        draw.text((box_left, y), reason, font=_font(18), fill=INK)
        y += round(0.9 * _CM_TO_IN * PRINT_DPI)

    box_h = round(2.0 * _CM_TO_IN * PRINT_DPI)
    draw.rectangle([box_left, y, box_right, y + box_h], fill=box_fill, outline=box_color, width=2)
    label_font = _font(18, bold=True)
    amount_font = _font(40, bold=True)
    draw.text((box_left + 24, y + box_h / 2), amount_label, font=label_font, fill=MUTED, anchor="lm")
    amount_text = f"Rs. {amount:,}"
    aw = draw.textlength(amount_text, font=amount_font)
    draw.text((box_right - 24 - aw, y + box_h / 2), amount_text, font=amount_font, fill=box_color, anchor="lm")
    y += box_h

    if balance_line:
        y += round(0.4 * _CM_TO_IN * PRINT_DPI)
        _centered_text(draw, y, balance_line, _font(19, bold=True), INK)

    _draw_signature_footer(draw)
    return img


def render_refund_voucher_image(
    team,
    amount: int,
    reason: str,
    payment_mode: str,
    transaction_id: "str | None",
    refund_date: date,
    total_billed: int,
    total_paid: int,
    net_collected: int,
) -> Image.Image:
    """No member table — a refund is a free-form amount against a team's net
    received total (see routers/payments.py), not tied to specific members.
    Carries the team's full context (billed/paid/net-after-this-refund) so
    the voucher is self-contained, not just the bare amount + reason."""
    return _render_amount_box_image(
        team, "Refund Voucher", "Refunded To", amount, "Amount Refunded",
        REFUND_RED, REFUND_FILL, payment_mode, transaction_id, refund_date,
        reason=reason,
        details=[("Total Billed", total_billed), ("Total Paid", total_paid), ("Net Collected (after this refund)", net_collected)],
    )


def render_refund_voucher(
    team,
    amount: int,
    reason: str,
    payment_mode: str,
    transaction_id: "str | None",
    refund_date: date,
    total_billed: int,
    total_paid: int,
    net_collected: int,
) -> bytes:
    """Single-page REFUND voucher PDF for one team, built from render_refund_voucher_image."""
    img = render_refund_voucher_image(
        team, amount, reason, payment_mode, transaction_id, refund_date,
        total_billed, total_paid, net_collected,
    )
    buf = io.BytesIO()
    img.save(buf, format="PDF", resolution=float(PRINT_DPI))
    return buf.getvalue()
