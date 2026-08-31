"""tasks: category (list) and optional staff assignee

The shared staff task board (routers/tasks.py) groups tasks into free-text
"lists" (category) and optionally assigns one to a specific staff member —
assigned_staff_id is SET NULL (not CASCADE) so deleting a staff member never
deletes their tasks, just unassigns them back to the general board.

Revision ID: b6f2c8a4d9e1
Revises: a3d7e1c9f5b2
Create Date: 2026-09-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "b6f2c8a4d9e1"
down_revision = "a3d7e1c9f5b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("category", sa.String(length=80), nullable=False, server_default="General"))
    op.add_column("tasks", sa.Column("assigned_staff_id", sa.Integer(), sa.ForeignKey("staff_members.id", ondelete="SET NULL"), nullable=True))
    op.alter_column("tasks", "category", server_default=None)


def downgrade() -> None:
    op.drop_column("tasks", "assigned_staff_id")
    op.drop_column("tasks", "category")
