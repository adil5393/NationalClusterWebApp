"""gallery_photos.is_approved — moderation gate for public "Action Captured on the Mat" uploads

Existing rows (all admin-uploaded/camera-captured so far) backfill to true via
server_default, so nothing already on the public site disappears.

Revision ID: i2d6e4f1a5b9
Revises: h1c5d3e0f4a8
Create Date: 2026-09-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "i2d6e4f1a5b9"
down_revision = "h1c5d3e0f4a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "gallery_photos",
        sa.Column("is_approved", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("gallery_photos", "is_approved")
