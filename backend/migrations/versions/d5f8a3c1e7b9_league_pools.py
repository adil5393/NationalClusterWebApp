"""league pools (Pool, pool_teams, Match.match_type / pool_id)

Revision ID: d5f8a3c1e7b9
Revises: c9e3b7a2f6d4
Create Date: 2026-08-26 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "d5f8a3c1e7b9"
down_revision = "c9e3b7a2f6d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "pools",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tournament_id", sa.Integer(), sa.ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("round_id", sa.Integer(), sa.ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_pools_round_id", "pools", ["round_id"])

    op.create_table(
        "pool_teams",
        sa.Column("pool_id", sa.Integer(), sa.ForeignKey("pools.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True),
    )

    op.add_column("matches", sa.Column("match_type", sa.String(length=20), nullable=False, server_default="KNOCKOUT"))
    op.add_column("matches", sa.Column("pool_id", sa.Integer(), sa.ForeignKey("pools.id", ondelete="CASCADE"), nullable=True))
    op.create_index("ix_matches_pool_id", "matches", ["pool_id"])


def downgrade() -> None:
    op.drop_index("ix_matches_pool_id", table_name="matches")
    op.drop_column("matches", "pool_id")
    op.drop_column("matches", "match_type")
    op.drop_table("pool_teams")
    op.drop_index("ix_pools_round_id", table_name="pools")
    op.drop_table("pools")
