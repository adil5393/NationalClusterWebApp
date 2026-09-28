"""Billing ledger for a team (see models.Payment): BILL (invoice, no money
implied), PAYMENT (money actually received, partial or full, against one
category's outstanding balance), REFUND (money returned, capped at what's
actually been received in that category net of prior refunds).

A team carries THREE independent bills (receipt.CATEGORIES), each with its
own bills, payments, refunds and invoice — a payment recorded against one
never touches another's balance:

- REGISTRATION: the participation fee — Rs. receipt.DAILY_MEMBER_FEE per day
  x receipt.EVENT_DAYS (receipt.PER_MEMBER_FEE) per member.
- SECURITY: the Security Receipt — one flat amount per team (default
  receipt.SECURITY_FEE_DEFAULT, editable), raised once.
- IDCARD: the ID card fee — receipt.ID_CARD_FEE per head.

Registration and ID card bills are raised by quantity: the organizer enters
the total number of members to bill and the bill charges exactly that many
at the static, non-editable per-member rate. A team can be billed more than
once in a category (each bill adds its own quantity). Billing is independent
of attendance and of who is on the roster — a bill is just a head-count, and
later roster or attendance changes never alter it. A flat discount is
entered at billing time and applies to that bill only. (Bills from before
quantity billing carry a list of the exact members they charged instead —
see _bill_quantity.)

Bill and Payment are record-only (no PDF) — the downloadable Invoice
(get_invoice) always reflects a category's current billed/paid/balance state
rather than a frozen snapshot from whenever a transaction happened. Refund
stays a single combined step with its voucher, since a refund is a discrete
completed action rather than something that accrues afterward.
"""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models, receipt, schemas
from ..auth_utils import verify_password
from ..database import get_db
from ..security import require_admin

router = APIRouter(prefix="/api/teams", tags=["payments"])

PDF_MEDIA_TYPE = "application/pdf"

# Categories whose bills charge a ticked list of members at a flat per-head
# rate; SECURITY is instead one flat amount per team, with no member list.
MEMBER_RATES = {
    "REGISTRATION": receipt.PER_MEMBER_FEE,
    "IDCARD": receipt.ID_CARD_FEE,
}


