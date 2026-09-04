"""coach attendance (is_present, checked_in_at)

Revision ID: c9d4e2f7a1b6
Revises: f2a6d8c3b5e1
Create Date: 2026-09-05 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c9d4e2f7a1b6"
down_revision = "f2a6d8c3b5e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("coaches", sa.Column("is_present", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("coaches", sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_coaches_is_present", "coaches", ["is_present"])


def downgrade() -> None:
    op.drop_index("ix_coaches_is_present", table_name="coaches")
    op.drop_column("coaches", "checked_in_at")
    op.drop_column("coaches", "is_present")
