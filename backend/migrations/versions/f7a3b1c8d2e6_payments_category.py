"""payments category — three separate bills per team

Adds `payments.category` ("REGISTRATION" | "SECURITY" | "IDCARD"). A team is
now billed three independent ways, each with its own bill, payments, refunds
and invoice (see routers/payments.py):

- REGISTRATION: participation fee per member x event days
- SECURITY: flat one-time security receipt
- IDCARD: per-head ID card fee

Existing data is migrated so nothing changes in the totals:
- every legacy BILL that carried a security_fee is split into a REGISTRATION
  bill (amount minus the security fee) plus a separate SECURITY bill;
- legacy PAYMENT/REFUND rows (which used to hit one combined balance) are
  allocated to REGISTRATION first, then SECURITY, splitting a row where it
  crosses the boundary.

Revision ID: f7a3b1c8d2e6
Revises: e6f4a0b3c9d5
Create Date: 2026-09-28 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "f7a3b1c8d2e6"
down_revision = "e6f4a0b3c9d5"
branch_labels = None
depends_on = None

_payments = sa.table(
    "payments",
    sa.column("id", sa.Integer),
    sa.column("team_id", sa.Integer),
    sa.column("kind", sa.String),
    sa.column("category", sa.String),
    sa.column("amount", sa.Integer),
    sa.column("payment_mode", sa.String),
    sa.column("transaction_id", sa.String),
    sa.column("payment_date", sa.Date),
    sa.column("reason", sa.Text),
    sa.column("security_fee", sa.Integer),
    sa.column("subtotal", sa.Integer),
    sa.column("discount", sa.Integer),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)


def upgrade() -> None:
    op.add_column(
        "payments",
        sa.Column("category", sa.String(length=12), nullable=False, server_default="REGISTRATION"),
    )
    conn = op.get_bind()
    rows = conn.execute(sa.select(_payments).order_by(_payments.c.team_id, _payments.c.id)).mappings().all()

    by_team: dict = {}
    for r in rows:
        by_team.setdefault(r["team_id"], []).append(r)

    for team_rows in by_team.values():
        billed = {"REGISTRATION": 0, "SECURITY": 0}
        for r in team_rows:
            if r["kind"] != "BILL":
                continue
            sec = r["security_fee"] or 0
            if sec > 0:
                conn.execute(
                    _payments.update().where(_payments.c.id == r["id"]).values(
                        amount=r["amount"] - sec, security_fee=None, category="REGISTRATION"
                    )
                )
                conn.execute(
                    _payments.insert().values(
                        team_id=r["team_id"], kind="BILL", category="SECURITY", amount=sec,
                        payment_date=r["payment_date"], created_at=r["created_at"], updated_at=r["updated_at"],
                    )
                )
                billed["REGISTRATION"] += r["amount"] - sec
                billed["SECURITY"] += sec
            else:
                billed["REGISTRATION"] += r["amount"]

        if billed["SECURITY"] == 0:
            continue  # nothing was ever split out — every legacy row is already REGISTRATION

        # Allocate money rows in id order: REGISTRATION takes each PAYMENT up
        # to what it billed, SECURITY the rest; a REFUND comes out of
        # REGISTRATION up to the money it actually received, SECURITY the rest.
        paid_total = sum(r["amount"] for r in team_rows if r["kind"] == "PAYMENT")
        room = {"PAYMENT": billed["REGISTRATION"], "REFUND": min(paid_total, billed["REGISTRATION"])}
        for r in team_rows:
            if r["kind"] not in room:
                continue
            to_reg = min(r["amount"], room[r["kind"]])
            to_sec = r["amount"] - to_reg
            room[r["kind"]] -= to_reg
            if to_sec == 0:
                continue
            if to_reg == 0:
                conn.execute(_payments.update().where(_payments.c.id == r["id"]).values(category="SECURITY"))
                continue
            conn.execute(_payments.update().where(_payments.c.id == r["id"]).values(amount=to_reg))
            conn.execute(
                _payments.insert().values(
                    team_id=r["team_id"], kind=r["kind"], category="SECURITY", amount=to_sec,
                    payment_mode=r["payment_mode"], transaction_id=r["transaction_id"],
                    payment_date=r["payment_date"], reason=r["reason"],
                    created_at=r["created_at"], updated_at=r["updated_at"],
                )
            )


def downgrade() -> None:
    op.drop_column("payments", "category")
