"""participant is_active (ID-card opt-out)

Revision ID: b7d3f9a2c6e4
Revises: a4c7e1f9b3d2
Create Date: 2026-09-18 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "b7d3f9a2c6e4"
down_revision = "a4c7e1f9b3d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "participants",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("participants", "is_active")
