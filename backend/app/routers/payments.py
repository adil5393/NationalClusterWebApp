"""Registration-fee ledger for a team (see models.Payment): BILL (invoice,
no money implied), PAYMENT (money actually received, partial or full,
against the team's outstanding balance), REFUND (money returned, capped at
what's actually been received net of prior refunds).

A team can be billed more than once over time — each "Bill" only charges
present members who haven't already been billed by an earlier one (a
straggler who checks in later gets picked up by the next bill), so the
member set a bill charges is computed fresh from current attendance minus
every prior BILL's snapshot, never re-derived after the fact. Per-member
amount and a flat discount are both entered at billing time and apply to
every member that bill covers.

Bill and Payment are record-only (no PDF) — the downloadable Invoice
(get_invoice) always reflects the team's current billed/paid/balance state
rather than a frozen snapshot from whenever a transaction happened. Refund
stays a single combined step with its voucher, since a refund is a discrete
completed action rather than something that accrues afterward.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import models, receipt, schemas
from ..database import get_db

router = APIRouter(prefix="/api/teams", tags=["payments"])

PDF_MEDIA_TYPE = "application/pdf"


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
    return team


def _present_members(team: models.Team) -> list[dict]:
    """Every currently-present participant/coach/manager on this team, as
    the {"kind", "id", "name", "role"} shape stored in a BILL's `members`
    snapshot — kind+id is what lets a later bill tell "already billed" apart
    from "newly present"."""
    members = [
        {"kind": "participant", "id": p.id, "name": p.full_name, "role": p.role or "Player"}
        for p in sorted(team.participants, key=lambda p: p.full_name)
        if p.is_present
    ]
    members += [
        {"kind": "coach", "id": c.id, "name": c.full_name, "role": c.role}
        for c in sorted(team.coaches, key=lambda c: c.full_name)
        if c.is_present
    ]
    return members


def _billed_keys(team: models.Team) -> set:
    """(kind, id) for every member any prior BILL on this team has already
    charged for — a PAYMENT/REFUND never removes a member from this set;
    they're purely financial and don't reopen billing for anyone."""
    keys = set()
    for pay in team.payments:
        if pay.kind == "BILL" and pay.members:
            keys.update((m["kind"], m["id"]) for m in pay.members)
    return keys


def _totals(team: models.Team) -> dict:
    total_billed = sum(p.amount for p in team.payments if p.kind == "BILL")
    total_paid = sum(p.amount for p in team.payments if p.kind == "PAYMENT")
    total_refunded = sum(p.amount for p in team.payments if p.kind == "REFUND")
    return {
        "total_billed": total_billed,
        "total_paid": total_paid,
        "total_refunded": total_refunded,
        "balance_due": total_billed - total_paid,
        "net_collected": total_paid - total_refunded,
    }


def _validate_payment_fields(payment_mode: str, transaction_id: "str | None") -> "str | None":
    if payment_mode not in ("Cash", "UPI"):
        raise HTTPException(400, "payment_mode must be 'Cash' or 'UPI'")
    transaction_id = (transaction_id or "").strip() or None
    if payment_mode == "UPI" and not transaction_id:
        raise HTTPException(400, "transaction_id is required for UPI payments")
    return transaction_id


def _billing_summary_dict(team: models.Team) -> dict:
    billed_keys = _billed_keys(team)
    unbilled = [m for m in _present_members(team) if (m["kind"], m["id"]) not in billed_keys]
    totals = _totals(team)
    payments_sorted = sorted(team.payments, key=lambda p: (p.payment_date, p.id), reverse=True)
    return {
        "team_id": team.id,
        "unbilled_present_members": unbilled,
        "default_per_member_amount": receipt.REGISTRATION_FEE,
        **totals,
        "payments": [
            {
                "id": p.id,
                "kind": p.kind,
                "amount": p.amount,
                "payment_mode": p.payment_mode,
                "transaction_id": p.transaction_id,
                "payment_date": p.payment_date.isoformat(),
                "reason": p.reason,
                "member_count": len(p.members) if p.members else None,
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
    """Record-only — declares what a set of members owe. Does not imply
    payment and returns no PDF; download the up-to-date Invoice separately
    via get_invoice below once ready."""
    team = _get_team(db, team_id)
    txn_date = payload.payment_date or date.today()
    per_member_amount = payload.per_member_amount if payload.per_member_amount is not None else receipt.REGISTRATION_FEE
    if per_member_amount < 0:
        raise HTTPException(400, "Per-member amount can't be negative")
    discount = payload.discount or 0
    if discount < 0:
        raise HTTPException(400, "Discount can't be negative")

    billed_keys = _billed_keys(team)
    members = [m for m in _present_members(team) if (m["kind"], m["id"]) not in billed_keys]
    if not members:
        raise HTTPException(400, "Every present member on this team has already been billed")

    subtotal = per_member_amount * len(members)
    if discount > subtotal:
        raise HTTPException(400, f"Discount can't exceed the bill subtotal of Rs. {subtotal:,}")
    amount = subtotal - discount

    payment = models.Payment(
        team_id=team.id, kind="BILL", amount=amount, payment_date=txn_date,
        members=members, subtotal=subtotal, discount=discount,
    )
    db.add(payment)
    db.commit()
    db.refresh(team)
    return _billing_summary_dict(team)


@router.get("/{team_id}/invoice.pdf")
def get_invoice(team_id: int, db: Session = Depends(get_db)):
    """The team's full current billing state as a PDF — every member across
    every BILL this team has ever had (each at that bill's own per-member
    rate), the aggregate subtotal/discount/total billed, and live Total
    Paid/Balance Due. Always reflects "now", not a frozen snapshot from
    whenever a bill or payment happened — that's the whole point of
    splitting billing from downloading (see module docstring)."""
    team = _get_team(db, team_id)
    bills = [p for p in team.payments if p.kind == "BILL"]
    if not bills:
        raise HTTPException(404, "This team has no bills yet")

    members: list[dict] = []
    subtotal = 0
    discount = 0
    for bill in bills:
        subtotal += bill.subtotal or 0
        discount += bill.discount or 0
        if bill.members:
            per_member = (bill.subtotal // len(bill.members)) if bill.members else 0
            for m in bill.members:
                members.append({"name": m["name"], "role": m["role"], "amount": per_member})

    totals = _totals(team)
    pdf = receipt.render_invoice(team, members, subtotal, discount, totals["total_paid"], date.today())
    return _pdf_response(pdf, f"invoice-{team.school_code or team.id}.pdf")


@router.post("/{team_id}/payments")
def create_payment(team_id: int, payload: schemas.PaymentCreate, db: Session = Depends(get_db)):
    """Record-only — logs money received against the team's outstanding
    balance. Does not itself return a PDF; download the updated Invoice
    separately via get_invoice once ready (see module docstring)."""
    team = _get_team(db, team_id)
    transaction_id = _validate_payment_fields(payload.payment_mode, payload.transaction_id)
    txn_date = payload.payment_date or date.today()

    balance_due = _totals(team)["balance_due"]
    if balance_due <= 0:
        raise HTTPException(400, "This team has no outstanding balance to pay")
    if payload.amount <= 0 or payload.amount > balance_due:
        raise HTTPException(400, f"Payment amount must be between Rs. 1 and Rs. {balance_due:,} (this team's outstanding balance)")

    payment = models.Payment(
        team_id=team.id, kind="PAYMENT", amount=payload.amount,
        payment_mode=payload.payment_mode, transaction_id=transaction_id, payment_date=txn_date,
    )
    db.add(payment)
    db.commit()
    db.refresh(team)
    return _billing_summary_dict(team)


@router.post("/{team_id}/refunds")
def create_refund(team_id: int, payload: schemas.RefundCreate, db: Session = Depends(get_db)):
    team = _get_team(db, team_id)
    transaction_id = _validate_payment_fields(payload.payment_mode, payload.transaction_id)
    txn_date = payload.payment_date or date.today()

    if not payload.reason.strip():
        raise HTTPException(400, "A reason is required for a refund")

    before = _totals(team)
    net_collected = before["net_collected"]
    if net_collected <= 0:
        raise HTTPException(400, "This team has no net received amount to refund")
    if payload.amount <= 0 or payload.amount > net_collected:
        raise HTTPException(400, f"Refund amount must be between Rs. 1 and Rs. {net_collected:,} (this team's net received total)")

    payment = models.Payment(
        team_id=team.id, kind="REFUND", amount=payload.amount,
        payment_mode=payload.payment_mode, transaction_id=transaction_id,
        payment_date=txn_date, reason=payload.reason.strip(),
    )
    db.add(payment)
    db.commit()

    pdf = receipt.render_refund_voucher(
        team, payload.amount, payload.reason.strip(),
        payment_mode=payload.payment_mode, transaction_id=transaction_id, refund_date=txn_date,
        total_billed=before["total_billed"], total_paid=before["total_paid"],
        net_collected=net_collected - payload.amount,
    )
    return _pdf_response(pdf, f"refund-{team.school_code or team.id}-{payment.id}.pdf")


@router.get("/{team_id}/refunds/{payment_id}.pdf")
def reprint_refund(team_id: int, payment_id: int, db: Session = Depends(get_db)):
    """Re-download the voucher for an already-recorded refund — the same
    core content (amount, reason, mode, date) it was created with, since
    those fields are stored verbatim on the Payment row; the Total Billed/
    Paid/Net Collected context line reflects the team's current totals
    (not a point-in-time snapshot, consistent with the Invoice's "always
    current" design) rather than exactly what those figures were at the
    moment this refund was first issued."""
    team = _get_team(db, team_id)
    payment = db.get(models.Payment, payment_id)
    if not payment or payment.team_id != team_id or payment.kind != "REFUND":
        raise HTTPException(404, "Refund not found for this team")

    totals = _totals(team)
    pdf = receipt.render_refund_voucher(
        team, payment.amount, payment.reason or "",
        payment_mode=payment.payment_mode, transaction_id=payment.transaction_id, refund_date=payment.payment_date,
        total_billed=totals["total_billed"], total_paid=totals["total_paid"],
        net_collected=totals["net_collected"],
    )
    return _pdf_response(pdf, f"refund-{team.school_code or team.id}-{payment.id}.pdf")
