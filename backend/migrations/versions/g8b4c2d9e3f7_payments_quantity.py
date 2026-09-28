"""payments quantity — bill members by head-count

Adds `payments.quantity`: the number of members a REGISTRATION / IDCARD BILL
charges, entered as a single figure in the Bill dialog (see routers/
payments.py create_bill). Existing bills keep their `members` list; their
head-count is simply the length of that list (payments._bill_quantity), so no
data needs backfilling.

Revision ID: g8b4c2d9e3f7
Revises: f7a3b1c8d2e6
Create Date: 2026-09-28 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "g8b4c2d9e3f7"
down_revision = "f7a3b1c8d2e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("quantity", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "quantity")
