"""matches.scheduled_end_at

Explicit end of a match's scheduled time slot, alongside the existing
scheduled_at (start). Only used by the Mat / Ground admin page's overlap
check (routers/matches.py set_match_mat) — two matches on the same mat can't
have overlapping [scheduled_at, scheduled_end_at) ranges.

Revision ID: d4b8f2a6c1e9
Revises: c3a8e5f1d7b2
Create Date: 2026-09-03 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "d4b8f2a6c1e9"
down_revision = "c3a8e5f1d7b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("matches", sa.Column("scheduled_end_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("matches", "scheduled_end_at")
