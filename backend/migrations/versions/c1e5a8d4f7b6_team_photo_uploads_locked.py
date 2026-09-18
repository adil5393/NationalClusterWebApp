"""team photo_uploads_locked (public upload kill-switch)

Revision ID: c1e5a8d4f7b6
Revises: b7d3f9a2c6e4
Create Date: 2026-09-19 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c1e5a8d4f7b6"
down_revision = "b7d3f9a2c6e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "teams",
        sa.Column("photo_uploads_locked", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("teams", "photo_uploads_locked")
