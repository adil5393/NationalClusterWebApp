"""participant age_group

Revision ID: c1f4a9d7e5b2
Revises: 8a2d6f0b1c3e
Create Date: 2026-08-24 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c1f4a9d7e5b2"
down_revision = "8a2d6f0b1c3e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("age_group", sa.String(length=40), nullable=True))


def downgrade() -> None:
    op.drop_column("participants", "age_group")
