"""team disqualifications

Adds team_disqualifications: a team disqualified from one specific
Tournament (never event-wide — a school can be legitimately still playing a
different age group's tournament). Row existence = disqualified from that
tournament; checked in routers/matches.py's _team_unplayable_reason
(alongside Team.is_active and TeamInactiveAgeGroup) so a disqualified team
can never be newly scheduled into anything else in this tournament. See
routers/matches.py's disqualify_team for the cascade this triggers
(forfeiting/cancelling the team's already-scheduled matches) — this table
only records the fact and blocks future scheduling.

Purely additive: a new table, no existing table is touched.

Revision ID: b4d7e2c9a3f6
Revises: d4e9f7b3c8a2
Create Date: 2026-09-14 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "b4d7e2c9a3f6"
down_revision = "d4e9f7b3c8a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "team_disqualifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("tournament_id", sa.Integer(), nullable=False),
        sa.Column("match_id", sa.Integer(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("disqualified_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tournament_id"], ["tournaments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["match_id"], ["matches.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["disqualified_by_id"], ["organizer_users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("team_id", "tournament_id", name="uq_team_disqualification"),
    )


def downgrade() -> None:
    op.drop_table("team_disqualifications")
