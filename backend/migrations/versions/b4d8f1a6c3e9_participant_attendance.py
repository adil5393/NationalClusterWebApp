"""participant attendance (is_present, checked_in_at)

Revision ID: b4d8f1a6c3e9
Revises: a7c2e9f4d1b8
Create Date: 2026-08-25 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "b4d8f1a6c3e9"
down_revision = "a7c2e9f4d1b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("is_present", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("participants", sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_participants_is_present", "participants", ["is_present"])


def downgrade() -> None:
    op.drop_index("ix_participants_is_present", table_name="participants")
    op.drop_column("participants", "checked_in_at")
    op.drop_column("participants", "is_present")