def _pdf_response(content: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        iter([content]),
        media_type=PDF_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _get_team(db: Session, team_id: int) -> models.Team:
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    if not team.is_active:
        raise HTTPException(400, "This team is inactive — billing is not available.")
    return team


def _billable_members(team: models.Team) -> list[dict]:
    """Everyone this team can be billed for, regardless of attendance: every
    active participant (not individually inactive, age group not benched)
    plus every coach/manager — in the {"kind", "id", "name", "role"} shape
    stored in a BILL's `members` snapshot (kind+id is what lets a later bill
    tell "already billed" apart from "not yet billed")."""
    benched = {g.age_group for g in team.inactive_age_groups}
    members = [
        {"kind": "participant", "id": p.id, "name": p.full_name, "role": p.age_group or p.role or "Player"}
        for p in sorted(team.participants, key=lambda p: p.full_name)
        if p.is_active and p.age_group not in benched
    ]
    members += [
        {"kind": "coach", "id": c.id, "name": c.full_name, "role": c.role or "Coach"}
        for c in sorted(team.coaches, key=lambda c: (c.role != "Coach", c.full_name))
    ]
    return members


def _rows(team: models.Team, kind: str, category: str) -> list:
    return [p for p in team.payments if p.kind == kind and p.category == category]


def _billed_keys(team: models.Team, category: str = "REGISTRATION") -> set:
    """(kind, id) for every member any prior BILL of this category on the team
    has already charged for — a PAYMENT/REFUND never removes a member from
    this set; they're purely financial and don't reopen billing for anyone.
    Categories are tracked separately: being registration-billed says nothing
    about the ID card bill."""
    keys = set()
    for pay in _rows(team, "BILL", category):
        if pay.members:
            keys.update((m["kind"], m["id"]) for m in pay.members)
    return keys


def _bill_quantity(p: models.Payment) -> int:
    """Head-count a member-based BILL charged: the quantity entered when it was
    created or, for older bills, the number of members it listed."""
    if p.quantity is not None:
        return p.quantity
    return len(p.members or [])


def _billed_headcount(team: models.Team, category: str = "REGISTRATION") -> int:
    return sum(_bill_quantity(p) for p in _rows(team, "BILL", category))


def member_is_billed(team: models.Team, kind: str, member_id: int) -> bool:
    """Whether this person counts as registration-billed. Quantity bills don't
    say *who*, so it's team-level: everyone is billed once the team's billed
    head-count covers its whole billable roster. Older bills that listed exact
    members still mark those individuals as billed."""
    if (kind, member_id) in _billed_keys(team):
        return True
    headcount = _billed_headcount(team)
    return headcount > 0 and headcount >= len(_billable_members(team))


def _bill_breakdown(team: models.Team, category: str) -> tuple[list[dict], int, int, int]:
    """Every BILL of this category counts exactly as created — its quantity
    at its own per-member rate, less its discount. Billing doesn't depend on
    attendance or the current roster, so nothing is recomputed. Returns (line
    items for the Invoice, subtotal, discount, total_billed); shared by
    _category_totals (billing_summary) and get_invoice so they can never show
    different figures for the same team. A quantity bill is a single line
    (carrying "qty"); a bill from before quantity billing lists its members;
    the Security Receipt is a single flat line."""
    lines: list[dict] = []
    subtotal = 0
    discount = 0
    for p in _rows(team, "BILL", category):
        bill_subtotal = p.subtotal if p.subtotal is not None else p.amount
        subtotal += bill_subtotal
        discount += min(p.discount or 0, bill_subtotal)
        bill_members = p.members or []
        if bill_members:
            per_member = bill_subtotal // len(bill_members)
            lines.extend({"name": m["name"], "role": m["role"], "amount": per_member} for m in bill_members)
        elif p.quantity:
            rate = bill_subtotal // p.quantity
            lines.append({
                "name": f"{receipt.CATEGORY_LABELS[category]} — {p.quantity} member{'s' if p.quantity != 1 else ''} × Rs. {rate:,}",
                "role": f"Qty {p.quantity}",
                "qty": p.quantity,
                "amount": bill_subtotal,
            })
        else:
            lines.append({
                "name": "Security Fee (one-time, per team)" if category == "SECURITY"
                else receipt.CATEGORY_LABELS[category],
                "role": "Team",
                "amount": bill_subtotal,
            })
    return lines, subtotal, discount, subtotal - discount


def _category_totals(team: models.Team, category: str) -> dict:
    """Cash and UPI are tracked separately throughout (paid_cash/paid_upi,
    refunded_cash/refunded_upi) alongside the combined total_paid/
    total_refunded, so the billing summary and every export can show either
    the combined figure or the per-mode breakdown without re-deriving it."""
    total_billed = _bill_breakdown(team, category)[3]
    pays = _rows(team, "PAYMENT", category)
    refunds = _rows(team, "REFUND", category)
    paid_cash = sum(p.amount for p in pays if p.payment_mode == "Cash")
    paid_upi = sum(p.amount for p in pays if p.payment_mode == "UPI")
    refunded_cash = sum(p.amount for p in refunds if p.payment_mode == "Cash")
    refunded_upi = sum(p.amount for p in refunds if p.payment_mode == "UPI")
    total_paid = paid_cash + paid_upi
    total_refunded = refunded_cash + refunded_upi
    return {
        "total_billed": total_billed,
        "total_paid": total_paid,
        "paid_cash": paid_cash,
        "paid_upi": paid_upi,
        "total_refunded": total_refunded,
        "refunded_cash": refunded_cash,
        "refunded_upi": refunded_upi,
        "balance_due": total_billed - total_paid,
        "net_collected": total_paid - total_refunded,
    }


def _totals(team: models.Team) -> dict:
    """The team's figures summed across all three categories."""
    per_category = [_category_totals(team, c) for c in receipt.CATEGORIES]
    return {k: sum(t[k] for t in per_category) for k in per_category[0]}


def _validate_payment_fields(payment_mode: str, transaction_id: "str | None") -> "str | None":
    if payment_mode not in ("Cash", "UPI"):
        raise HTTPException(400, "payment_mode must be 'Cash' or 'UPI'")
    transaction_id = (transaction_id or "").strip() or None
    if payment_mode == "UPI" and not transaction_id:
        raise HTTPException(400, "transaction_id is required for UPI payments")
    return transaction_id


def _category_summary(team: models.Team, category: str, roster: list[dict]) -> dict:
    summary = {
        "label": receipt.CATEGORY_LABELS[category],
        "bill_count": len(_rows(team, "BILL", category)),
        **_category_totals(team, category),
    }
    if category == "SECURITY":
        summary["default_amount"] = receipt.SECURITY_FEE_DEFAULT
        summary["billed"] = summary["bill_count"] > 0
    else:
        summary["rate"] = MEMBER_RATES[category]
        # Hints for the Bill dialog's single "number of members" field.
        summary["roster_size"] = len(roster)
        summary["billed_quantity"] = _billed_headcount(team, category)
    return summary


def _billing_summary_dict(team: models.Team) -> dict:
    roster = _billable_members(team)
    categories = {c: _category_summary(team, c, roster) for c in receipt.CATEGORIES}
    billed_keys = _billed_keys(team)
    legacy_members = [{**m, "billed": (m["kind"], m["id"]) in billed_keys} for m in roster]
    payments_sorted = sorted(team.payments, key=lambda p: (p.payment_date, p.id), reverse=True)
    return {
        "team_id": team.id,
        # One entry per independent bill — see receipt.CATEGORIES.
        "categories": categories,
        # Top-level figures are the sum across all three bills.
        **_totals(team),
        # Registration-bill fields kept at the top level for older app builds
        # (which still tick members); the current dialog bills by quantity.
        "members": legacy_members,
        "unbilled_present_members": [m for m in legacy_members if not m["billed"]],
        "per_member_fee": receipt.PER_MEMBER_FEE,
        "daily_member_fee": receipt.DAILY_MEMBER_FEE,
        "event_days": receipt.EVENT_DAYS,
        "id_card_fee": receipt.ID_CARD_FEE,
        "default_security_fee": receipt.SECURITY_FEE_DEFAULT,
        "security_fee_applied": categories["SECURITY"]["billed"],
        "payments": [
            {
                "id": p.id,
                "kind": p.kind,
                "category": p.category,
                "amount": p.amount,
                "payment_mode": p.payment_mode,
                "transaction_id": p.transaction_id,
                "payment_date": p.payment_date.isoformat(),
                "reason": p.reason,
                "member_count": (_bill_quantity(p) or None) if p.kind == "BILL" else None,
                "subtotal": p.subtotal,
                "discount": p.discount,
            }
            for p in payments_sorted
        ],
    }


@router.get("/{team_id}/billing-summary")
def billing_summary(team_id: int, db: Session = Depends(get_db)):
    return _billing_summary_dict(_get_team(db, team_id))


@router.post("/{team_id}/bills")
def create_bill(team_id: int, payload: schemas.BillCreate, db: Session = Depends(get_db)):
    """Record-only — declares what is owed in one category. Does not imply
    payment and returns no PDF; download the up-to-date Invoice separately
    via get_invoice below once ready."""
    team = _get_team(db, team_id)
    category = payload.category
    txn_date = payload.payment_date or date.today()

    if category == "SECURITY":
        if _rows(team, "BILL", "SECURITY"):
            raise HTTPException(400, "The security receipt has already been raised for this team")
        amount = payload.amount if payload.amount is not None else receipt.SECURITY_FEE_DEFAULT
        if amount <= 0:
            raise HTTPException(400, "Security receipt amount must be more than Rs. 0")
        db.add(models.Payment(
            team_id=team.id, kind="BILL", category=category, amount=amount,
            payment_date=txn_date, subtotal=amount, discount=0,
        ))
        db.commit()
        db.refresh(team)
        return _billing_summary_dict(team)

    per_member_amount = MEMBER_RATES[category]  # static: not editable
    discount = payload.discount or 0
    if discount < 0:
        raise HTTPException(400, "Discount can't be negative")

    members = None
    if payload.quantity is not None:
        quantity = payload.quantity
        if quantity < 1:
            raise HTTPException(400, "Enter the number of members to bill (at least 1)")
    elif payload.members:
        # Older app builds still tick members: bill exactly those, once each.
        billed_keys = _billed_keys(team, category)
        roster = {(m["kind"], m["id"]): m for m in _billable_members(team)}
        members = []
        seen = set()
        for ref in payload.members:
            key = (ref.kind, ref.id)
            if key in seen:
                continue
            seen.add(key)
            if key in billed_keys:
                raise HTTPException(400, f"{roster.get(key, {}).get('name', 'A selected member')} has already been billed")
            if key not in roster:
                raise HTTPException(400, "A selected member isn't on this team's billable roster")
            members.append(roster[key])
        quantity = None
    else:
        raise HTTPException(400, "Enter the number of members to bill (at least 1)")

    subtotal = per_member_amount * (quantity if members is None else len(members))
    if discount > subtotal:
        raise HTTPException(400, f"Discount can't exceed the bill subtotal of Rs. {subtotal:,}")

    db.add(models.Payment(
        team_id=team.id, kind="BILL", category=category, amount=subtotal - discount, payment_date=txn_date,
        members=members, quantity=quantity, subtotal=subtotal, discount=discount,
    ))
    db.commit()
    db.refresh(team)
    return _billing_summary_dict(team)


@router.get("/{team_id}/invoice.pdf")
def get_invoice(
    team_id: int,
    category: Literal["REGISTRATION", "SECURITY", "IDCARD"] = "REGISTRATION",
    db: Session = Depends(get_db),
):
    """One category's full current billing state as a PDF — the Registration
    Fee invoice, the Security Receipt or the ID Card invoice: every BILL of
    that category (each at that bill's own per-member rate), the aggregate
    subtotal/discount/total billed, and live Total
    Paid/Balance Due for that category only. Always reflects "now", not a
    frozen snapshot from whenever a bill or payment happened — that's the
    whole point of splitting billing from downloading (see module
    docstring). It matches the on-screen billing summary exactly, since both
    come from _bill_breakdown/_category_totals."""
    team = _get_team(db, team_id)
    if not _rows(team, "BILL", category):
        raise HTTPException(404, f"This team has no {receipt.CATEGORY_LABELS[category].lower()} bill yet")

    lines, subtotal, discount, _ = _bill_breakdown(team, category)
    totals = _category_totals(team, category)
    payments = [
        {"date": p.payment_date, "mode": p.payment_mode, "transaction_id": p.transaction_id, "amount": p.amount}
        for p in sorted(_rows(team, "PAYMENT", category), key=lambda p: (p.payment_date, p.id))
    ]
    pdf = receipt.render_invoice(
        team, lines, subtotal, discount, totals["total_paid"], date.today(), payments, category
    )
    return _pdf_response(pdf, f"{receipt.INVOICE_FILE_STEMS[category]}-{team.school_code or team.id}.pdf")


@router.post("/{team_id}/payments")
def create_payment(team_id: int, payload: schemas.PaymentCreate, db: Session = Depends(get_db)):
    """Record-only — logs money received against one category's outstanding
    balance. Does not itself return a PDF; download the updated Invoice
    separately via get_invoice once ready (see module docstring)."""
    team = _get_team(db, team_id)
    category = payload.category
    label = receipt.CATEGORY_LABELS[category]
    transaction_id = _validate_payment_fields(payload.payment_mode, payload.transaction_id)
    txn_date = payload.payment_date or date.today()

    balance_due = _category_totals(team, category)["balance_due"]
    if balance_due <= 0:
        raise HTTPException(400, f"This team has no outstanding {label.lower()} balance to pay")
    if payload.amount <= 0 or payload.amount > balance_due:
        raise HTTPException(400, f"Payment amount must be between Rs. 1 and Rs. {balance_due:,} (this team's outstanding {label.lower()} balance)")

    db.add(models.Payment(
        team_id=team.id, kind="PAYMENT", category=category, amount=payload.amount,
        payment_mode=payload.payment_mode, transaction_id=transaction_id, payment_date=txn_date,
    ))
    db.commit()
    db.refresh(team)
    return _billing_summary_dict(team)


@router.post("/{team_id}/refunds")
def create_refund(team_id: int, payload: schemas.RefundCreate, db: Session = Depends(get_db)):
    team = _get_team(db, team_id)
    category = payload.category
    label = receipt.CATEGORY_LABELS[category]
    transaction_id = _validate_payment_fields(payload.payment_mode, payload.transaction_id)
    txn_date = payload.payment_date or date.today()

    if not payload.reason.strip():
        raise HTTPException(400, "A reason is required for a refund")

    before = _category_totals(team, category)
    net_collected = before["net_collected"]
    if net_collected <= 0:
        raise HTTPException(400, f"This team has no net received {label.lower()} amount to refund")
    if payload.amount <= 0 or payload.amount > net_collected:
        raise HTTPException(400, f"Refund amount must be between Rs. 1 and Rs. {net_collected:,} (this team's net received {label.lower()} total)")

    payment = models.Payment(
        team_id=team.id, kind="REFUND", category=category, amount=payload.amount,
        payment_mode=payload.payment_mode, transaction_id=transaction_id,
        payment_date=txn_date, reason=payload.reason.strip(),
    )
    db.add(payment)
    db.commit()

    pdf = receipt.render_refund_voucher(
        team, payload.amount, payload.reason.strip(),
        payment_mode=payload.payment_mode, transaction_id=transaction_id, refund_date=txn_date,
        total_billed=before["total_billed"], total_paid=before["total_paid"],
        net_collected=net_collected - payload.amount, category=category,
    )
    return _pdf_response(pdf, f"refund-{team.school_code or team.id}-{payment.id}.pdf")


@router.get("/{team_id}/refunds/{payment_id}.pdf")
def reprint_refund(team_id: int, payment_id: int, db: Session = Depends(get_db)):
    """Re-download the voucher for an already-recorded refund — the same
    core content (amount, reason, mode, date, category) it was created with,
    since those fields are stored verbatim on the Payment row; the Total
    Billed/Paid/Net Collected context line reflects that category's current
    totals (not a point-in-time snapshot, consistent with the Invoice's
    "always current" design) rather than exactly what those figures were at
    the moment this refund was first issued."""
    team = _get_team(db, team_id)
    payment = db.get(models.Payment, payment_id)
    if not payment or payment.team_id != team_id or payment.kind != "REFUND":
        raise HTTPException(404, "Refund not found for this team")

    totals = _category_totals(team, payment.category)
    pdf = receipt.render_refund_voucher(
        team, payment.amount, payment.reason or "",
        payment_mode=payment.payment_mode, transaction_id=payment.transaction_id, refund_date=payment.payment_date,
        total_billed=totals["total_billed"], total_paid=totals["total_paid"],
        net_collected=totals["net_collected"], category=payment.category,
    )
    return _pdf_response(pdf, f"refund-{team.school_code or team.id}-{payment.id}.pdf")


class ClearAllPaymentsRequest(BaseModel):
    admin_password: str


def _require_admin_password(db: Session, password: str) -> None:
    """Same 'type an admin password to unlock' shape as attendance.py's
    un-mark-attendance and public.py's reveal-contacts — wiping the entire
    tournament's billing ledger needs more than just already being logged in
    as an admin; it needs a second, deliberate confirmation."""
    admins = (
        db.query(models.OrganizerUser)
        .filter(models.OrganizerUser.is_active.is_(True), models.OrganizerUser.is_admin.is_(True))
        .all()
    )
    if not any(verify_password(password, u.password_hash) for u in admins):
        raise HTTPException(401, "Incorrect admin password")


@router.delete("/payments/clear-all", dependencies=[Depends(require_admin)])
def clear_all_payments(payload: ClearAllPaymentsRequest, db: Session = Depends(get_db)):
    """Wipes every BILL/PAYMENT/REFUND row for every team — a full reset of
    the registration-fee ledger (e.g. to clear out test/sample data before
    real registrations begin). There is no undo: models.Payment is otherwise
    an append-only ledger by design, specifically so a team's financial
    history stays trustworthy — this admin-only, password-confirmed action
    is the one deliberate exception to that.

    Path is "/payments/clear-all", not just "/payments": this router shares
    the "/api/teams" prefix with teams.py, whose DELETE "/{team_id}" is
    registered first in main.py — a literal single-segment "/payments" path
    would be swallowed by that pattern (team_id="payments") before ever
    reaching this route. The extra segment sidesteps the collision."""
    _require_admin_password(db, payload.admin_password)
    deleted = db.query(models.Payment).delete()
    db.commit()
    return {"deleted": deleted}


@router.delete("/{team_id}/payments/clear", dependencies=[Depends(require_admin)])
def clear_team_payments(team_id: int, payload: ClearAllPaymentsRequest, db: Session = Depends(get_db)):
    """clear_all_payments above, for one team only — wipes that team's every
    BILL/PAYMENT/REFUND row (e.g. a bill raised against the wrong school or
    with the wrong members). Same admin-only + admin-password confirmation,
    same no-undo caveat. Billed status is derived purely from these rows
    (_billed_keys), so the team's members become billable again from scratch
    in every category, including the one-time security receipt."""
    team = db.get(models.Team, team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    _require_admin_password(db, payload.admin_password)
    deleted = db.query(models.Payment).filter(models.Payment.team_id == team_id).delete()
    db.commit()
    return {"deleted": deleted}
