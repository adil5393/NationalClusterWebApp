"""participant weight

Adds a weigh-in reading (kg) to `participants`, settable only via
POST /api/participants/{id}/weight (see routers/attendance.py) which also
derives is_present from it for any age group with a defined weight cap.

Revision ID: c2e6a9f3d7b1
Revises: a1c4e8f2b6d3
Create Date: 2026-09-16 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c2e6a9f3d7b1"
down_revision = "a1c4e8f2b6d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("weight", sa.Numeric(5, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("participants", "weight")
