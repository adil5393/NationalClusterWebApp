"""Renders two kinds of single-page A4 PDF documents for a team's
registration-fee ledger (see models.Payment / routers/payments.py):

- Invoice (render_invoice): the team's full current billing state — every
  member across every BILL this team has ever had, at whatever per-member
  rate each bill used, plus aggregate subtotal/discount/total billed and
  live Total Paid/Balance Due. Downloaded on demand (routers/payments.py
  get_invoice), not produced as a side effect of billing or recording a
  payment — those are both record-only, so this always reflects "now."
- Refund voucher (render_refund_voucher): letterhead + payment meta +
  reason + a highlighted amount box showing what was refunded, plus the team's
  Total Billed/Total Paid/Net Collected financial reconciliation breakdown.

Both share the executive letterhead with prominently highlighted Event Name,
host school affiliation, metadata cards, and official signature footer.
"""
import io
import os
from datetime import date
from functools import lru_cache
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
MARGIN = 80
CONTENT_W = PAGE_W - 2 * MARGIN

# Brand & Document Color Palette
CLR_BG = (255, 255, 255)
CLR_NAVY_DARK = (15, 23, 42)        # Slate 900
CLR_NAVY_HEADER = (30, 41, 59)      # Slate 800
CLR_NAVY_MID = (51, 65, 85)         # Slate 700
CLR_MUTED = (100, 116, 139)         # Slate 500
CLR_LIGHT_MUTED = (148, 163, 184)   # Slate 400
CLR_CARD_BG = (248, 250, 252)       # Slate 50
CLR_CARD_BORDER = (226, 232, 240)   # Slate 200
CLR_ZEBRA = (248, 250, 252)         # Slate 50
CLR_GOLD = (217, 119, 6)            # Amber 600 (Brand accent)
CLR_GOLD_LIGHT = (254, 243, 199)    # Amber 100
CLR_GOLD_TEXT = (180, 83, 9)        # Amber 700
CLR_GREEN = (22, 163, 74)           # Green 600 (Payment received)
CLR_GREEN_BG = (240, 253, 244)      # Green 50
CLR_GREEN_BORDER = (187, 247, 208)  # Green 200
CLR_RED = (220, 38, 38)             # Red 600 (Refund / Balance Due)
CLR_RED_BG = (254, 242, 242)        # Red 50
CLR_RED_BORDER = (254, 202, 202)    # Red 200

# Column widths as fractions of table content width (sum = 1.0)
COL_FRACTIONS = {"no": 0.08, "name": 0.48, "role": 0.22, "amount": 0.22}


