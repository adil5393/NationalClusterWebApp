"""matches.source_pool_a/b_id + rank

The Knockout round built straight off a League round's pools (whole-season
League generation) needs a pool-stage equivalent of source_match_a/b_id: a
pre-planned match slot fed by a specific pool's qualifier at a specific rank
(1 = winner, 2 = runner-up) instead of another match's winner. Filled in by
routers/matches.py _propagate_pool_qualifiers once that pool's standings are
final, the same way source_match_a/b_id already gets filled by
_propagate_winner once a knockout match completes.

Revision ID: f3c8a1d6e9b4
Revises: e1f4a7c2b8d9
Create Date: 2026-09-02 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "f3c8a1d6e9b4"
down_revision = "e1f4a7c2b8d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("matches", sa.Column("source_pool_a_id", sa.Integer(), sa.ForeignKey("pools.id", ondelete="SET NULL"), nullable=True))
    op.add_column("matches", sa.Column("source_pool_a_rank", sa.Integer(), nullable=True))
    op.add_column("matches", sa.Column("source_pool_b_id", sa.Integer(), sa.ForeignKey("pools.id", ondelete="SET NULL"), nullable=True))
    op.add_column("matches", sa.Column("source_pool_b_rank", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("matches", "source_pool_b_rank")
    op.drop_column("matches", "source_pool_b_id")
    op.drop_column("matches", "source_pool_a_rank")
    op.drop_column("matches", "source_pool_a_id")
