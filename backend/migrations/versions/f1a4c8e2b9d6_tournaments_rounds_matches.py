"""tournaments, rounds, matches, match_events (fixture + live match tracking)

Revision ID: f1a4c8e2b9d6
Revises: e5f8b2c0a7d1
Create Date: 2026-08-24 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "f1a4c8e2b9d6"
down_revision = "e5f8b2c0a7d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tournaments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("sport", sa.String(length=80)),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "rounds",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tournament_id", sa.Integer(), sa.ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_rounds_tournament_id", "rounds", ["tournament_id"])

    op.create_table(
        "matches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tournament_id", sa.Integer(), sa.ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("round_id", sa.Integer(), sa.ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False),
        sa.Column("team_a_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="SET NULL")),
        sa.Column("team_b_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="SET NULL")),
        sa.Column("source_match_a_id", sa.Integer(), sa.ForeignKey("matches.id", ondelete="SET NULL")),
        sa.Column("source_match_b_id", sa.Integer(), sa.ForeignKey("matches.id", ondelete="SET NULL")),
        sa.Column("venue_id", sa.Integer(), sa.ForeignKey("venues.id", ondelete="SET NULL")),
        sa.Column("scheduled_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="SCHEDULED"),
        sa.Column("team_a_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("team_b_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("winner_team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="SET NULL")),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_matches_tournament_id", "matches", ["tournament_id"])
    op.create_index("ix_matches_round_id", "matches", ["round_id"])
    op.create_index("ix_matches_status", "matches", ["status"])

    op.create_table(
        "match_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("match_id", sa.Integer(), sa.ForeignKey("matches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(length=20), nullable=False),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="SET NULL")),
        sa.Column("component", sa.String(length=40)),
        sa.Column("delta", sa.Integer()),
        sa.Column("team_a_score", sa.Integer(), nullable=False),
        sa.Column("team_b_score", sa.Integer(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("organizer_users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_match_events_match_id", "match_events", ["match_id"])


def downgrade() -> None:
    op.drop_index("ix_match_events_match_id", table_name="match_events")
    op.drop_table("match_events")
    op.drop_index("ix_matches_status", table_name="matches")
    op.drop_index("ix_matches_round_id", table_name="matches")
    op.drop_index("ix_matches_tournament_id", table_name="matches")
    op.drop_table("matches")
    op.drop_index("ix_rounds_tournament_id", table_name="rounds")
    op.drop_table("rounds")
    op.drop_table("tournaments")
