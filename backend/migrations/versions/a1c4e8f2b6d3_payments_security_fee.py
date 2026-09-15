"""payments security fee

Adds a flat, one-time-per-team `security_fee` column to `payments`, applied
alongside a BILL's subtotal/discount (see models.Payment, routers/payments.py
create_bill).

Revision ID: a1c4e8f2b6d3
Revises: b8d4f2a9c6e1
Create Date: 2026-09-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a1c4e8f2b6d3"
down_revision = "b8d4f2a9c6e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("security_fee", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "security_fee")
