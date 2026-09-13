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
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models, receipt, schemas
from ..auth_utils import verify_password
from ..database import get_db
from ..security import require_admin

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


def _live_bill_breakdown(team: models.Team) -> tuple[list[dict], int, int, int]:
    """Every prior BILL's own row (amount/subtotal/discount/members) stays an
    untouched, append-only record of what was charged and when — but nothing
    downstream (the on-screen billing summary, the downloadable Invoice PDF)
    should just trust that frozen amount forever. If someone a bill charged
    for is no longer marked present (e.g. correcting an is_present mistake
    after the fact — there's deliberately no separate "un-bill this person"
    action), this recomputes that bill's live contribution as if it had only
    ever billed the still-present subset, at the same per-member rate it was
    created with — the flat discount is kept as-is unless it would now
    exceed the shrunk subtotal, in which case it's capped there (never a
    negative bill). Returns (still-present members with their per-member
    amount — for the Invoice's line items, live subtotal, live discount,
    live total_billed) so every caller derives the same numbers from the
    same correction; shared by _totals (billing_summary, refetched every
    time the billing modal opens) and get_invoice below so they can never
    show different figures for the same team."""
    present_keys = {(m["kind"], m["id"]) for m in _present_members(team)}
    members: list[dict] = []
    subtotal = 0
    discount = 0
    total_billed = 0
    for p in team.payments:
        if p.kind != "BILL" or not p.members:
            continue
        original_count = len(p.members)
        per_member = (p.subtotal or 0) // original_count if original_count else 0
        still_present = [m for m in p.members if (m["kind"], m["id"]) in present_keys]
        bill_subtotal = per_member * len(still_present)
        bill_discount = min(p.discount or 0, bill_subtotal)
        subtotal += bill_subtotal
        discount += bill_discount
        total_billed += bill_subtotal - bill_discount
        for m in still_present:
            members.append({"name": m["name"], "role": m["role"], "amount": per_member})
    return members, subtotal, discount, total_billed


def _totals(team: models.Team) -> dict:
    total_billed = _live_bill_breakdown(team)[3]
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
    """The team's full current billing state as a PDF — every still-present
    member across every BILL this team has ever had (each at that bill's own
    per-member rate), the aggregate subtotal/discount/total billed, and live
    Total Paid/Balance Due. Always reflects "now", not a frozen snapshot from
    whenever a bill or payment happened — that's the whole point of
    splitting billing from downloading (see module docstring). In
    particular, anyone a bill charged for who's since been corrected to
    not-present (see _live_bill_breakdown) is left off this invoice
    entirely and excluded from every total, exactly like the on-screen
    billing summary — the two can never show different numbers."""
    team = _get_team(db, team_id)
    if not any(p.kind == "BILL" for p in team.payments):
        raise HTTPException(404, "This team has no bills yet")

    members, subtotal, discount, _ = _live_bill_breakdown(team)
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
