"""mats registry + matches.mat_id

Organizer-managed registry of mats/grounds ("Mat 1", "Mat 2", "Ground A", ...),
created and deleted from the new Mat / Ground admin page, then assigned to a
match via a dropdown (routers/matches.py PUT /api/matches/{id}/mat — unlike the
existing generic update_match endpoint, works regardless of match status, since
assigning a mat to an already-ONGOING match is the primary use case).

Revision ID: c3a8e5f1d7b2
Revises: b7f2c9d4a1e6
Create Date: 2026-09-03 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c3a8e5f1d7b2"
down_revision = "b7f2c9d4a1e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mats",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.UniqueConstraint("name", name="uq_mats_name"),
    )
    op.add_column(
        "matches",
        sa.Column("mat_id", sa.Integer(), sa.ForeignKey("mats.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("matches", "mat_id")
    op.drop_table("mats")
