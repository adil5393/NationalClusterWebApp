"""app_settings.room_lookup_disabled — turn off the public Campus map's room lookup

Revision ID: h1c5d3e0f4a8
Revises: g8b4c2d9e3f7
Create Date: 2026-09-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "h1c5d3e0f4a8"
down_revision = "g8b4c2d9e3f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "app_settings",
        sa.Column("room_lookup_disabled", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("app_settings", "room_lookup_disabled")
