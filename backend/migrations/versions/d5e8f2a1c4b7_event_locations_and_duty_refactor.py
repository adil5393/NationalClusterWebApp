"""event_locations and duty_assignments location refactor

Revision ID: d5e8f2a1c4b7
Revises: c7f1a8e3d5b9
Create Date: 2026-09-15 10:25:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d5e8f2a1c4b7"
down_revision: Union[str, None] = "c7f1a8e3d5b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create event_locations table
    op.create_table(
        "event_locations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("location_type", sa.String(length=40), nullable=False, server_default="OTHER"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_event_locations_name"),
    )
    op.create_index(op.f("ix_event_locations_name"), "event_locations", ["name"], unique=True)
    op.create_index(op.f("ix_event_locations_is_active"), "event_locations", ["is_active"], unique=False)

    # 2. Refactor duty_assignments: room_id becomes nullable, add location_id FK
    with op.batch_alter_table("duty_assignments", schema=None) as batch_op:
        batch_op.alter_column("room_id", existing_type=sa.Integer(), nullable=True)
        batch_op.add_column(sa.Column("location_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_duty_assignments_location_id_event_locations",
            "event_locations",
            ["location_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(batch_op.f("ix_duty_assignments_location_id"), ["location_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("duty_assignments", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_duty_assignments_location_id"))
        batch_op.drop_constraint("fk_duty_assignments_location_id_event_locations", type_="foreignkey")
        batch_op.drop_column("location_id")
        batch_op.alter_column("room_id", existing_type=sa.Integer(), nullable=False)

    op.drop_index(op.f("ix_event_locations_is_active"), table_name="event_locations")
    op.drop_index(op.f("ix_event_locations_name"), table_name="event_locations")
    op.drop_table("event_locations")
