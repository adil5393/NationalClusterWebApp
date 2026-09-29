"""app_settings.attendance_locked — freeze attendance changes for every member

Revision ID: j3e7f5a2b6c0
Revises: i2d6e4f1a5b9
Create Date: 2026-09-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "j3e7f5a2b6c0"
down_revision = "i2d6e4f1a5b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "app_settings",
        sa.Column("attendance_locked", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("app_settings", "attendance_locked")
