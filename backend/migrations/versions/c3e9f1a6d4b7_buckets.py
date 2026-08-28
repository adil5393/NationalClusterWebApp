"""buckets: staging area between a finished round and its successor

Revision ID: c3e9f1a6d4b7
Revises: b7d1f4a9c3e8
Create Date: 2026-08-28 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c3e9f1a6d4b7"
down_revision = "b7d1f4a9c3e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "buckets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tournament_id", sa.Integer(), sa.ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("source_round_id", sa.Integer(), sa.ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False),
        sa.Column("round_id", sa.Integer(), sa.ForeignKey("rounds.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "bucket_teams",
        sa.Column("bucket_id", sa.Integer(), sa.ForeignKey("buckets.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("source_pool_id", sa.Integer(), sa.ForeignKey("pools.id", ondelete="SET NULL"), nullable=True),
        sa.Column("seed_rank", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("bucket_teams")
    op.drop_table("buckets")
