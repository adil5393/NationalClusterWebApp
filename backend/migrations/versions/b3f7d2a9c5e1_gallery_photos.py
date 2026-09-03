"""gallery_photos

Day/group tags for Championship Photo Gallery uploads (see routers/gallery.py)
— lets the public homepage group photos into an album by day.

Revision ID: b3f7d2a9c5e1
Revises: a2d6c8e4f1b7
Create Date: 2026-09-04 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "b3f7d2a9c5e1"
down_revision = "a2d6c8e4f1b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gallery_photos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("tag", sa.String(length=60), nullable=False, server_default="General"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("filename", name="uq_gallery_photos_filename"),
    )


def downgrade() -> None:
    op.drop_table("gallery_photos")
