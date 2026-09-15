"""staff shift blocks, staff shifts assignments, and shift links for duties and tasks

Adds shift_blocks: common workforce shift windows (Morning Shift, Evening Shift).
Adds staff_shifts: many-to-one assignment of StaffMembers to ShiftBlocks.
Adds nullable shift_id FK on duty_assignments and tasks (pointing to staff_shifts.id with ON DELETE SET NULL).

Revision ID: c7f1a8e3d5b9
Revises: b4d7e2c9a3f6
Create Date: 2026-09-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c7f1a8e3d5b9"
down_revision = "b4d7e2c9a3f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create shift_blocks table
    op.create_table(
        "shift_blocks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=40), server_default="SCHEDULED", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_shift_blocks_start_time", "shift_blocks", ["start_time"])
    op.create_index("ix_shift_blocks_end_time", "shift_blocks", ["end_time"])

    # 2. Create staff_shifts table (assignment of staff to shift block)
    op.create_table(
        "staff_shifts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("shift_block_id", sa.Integer(), nullable=False),
        sa.Column("staff_id", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["shift_block_id"], ["shift_blocks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["staff_id"], ["staff_members.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shift_block_id", "staff_id", name="uq_shift_block_staff"),
    )
    op.create_index("ix_staff_shifts_shift_block_id", "staff_shifts", ["shift_block_id"])
    op.create_index("ix_staff_shifts_staff_id", "staff_shifts", ["staff_id"])

    # 3. Add nullable shift_id to duty_assignments
    op.add_column("duty_assignments", sa.Column("shift_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_duty_assignments_shift_id",
        "duty_assignments",
        "staff_shifts",
        ["shift_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_duty_assignments_shift_id", "duty_assignments", ["shift_id"])

    # 4. Add nullable shift_id to tasks
    op.add_column("tasks", sa.Column("shift_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_tasks_shift_id",
        "tasks",
        "staff_shifts",
        ["shift_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_tasks_shift_id", "tasks", ["shift_id"])


def downgrade() -> None:
    # 1. Remove shift_id from tasks
    op.drop_index("ix_tasks_shift_id", table_name="tasks")
    op.drop_constraint("fk_tasks_shift_id", "tasks", type_="foreignkey")
    op.drop_column("tasks", "shift_id")

    # 2. Remove shift_id from duty_assignments
    op.drop_index("ix_duty_assignments_shift_id", table_name="duty_assignments")
    op.drop_constraint("fk_duty_assignments_shift_id", "duty_assignments", type_="foreignkey")
    op.drop_column("duty_assignments", "shift_id")

    # 3. Drop staff_shifts table
    op.drop_index("ix_staff_shifts_staff_id", table_name="staff_shifts")
    op.drop_index("ix_staff_shifts_shift_block_id", table_name="staff_shifts")
    op.drop_table("staff_shifts")

    # 4. Drop shift_blocks table
    op.drop_index("ix_shift_blocks_end_time", table_name="shift_blocks")
    op.drop_index("ix_shift_blocks_start_time", table_name="shift_blocks")
    op.drop_table("shift_blocks")
