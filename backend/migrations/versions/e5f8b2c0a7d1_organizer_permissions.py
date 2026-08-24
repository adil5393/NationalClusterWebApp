"""organizer user is_admin + per-module permissions

Revision ID: e5f8b2c0a7d1
Revises: d3e7a1f9b6c4
Create Date: 2026-08-24 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e5f8b2c0a7d1"
down_revision = "d3e7a1f9b6c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizer_users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("organizer_users", sa.Column("permissions", sa.JSON(), nullable=False, server_default="{}"))
    # Every account created before this migration was the shared-login equivalent of
    # a full admin — grandfather them in rather than silently locking them out.
    op.execute("UPDATE organizer_users SET is_admin = true")


def downgrade() -> None:
    op.drop_column("organizer_users", "permissions")
    op.drop_column("organizer_users", "is_admin")
