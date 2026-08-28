"""buckets: track pulled/pushed state per team instead of closing the whole bucket

A bucket used to become permanently "consumed" the moment any round was built
from it (buckets.round_id set), forcing a brand new bucket for any later pull
from the same source round — so pool A/B's winners advancing early and pool
C/D's arriving later ended up as two disconnected next-rounds instead of one
combined bracket. Now a bucket stays open for its source round's whole life;
each entry tracks its own pulled/pushed state via bucket_teams.pushed_round_id
(NULL = pulled, waiting; set = already placed into that round). Byes for a
create-round call are sized off only the currently-pulled entries.

Revision ID: d1e4f8a2c9b7
Revises: c3e9f1a6d4b7
Create Date: 2026-08-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "d1e4f8a2c9b7"
down_revision = "c3e9f1a6d4b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bucket_teams",
        sa.Column("pushed_round_id", sa.Integer(), sa.ForeignKey("rounds.id", ondelete="SET NULL"), nullable=True),
    )
    # Any bucket already fully consumed under the old model: its round is
    # rounds.id == buckets.round_id — carry that over as every entry's pushed
    # round, so existing data reads correctly under the new pulled/pushed logic.
    op.execute(
        """
        UPDATE bucket_teams bt
        SET pushed_round_id = b.round_id
        FROM buckets b
        WHERE bt.bucket_id = b.id AND b.round_id IS NOT NULL
        """
    )
    op.drop_column("buckets", "round_id")


def downgrade() -> None:
    op.add_column("buckets", sa.Column("round_id", sa.Integer(), sa.ForeignKey("rounds.id", ondelete="SET NULL"), nullable=True))
    op.execute(
        """
        UPDATE buckets b
        SET round_id = sub.pushed_round_id
        FROM (
            SELECT DISTINCT ON (bucket_id) bucket_id, pushed_round_id
            FROM bucket_teams
            WHERE pushed_round_id IS NOT NULL
        ) sub
        WHERE b.id = sub.bucket_id
        """
    )
    op.drop_column("bucket_teams", "pushed_round_id")
