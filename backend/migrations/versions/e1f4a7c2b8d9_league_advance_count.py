"""tournaments.league_advance_count

How many teams qualify out of each pool in a League round, tournament-wide
(1 or 2). Defaults to 2 to match the previously-hardcoded "top 2 per pool"
behavior, so existing tournaments keep working exactly as before until an
organizer changes it.

Revision ID: e1f4a7c2b8d9
Revises: d8a3f6c1b9e2
Create Date: 2026-09-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e1f4a7c2b8d9"
down_revision = "d8a3f6c1b9e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tournaments", sa.Column("league_advance_count", sa.Integer(), nullable=False, server_default="2"))
    op.alter_column("tournaments", "league_advance_count", server_default=None)


def downgrade() -> None:
    op.drop_column("tournaments", "league_advance_count")
