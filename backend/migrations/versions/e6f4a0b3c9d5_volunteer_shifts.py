"""Adds volunteer_shifts + volunteer_shift_assignments — volunteer duty slots,
separate from the staff shift system (see models.VolunteerShift).

Revision ID: e6f4a0b3c9d5
Revises: d5e3f9a2b8c4
Create Date: 2026-09-27 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e6f4a0b3c9d5"
down_revision = "d5e3f9a2b8c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "volunteer_shifts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("location", sa.String(length=160), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_volunteer_shifts_start_time", "volunteer_shifts", ["start_time"])
    op.create_table(
        "volunteer_shift_assignments",
        sa.Column("shift_id", sa.Integer(), sa.ForeignKey("volunteer_shifts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("volunteer_id", sa.Integer(), sa.ForeignKey("volunteers.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("volunteer_shift_assignments")
    op.drop_index("ix_volunteer_shifts_start_time", table_name="volunteer_shifts")
    op.drop_table("volunteer_shifts")
