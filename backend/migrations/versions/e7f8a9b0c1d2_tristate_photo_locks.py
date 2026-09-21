"""photo upload locks become tri-state (NULL = inherit, true = locked, false = unlocked)

Revision ID: e7f8a9b0c1d2
Revises: c9d0e1f2a3b4
Create Date: 2026-09-22 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e7f8a9b0c1d2"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None

TABLES = ("teams", "participants", "coaches")


def upgrade() -> None:
    for table in TABLES:
        op.alter_column(table, "photo_uploads_locked", existing_type=sa.Boolean(), nullable=True, server_default=None)
        # Old "false" meant "no lock of its own" -> inherit.
        op.execute(f"UPDATE {table} SET photo_uploads_locked = NULL WHERE photo_uploads_locked = false")


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"UPDATE {table} SET photo_uploads_locked = false WHERE photo_uploads_locked IS NULL")
        op.alter_column(table, "photo_uploads_locked", existing_type=sa.Boolean(), nullable=False, server_default="false")
