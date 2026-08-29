"""team is_active, tournament min_present_players, per-age-group last-year awards

Replaces the tournament-wide teams.last_year_winner/last_year_runner booleans
with a team_last_year_awards table scoped per age group (a school can be
winner in one age group and runner-up in another). Team data was fully wiped
just before this migration for testing, so there's no legacy data to carry
over — a clean cutover.

Revision ID: e8c4a2f7b3d5
Revises: d1e4f8a2c9b7
Create Date: 2026-08-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e8c4a2f7b3d5"
down_revision = "d1e4f8a2c9b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("teams", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("tournaments", sa.Column("min_present_players", sa.Integer(), nullable=False, server_default="10"))

    op.create_table(
        "team_last_year_awards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("age_group", sa.String(length=40), nullable=False),
        sa.Column("award", sa.String(length=10), nullable=False),
        sa.UniqueConstraint("team_id", "age_group", name="uq_team_last_year_award_team_group"),
        sa.UniqueConstraint("age_group", "award", name="uq_team_last_year_award_group_award"),
    )

    op.drop_column("teams", "last_year_winner")
    op.drop_column("teams", "last_year_runner")


def downgrade() -> None:
    op.add_column("teams", sa.Column("last_year_winner", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("teams", sa.Column("last_year_runner", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.drop_table("team_last_year_awards")
    op.drop_column("tournaments", "min_present_players")
    op.drop_column("teams", "is_active")
