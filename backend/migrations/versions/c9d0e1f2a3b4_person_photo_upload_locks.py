"""per-participant and per-coach photo upload locks

Revision ID: c9d0e1f2a3b4
Revises: d8e9f0a1b2c3
Create Date: 2026-09-21 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c9d0e1f2a3b4"
down_revision = "d8e9f0a1b2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("participants", "coaches"):
        op.add_column(table, sa.Column("photo_uploads_locked", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    for table in ("coaches", "participants"):
        op.drop_column(table, "photo_uploads_locked")
