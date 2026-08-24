"""organizer users (individual logins, replacing shared ADMIN_PASSWORD)

Revision ID: d3e7a1f9b6c4
Revises: c1f4a9d7e5b2
Create Date: 2026-08-24 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "d3e7a1f9b6c4"
down_revision = "c1f4a9d7e5b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizer_users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=80), nullable=False, unique=True),
        sa.Column("full_name", sa.String(length=120)),
        sa.Column("password_hash", sa.String(length=200), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("organizer_users")
