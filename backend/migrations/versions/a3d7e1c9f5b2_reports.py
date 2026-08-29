"""reports: persisted per-round match reports

A "Generate Report" action snapshots a round's data into file_data right now,
rather than being a live/recomputed download. round_id is SET NULL (not
CASCADE) if the round is later deleted, specifically so the report survives
that; round_name/round_sequence/format are captured at generation time so
the report stays meaningful once round_id goes NULL — round_id IS NULL is
itself the whole "belongs to a deleted round" signal.

Revision ID: a3d7e1c9f5b2
Revises: f4a9d2c7e6b1
Create Date: 2026-08-30 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a3d7e1c9f5b2"
down_revision = "f4a9d2c7e6b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tournament_id", sa.Integer(), sa.ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("round_id", sa.Integer(), sa.ForeignKey("rounds.id", ondelete="SET NULL"), nullable=True),
        sa.Column("round_name", sa.String(length=120), nullable=False),
        sa.Column("round_sequence", sa.Integer(), nullable=False),
        sa.Column("format", sa.String(length=20), nullable=False),
        sa.Column("file_data", sa.LargeBinary(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("reports")