@lru_cache(maxsize=128)
def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Robust cross-platform font resolver checking Linux paths, Windows
    system fonts, named TrueType fonts, and falling back gracefully."""
    candidates = []
    if bold:
        candidates = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "arialbd.ttf",
            "segoeuib.ttf",
            "calibrib.ttf",
            "DejaVuSans-Bold.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
            "C:/Windows/Fonts/segoeuib.ttf",
        ]
    else:
        candidates = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "arial.ttf",
            "segoeui.ttf",
            "calibri.ttf",
            "DejaVuSans.ttf",
            "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/segoeui.ttf",
        ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except Exception:
            pass
    return ImageFont.load_default()


def _centered_text(draw: ImageDraw.ImageDraw, y: int, text: str, font: ImageFont.FreeTypeFont, fill) -> None:
    w = draw.textlength(text, font=font)
    draw.text(((PAGE_W - w) / 2, y), text, font=font, fill=fill)


def _new_page() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (PAGE_W, PAGE_H), CLR_BG)
    draw = ImageDraw.Draw(img)
    # Elegant double-lined page frame
    draw.rectangle([24, 24, PAGE_W - 24, PAGE_H - 24], outline=CLR_CARD_BORDER, width=1)
    draw.rectangle([30, 30, PAGE_W - 30, PAGE_H - 30], outline=(241, 245, 249), width=1)
    # Top championship gold accent ribbon
    draw.rectangle([24, 24, PAGE_W - 24, 32], fill=CLR_GOLD)
    return img, draw


def _draw_letterhead(draw: ImageDraw.ImageDraw, img: Image.Image, subtitle: str, is_refund: bool = False) -> int:
    """Renders the official letterhead with monogram logo, prominently highlighted
    Championship Event Name banner, host school affiliation, and document ribbon."""
    y = 44
    if LOGO_PATH.exists():
        try:
            logo = Image.open(LOGO_PATH).convert("RGBA")
            logo_h = 115
            ratio = logo_h / logo.height
            logo = logo.resize((round(logo.width * ratio), logo_h), Image.LANCZOS)
            img.paste(logo, (round((PAGE_W - logo.width) / 2), y), logo)
            y += logo_h + 12
        except Exception:
            y += 10

    # 1. Prominent Championship Event Title Banner
    banner_h = 86
    banner_left = MARGIN
    banner_right = PAGE_W - MARGIN
    draw.rounded_rectangle([banner_left, y, banner_right, y + banner_h], radius=10, fill=CLR_NAVY_DARK)

    ev_tag = "[ CENTRAL BOARD OF SECONDARY EDUCATION ]"
    tag_font = _font(14, bold=True)
    tw_tag = draw.textlength(ev_tag, font=tag_font)
    draw.text(((PAGE_W - tw_tag) / 2, y + 13), ev_tag, font=tag_font, fill=CLR_GOLD)

    ev_title = "CBSE NATIONAL KABADDI CHAMPIONSHIP 2026–2027"
    title_font = _font(28, bold=True)
    tw_title = draw.textlength(ev_title, font=title_font)
    draw.text(((PAGE_W - tw_title) / 2, y + 37), ev_title, font=title_font, fill=(255, 255, 255))

    y += banner_h + 14

    # 2. Host School Name & CBSE Affiliation
    school_name = "NEW ANGELS SR. SEC. SCHOOL, PRATAPGARH (U.P.)"
    school_font = _font(22, bold=True)
    tw_school = draw.textlength(school_name, font=school_font)
    draw.text(((PAGE_W - tw_school) / 2, y), school_name, font=school_font, fill=CLR_NAVY_DARK)
    y += 30

    affil_text = "Affiliated to CBSE, New Delhi • Affiliation No. 2130850 • School Code: 71295"
    affil_font = _font(15, bold=False)
    tw_affil = draw.textlength(affil_text, font=affil_font)
    draw.text(((PAGE_W - tw_affil) / 2, y), affil_text, font=affil_font, fill=CLR_MUTED)
    y += 24

    # 3. Document Subtitle Ribbon
    doc_bg = CLR_RED_BG if is_refund else CLR_CARD_BG
    doc_border = CLR_RED_BORDER if is_refund else CLR_CARD_BORDER
    doc_text_clr = CLR_RED if is_refund else CLR_NAVY_DARK

    ribbon_h = 40
    draw.rounded_rectangle([MARGIN, y, PAGE_W - MARGIN, y + ribbon_h], radius=6, fill=doc_bg, outline=doc_border, width=1)

    doc_font = _font(17, bold=True)
    tw_doc = draw.textlength(subtitle.upper(), font=doc_font)
    draw.text(((PAGE_W - tw_doc) / 2, y + (ribbon_h - 19) / 2), subtitle.upper(), font=doc_font, fill=doc_text_clr)

    y += ribbon_h + 18
    return y


def _get_val(obj, key: str, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        val = obj.get(key)
        return val if val is not None else default
    val = getattr(obj, key, None)
    return val if val is not None else default


def _format_date(d) -> str:
    if d is None:
        return datetime.now().strftime("%d-%m-%Y")
    if hasattr(d, "strftime"):
        return d.strftime("%d-%m-%Y")
    return str(d)


def _draw_meta_cards(
    draw: ImageDraw.ImageDraw,
    y: int,
    team,
    left_title: str,
    txn_date: "date | str | None",
    payment_mode: "str | None" = None,
    transaction_id: "str | None" = None,
    card_h: int = 110,
) -> int:
    """Two-column card block:
    - Left Card: Recipient / Participating Team details
    - Right Card: Transaction date, payment mode, and reference ID
    """
    card_gap = 18
    card_w = (CONTENT_W - card_gap) // 2
    left_x = MARGIN
    right_x = left_x + card_w + card_gap

    # Left Card
    draw.rounded_rectangle([left_x, y, left_x + card_w, y + card_h], radius=8, fill=CLR_CARD_BG, outline=CLR_CARD_BORDER, width=1)
    title_font = _font(13, bold=True)
    draw.text((left_x + 18, y + 14), left_title.upper(), font=title_font, fill=CLR_GOLD_TEXT)

    name_font = _font(19, bold=True)
    t_name = _get_val(team, "name") or _get_val(team, "school_name") or "Participating Team"
    while draw.textlength(t_name, font=name_font) > (card_w - 36) and len(t_name) > 10:
        t_name = t_name[:-4] + "..."
    draw.text((left_x + 18, y + 38), t_name, font=name_font, fill=CLR_NAVY_DARK)

    code_font = _font(15, bold=False)
    school_code = _get_val(team, "school_code") or "—"
    region = _get_val(team, "region") or _get_val(team, "cluster_name")
    code_text = f"School Code: {school_code}"
    if region:
        code_text += f"  •  Region: {region}"
    draw.text((left_x + 18, y + 72), code_text, font=code_font, fill=CLR_MUTED)

    # Right Card
    draw.rounded_rectangle([right_x, y, right_x + card_w, y + card_h], radius=8, fill=CLR_CARD_BG, outline=CLR_CARD_BORDER, width=1)
    draw.text((right_x + 18, y + 14), "TRANSACTION & ISSUE DETAILS", font=title_font, fill=CLR_GOLD_TEXT)

    date_text = f"Issue Date: {_format_date(txn_date)}"
    draw.text((right_x + 18, y + 38), date_text, font=name_font, fill=CLR_NAVY_DARK)

    if payment_mode:
        pay_info = f"Payment Mode: {payment_mode}"
        if transaction_id:
            pay_info += f"  •  Txn ID: {transaction_id}"
        draw.text((right_x + 18, y + 72), pay_info, font=code_font, fill=CLR_NAVY_DARK)
    else:
        draw.text((right_x + 18, y + 72), "Status: Official Billing Record", font=code_font, fill=CLR_MUTED)

    return y + card_h


def _draw_signature_footer(draw: ImageDraw.ImageDraw, footer_y: "int | None" = None) -> None:
    """Official signature footer with team representative signature line,
    principal/organizing secretary signature line, official seal box, and disclaimer."""
    if footer_y is None:
        footer_y = PAGE_H - MARGIN - 60
    box_w = 340

    # Left: Team Representative
    left_x = MARGIN + 10
    draw.line([(left_x, footer_y), (left_x + box_w, footer_y)], fill=CLR_LIGHT_MUTED, width=1)
    label_font = _font(16, bold=True)
    tw1 = draw.textlength("Team Manager / Coach Signature", font=label_font)
    draw.text((left_x + (box_w - tw1) / 2, footer_y + 8), "Team Manager / Coach Signature", font=label_font, fill=CLR_NAVY_DARK)
    sub1 = draw.textlength("(Authorized Team Representative)", font=_font(13))
    draw.text((left_x + (box_w - sub1) / 2, footer_y + 30), "(Authorized Team Representative)", font=_font(13), fill=CLR_MUTED)

    # Right: Organizing Secretary / Principal
    right_x = PAGE_W - MARGIN - box_w - 10
    draw.line([(right_x, footer_y), (right_x + box_w, footer_y)], fill=CLR_LIGHT_MUTED, width=1)
    tw2 = draw.textlength("Organizing Secretary / Principal", font=label_font)
    draw.text((right_x + (box_w - tw2) / 2, footer_y + 8), "Organizing Secretary / Principal", font=label_font, fill=CLR_NAVY_DARK)
    sub2 = draw.textlength("New Angels Sr. Sec. School (Host)", font=_font(13))
    draw.text((right_x + (box_w - sub2) / 2, footer_y + 30), "New Angels Sr. Sec. School (Host)", font=_font(13), fill=CLR_MUTED)

    # Center: Official Seal box
    center_x = (PAGE_W - 130) / 2
    draw.rounded_rectangle([center_x, footer_y - 25, center_x + 130, footer_y + 35], radius=6, outline=CLR_CARD_BORDER, width=1)
    seal_txt = "OFFICIAL SEAL"
    tw_seal = draw.textlength(seal_txt, font=_font(12, bold=True))
    draw.text(((PAGE_W - tw_seal) / 2, footer_y - 1), seal_txt, font=_font(12, bold=True), fill=(203, 213, 225))

    # Micro disclaimer at bottom
    disc_text = "Official Computer-Generated Document • CBSE National Kabaddi Championship 2026–2027 • New Angels Sr. Sec. School"
    disc_font = _font(12, bold=False)
    tw_disc = draw.textlength(disc_text, font=disc_font)
    draw.text(((PAGE_W - tw_disc) / 2, PAGE_H - 42), disc_text, font=disc_font, fill=CLR_MUTED)


def render_invoice_image(
    team,
    members: list[dict],
    subtotal: int,
    discount: int,
    total_paid: int,
    invoice_date: date,
) -> Image.Image:
    """The team's full current billing state PDF page."""
    img, draw = _new_page()
    y = _draw_letterhead(draw, img, "Registration Fee Invoice", is_refund=False)

    footer_y = PAGE_H - MARGIN - 60
    total_billed = subtotal - discount
    balance_due = total_billed - total_paid
    summary_rows = 1 + (2 if discount else 0)
    rows_needed = 1 + len(members) + summary_rows

    meta_h = 110
    stat_h = 88

    available_total = (footer_y - 30) - y
    if rows_needed <= 8:
        row_h = 60
        notes_h = 240
    elif rows_needed <= 14:
        row_h = 52
        notes_h = 180
    elif rows_needed <= 20:
        row_h = 44
        notes_h = 140
    else:
        row_h = max(34, min(38, (available_total - (meta_h + stat_h + 100 + 70)) // rows_needed))
        notes_h = 90

    table_h = row_h * rows_needed
    total_content_h = meta_h + table_h + stat_h + notes_h
    remaining_slack = max(0, available_total - total_content_h)
    gap = remaining_slack // 4

    # 1. Meta Cards
    y = _draw_meta_cards(draw, y, team, "Billed To", invoice_date, card_h=meta_h)
    y += gap

    # 2. Table
    table_left, table_right = MARGIN, PAGE_W - MARGIN
    content_w = table_right - table_left
    col_w = {k: round(content_w * f) for k, f in COL_FRACTIONS.items()}
    col_w["name"] += content_w - sum(col_w.values())
    col_x = {}
    cursor = table_left
    for key in ("no", "name", "role", "amount"):
        col_x[key] = cursor
        cursor += col_w[key]

    header_font = _font(18, bold=True)
    body_font = _font(17)
    total_font = _font(19, bold=True)

    def _cell(text, x, w, cy, font, fill, align="center", pad=16):
        tw = draw.textlength(text, font=font)
        if align == "left":
            tx = x + pad
        elif align == "right":
            tx = x + w - pad - tw
        else:
            tx = x + (w - tw) / 2
        draw.text((tx, cy), text, font=font, fill=fill, anchor="lm")

    # Table Header
    draw.rounded_rectangle([table_left, y, table_right, y + row_h], radius=4, fill=CLR_NAVY_DARK)
    header_mid = y + row_h / 2
    _cell("S.No", col_x["no"], col_w["no"], header_mid, header_font, (255, 255, 255))
    _cell("Member Name", col_x["name"], col_w["name"], header_mid, header_font, (255, 255, 255), align="left")
    _cell("Role / Category", col_x["role"], col_w["role"], header_mid, header_font, (255, 255, 255))
    _cell("Amount (Rs.)", col_x["amount"], col_w["amount"], header_mid, header_font, (255, 255, 255), align="right")

    draw.line([(table_left, y + row_h), (table_right, y + row_h)], fill=CLR_GOLD, width=2)
    y += row_h
    table_top = y - row_h

    # Members
    for i, member in enumerate(members, start=1):
        if i % 2 == 0:
            draw.rectangle([table_left, y, table_right, y + row_h], fill=CLR_ZEBRA)
        mid = y + row_h / 2
        _cell(str(i), col_x["no"], col_w["no"], mid, body_font, CLR_NAVY_DARK)
        _cell(member["name"], col_x["name"], col_w["name"], mid, body_font, CLR_NAVY_DARK, align="left")
        _cell(member["role"], col_x["role"], col_w["role"], mid, body_font, CLR_MUTED)
        _cell(f"{member['amount']:,}", col_x["amount"], col_w["amount"], mid, body_font, CLR_NAVY_DARK, align="right")
        draw.line([(table_left, y + row_h), (table_right, y + row_h)], fill=CLR_CARD_BORDER, width=1)
        y += row_h

    # Subtotal and Discount
    if discount:
        subtotal_mid = y + row_h / 2
        _cell(f"Subtotal ({len(members)} members)",
              col_x["no"], col_w["no"] + col_w["name"] + col_w["role"], subtotal_mid, body_font, CLR_NAVY_DARK, align="left")
        _cell(f"{subtotal:,}", col_x["amount"], col_w["amount"], subtotal_mid, body_font, CLR_NAVY_DARK, align="right")
        draw.line([(table_left, y + row_h), (table_right, y + row_h)], fill=CLR_CARD_BORDER, width=1)
        y += row_h

        discount_mid = y + row_h / 2
        _cell("Discount / Concession", col_x["no"], col_w["no"] + col_w["name"] + col_w["role"], discount_mid, body_font, CLR_RED, align="left")
        _cell(f"− {discount:,}", col_x["amount"], col_w["amount"], discount_mid, body_font, CLR_RED, align="right")
        draw.line([(table_left, y + row_h), (table_right, y + row_h)], fill=CLR_CARD_BORDER, width=1)
        y += row_h

    # Total Billed Row
    draw.rectangle([table_left, y, table_right, y + row_h], fill=(241, 245, 249))
    total_mid = y + row_h / 2
    total_label = "Total Billed Amount" if discount else f"Total Billed Amount ({len(members)} member{'s' if len(members) != 1 else ''})"
    _cell(total_label, col_x["no"], col_w["no"] + col_w["name"] + col_w["role"], total_mid, total_font, CLR_NAVY_DARK, align="left")
    _cell(f"Rs. {total_billed:,}", col_x["amount"], col_w["amount"], total_mid, total_font, CLR_NAVY_DARK, align="right")
    y += row_h

    # Table Borders
    draw.rectangle([table_left, table_top, table_right, y], outline=CLR_CARD_BORDER, width=1)
    for key in ("no", "name", "role"):
        x = col_x[key] + col_w[key]
        draw.line([(x, table_top), (x, y - row_h * summary_rows)], fill=CLR_CARD_BORDER, width=1)
    amount_x = col_x["amount"]
    draw.line([(amount_x, table_top), (amount_x, y)], fill=CLR_CARD_BORDER, width=1)

    y += gap

    # 3. Financial Status Summary Cards (2 Cards)
    stat_gap = 18
    stat_w = (CONTENT_W - stat_gap) // 2

    # Left: Total Paid Card
    left_stat_x = MARGIN
    draw.rounded_rectangle([left_stat_x, y, left_stat_x + stat_w, y + stat_h], radius=8, fill=CLR_GREEN_BG, outline=CLR_GREEN_BORDER, width=1)
    draw.text((left_stat_x + 18, y + 14), "TOTAL AMOUNT RECEIVED", font=_font(14, bold=True), fill=CLR_GREEN)
    draw.text((left_stat_x + 18, y + 40), f"Rs. {total_paid:,}", font=_font(26, bold=True), fill=CLR_GREEN)

    # Right: Balance Due / Paid Full
    right_stat_x = left_stat_x + stat_w + stat_gap
    if balance_due > 0:
        draw.rounded_rectangle([right_stat_x, y, right_stat_x + stat_w, y + stat_h], radius=8, fill=CLR_RED_BG, outline=CLR_RED_BORDER, width=1)
        draw.text((right_stat_x + 18, y + 14), "OUTSTANDING BALANCE DUE", font=_font(14, bold=True), fill=CLR_RED)
        draw.text((right_stat_x + 18, y + 40), f"Rs. {balance_due:,}", font=_font(26, bold=True), fill=CLR_RED)
    else:
        draw.rounded_rectangle([right_stat_x, y, right_stat_x + stat_w, y + stat_h], radius=8, fill=CLR_GREEN_BG, outline=CLR_GREEN_BORDER, width=1)
        draw.text((right_stat_x + 18, y + 14), "SETTLEMENT STATUS", font=_font(14, bold=True), fill=CLR_GREEN)
        draw.text((right_stat_x + 18, y + 40), "PAID IN FULL (SETTLED)", font=_font(26, bold=True), fill=CLR_GREEN)

    y += stat_h + gap

    # 4. Terms & Instructions Card
    actual_notes_h = min(notes_h, (footer_y - 30) - y)
    if actual_notes_h > 70:
        draw.rounded_rectangle([MARGIN, y, PAGE_W - MARGIN, y + actual_notes_h], radius=8, fill=CLR_CARD_BG, outline=CLR_CARD_BORDER, width=1)
        draw.text((MARGIN + 20, y + 18), "INVOICE NOTES & PARTICIPATION GUIDELINES", font=_font(15, bold=True), fill=CLR_GOLD_TEXT)

        notes = [
            "1. Registration fee entitles listed delegation members to tournament accreditation, official identity cards, and match entry.",
            "2. All participants must present their verified ID cards and original documents at the accreditation counter.",
            "3. This invoice is an official electronic receipt issued by the Host Organizing Committee, New Angels Sr. Sec. School.",
            "4. For financial reconciliation, billing queries, or official team check-in, please contact the Tournament Accounts Secretariat.",
        ]
        ny = y + 48
        line_step = 30 if actual_notes_h > 170 else (26 if actual_notes_h > 120 else 20)
        for note in notes:
            if ny + 16 <= y + actual_notes_h:
                draw.text((MARGIN + 20, ny), note, font=_font(14 if actual_notes_h > 130 else 13), fill=CLR_MUTED)
                ny += line_step

    _draw_signature_footer(draw, footer_y)
    return img


def render_invoice(
    team,
    members: list[dict],
    subtotal: int,
    discount: int,
    total_paid: int,
    invoice_date: date,
) -> bytes:
    """The team's full current billing-state PDF bytes."""
    img = render_invoice_image(team, members, subtotal, discount, total_paid, invoice_date)
    buf = io.BytesIO()
    img.save(buf, format="PDF", resolution=float(PRINT_DPI))
    return buf.getvalue()


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
    """Single-page REFUND voucher image for one team."""
    img, draw = _new_page()
    y = _draw_letterhead(draw, img, "Official Refund Voucher & Credit Note", is_refund=True)

    footer_y = PAGE_H - MARGIN - 60

    meta_h = 110
    hero_h = 205
    reason_h = 150
    grid_h = 160
    terms_h = 220

    total_refund_content = meta_h + hero_h + reason_h + grid_h + terms_h
    remaining_slack = max(0, (footer_y - 30) - y - total_refund_content)
    gap = remaining_slack // 5

    # 1. Meta
    y = _draw_meta_cards(draw, y, team, "Refunded To", refund_date, payment_mode, transaction_id, card_h=meta_h)
    y += gap

    # 2. Hero Amount Refunded Card
    draw.rounded_rectangle([MARGIN, y, PAGE_W - MARGIN, y + hero_h], radius=12, fill=CLR_RED_BG, outline=CLR_RED_BORDER, width=2)

    draw.text((MARGIN + 32, y + 34), "TOTAL AMOUNT REFUNDED / DISBURSED", font=_font(19, bold=True), fill=CLR_RED)
    draw.text((MARGIN + 32, y + 74), "Official Reimbursement • Approved by Organizing Committee", font=_font(16), fill=CLR_NAVY_MID)
    mode_str = f"Disbursement Method: {payment_mode}"
    if transaction_id:
        mode_str += f"  (Txn / UTR Reference: {transaction_id})"
    draw.text((MARGIN + 32, y + 112), mode_str, font=_font(16, bold=True), fill=CLR_MUTED)
    draw.text((MARGIN + 32, y + 150), f"Disbursement Date: {_format_date(refund_date)} • Status: Settled & Completed", font=_font(15), fill=CLR_RED)

    amount_text = f"Rs. {amount:,}"
    amount_font = _font(64, bold=True)
    tw_amt = draw.textlength(amount_text, font=amount_font)
    draw.text((PAGE_W - MARGIN - 32 - tw_amt, y + (hero_h - 70) / 2), amount_text, font=amount_font, fill=CLR_RED)
    y += hero_h + gap

    # 3. Reason Box
    draw.rounded_rectangle([MARGIN, y, PAGE_W - MARGIN, y + reason_h], radius=10, fill=CLR_CARD_BG, outline=CLR_CARD_BORDER, width=1)
    draw.text((MARGIN + 24, y + 24), "REASON FOR REFUND / ADJUSTMENT", font=_font(16, bold=True), fill=CLR_GOLD_TEXT)

    reason_font = _font(20, bold=False)
    r_text = reason or "Refund processed as per tournament financial norms."
    while draw.textlength(r_text, font=reason_font) > (CONTENT_W - 48) and len(r_text) > 20:
        r_text = r_text[:-4] + "..."
    draw.text((MARGIN + 24, y + 64), r_text, font=reason_font, fill=CLR_NAVY_DARK)
    draw.text((MARGIN + 24, y + 106), f"Authorized on: {_format_date(refund_date)} • Verified by Central Accounts Secretariat", font=_font(15), fill=CLR_MUTED)
    y += reason_h + gap

    # 4. Financial Ledger Reconciliation Grid (3 Columns)
    grid_gap = 18
    grid_w = (CONTENT_W - 2 * grid_gap) // 3

    c1_x = MARGIN
    draw.rounded_rectangle([c1_x, y, c1_x + grid_w, y + grid_h], radius=10, fill=CLR_CARD_BG, outline=CLR_CARD_BORDER, width=1)
    draw.text((c1_x + 22, y + 26), "1. ORIGINAL TOTAL BILLED", font=_font(14, bold=True), fill=CLR_MUTED)
    draw.text((c1_x + 22, y + 68), f"Rs. {total_billed:,}", font=_font(34, bold=True), fill=CLR_NAVY_DARK)
    draw.text((c1_x + 22, y + 118), "Total registration ledger", font=_font(14), fill=CLR_MUTED)

    c2_x = c1_x + grid_w + grid_gap
    draw.rounded_rectangle([c2_x, y, c2_x + grid_w, y + grid_h], radius=10, fill=CLR_CARD_BG, outline=CLR_CARD_BORDER, width=1)
    draw.text((c2_x + 22, y + 26), "2. TOTAL AMOUNT RECEIVED", font=_font(14, bold=True), fill=CLR_GREEN)
    draw.text((c2_x + 22, y + 68), f"Rs. {total_paid:,}", font=_font(34, bold=True), fill=CLR_GREEN)
    draw.text((c2_x + 22, y + 118), "Gross collections to date", font=_font(14), fill=CLR_MUTED)

    c3_x = c2_x + grid_w + grid_gap
    draw.rounded_rectangle([c3_x, y, c3_x + grid_w, y + grid_h], radius=10, fill=CLR_CARD_BG, outline=CLR_CARD_BORDER, width=1)
    draw.text((c3_x + 22, y + 26), "3. NET RETAINED BALANCE", font=_font(14, bold=True), fill=CLR_NAVY_MID)
    draw.text((c3_x + 22, y + 68), f"Rs. {net_collected:,}", font=_font(34, bold=True), fill=CLR_NAVY_DARK)
    draw.text((c3_x + 22, y + 118), "Net after this refund", font=_font(14), fill=CLR_MUTED)

    y += grid_h + gap

    # 5. Terms & Settlement Notice
    draw.rounded_rectangle([MARGIN, y, PAGE_W - MARGIN, y + terms_h], radius=10, fill=(241, 245, 249), outline=CLR_CARD_BORDER, width=1)
    draw.text((MARGIN + 24, y + 24), "TERMS OF REFUND & FINANCIAL SETTLEMENT", font=_font(16, bold=True), fill=CLR_NAVY_MID)

    t_lines = [
        "1. This voucher constitutes full and final settlement of the requested refund amount specified above.",
        "2. All corresponding ledger entries have been updated in the CBSE National Kabaddi Championship financial records.",
        "3. The participating team acknowledges the disbursement and confirms there are no further claims on this specific request.",
        "4. Any future inquiries regarding this settlement must reference the School Code and Transaction ID shown above.",
        "5. Issued under the authority of the Host School Organizing Committee and Central Accounts Directorate.",
    ]
    ty = y + 60
    for line in t_lines:
        draw.text((MARGIN + 24, ty), line, font=_font(14), fill=CLR_MUTED)
        ty += 28

    _draw_signature_footer(draw, footer_y)
    return img


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
    """Single-page REFUND voucher PDF bytes."""
    img = render_refund_voucher_image(
        team,
        amount,
        reason,
        payment_mode,
        transaction_id,
        refund_date,
        total_billed,
        total_paid,
        net_collected,
    )
    buf = io.BytesIO()
    img.save(buf, format="PDF", resolution=float(PRINT_DPI))
    return buf.getvalue()
