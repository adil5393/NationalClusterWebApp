"""Team Index Number (per tournament) + manual Match index, with a per-tournament lock

Revision ID: k4f8a6b3c7d1
Revises: j3e7f5a2b6c0
Create Date: 2026-09-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "k4f8a6b3c7d1"
down_revision = "j3e7f5a2b6c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tournaments",
        sa.Column("indices_locked", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column("matches", sa.Column("match_index", sa.String(length=20), nullable=True))
    op.create_table(
        "team_indices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tournament_id", sa.Integer(), sa.ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("index_number", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("tournament_id", "team_id", name="uq_team_index"),
    )


def downgrade() -> None:
    op.drop_table("team_indices")
    op.drop_column("matches", "match_index")
    op.drop_column("tournaments", "indices_locked")
