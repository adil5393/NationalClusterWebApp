"""payments invoice model

Splits billing from payment: a BILL row is now an invoice (doesn't imply
money received) carrying subtotal/discount alongside the final amount, and
a new PAYMENT kind records money actually received (supports partial
payments over multiple rows) against a team's outstanding balance.
payment_mode/transaction_id relax to nullable since a BILL no longer has
them (only PAYMENT/REFUND do).

Revision ID: 6b2f81fc1c87
Revises: 889b41d64328
Create Date: 2026-09-13 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "6b2f81fc1c87"
down_revision = "889b41d64328"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("subtotal", sa.Integer(), nullable=True))
    op.add_column("payments", sa.Column("discount", sa.Integer(), nullable=True))
    op.alter_column("payments", "payment_mode", existing_type=sa.String(length=10), nullable=True)


def downgrade() -> None:
    op.alter_column("payments", "payment_mode", existing_type=sa.String(length=10), nullable=False)
    op.drop_column("payments", "discount")
    op.drop_column("payments", "subtotal")
