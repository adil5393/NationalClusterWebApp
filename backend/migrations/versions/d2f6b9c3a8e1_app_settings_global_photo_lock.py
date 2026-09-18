"""app_settings singleton table + global photo uploads lock

Revision ID: d2f6b9c3a8e1
Revises: c1e5a8d4f7b6
Create Date: 2026-09-19 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "d2f6b9c3a8e1"
down_revision = "c1e5a8d4f7b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("global_photo_uploads_locked", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.execute("INSERT INTO app_settings (id, global_photo_uploads_locked) VALUES (1, false)")


def downgrade() -> None:
    op.drop_table("app_settings")
