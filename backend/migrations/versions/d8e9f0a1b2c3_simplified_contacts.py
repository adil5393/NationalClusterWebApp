"""simplified contacts architecture

Simplifies the Contacts model into clean topic entries with Primary and Backup
contacts (staff-linked or external), with optional current shift incharge fallback.

Revision ID: d8e9f0a1b2c3
Revises: f6a7b8c9d0e1
Create Date: 2026-09-20 22:15:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision: str = "d8e9f0a1b2c3"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("contact_groups", schema=None) as batch_op:
        batch_op.add_column(sa.Column("category_name", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("use_shift_incharge", sa.Boolean(), nullable=False, server_default=sa.text("false")))
        batch_op.add_column(sa.Column("primary_type", sa.String(length=20), nullable=True, server_default=sa.text("'staff'")))
        batch_op.add_column(sa.Column("primary_staff_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("primary_name", sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column("primary_phone", sa.String(length=60), nullable=True))
        batch_op.add_column(sa.Column("primary_email", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("primary_role", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("secondary_type", sa.String(length=20), nullable=True, server_default=sa.text("'none'")))
        batch_op.add_column(sa.Column("secondary_staff_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("secondary_name", sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column("secondary_phone", sa.String(length=60), nullable=True))
        batch_op.add_column(sa.Column("secondary_email", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("secondary_role", sa.String(length=120), nullable=True))

        batch_op.create_foreign_key(
            "fk_contact_groups_primary_staff_id", "staff_members", ["primary_staff_id"], ["id"], ondelete="SET NULL"
        )
        batch_op.create_foreign_key(
            "fk_contact_groups_secondary_staff_id", "staff_members", ["secondary_staff_id"], ["id"], ondelete="SET NULL"
        )

    # Backfill existing groups: primary_staff_id from lead_staff_id, use_shift_incharge from show_shift_incharges
    conn = op.get_bind()
    conn.execute(
        text(
            "UPDATE contact_groups SET "
            "primary_type = CASE WHEN lead_staff_id IS NOT NULL THEN 'staff' ELSE 'none' END, "
            "primary_staff_id = lead_staff_id, "
            "secondary_type = 'none', "
            "use_shift_incharge = COALESCE(show_shift_incharges, false)"
        )
    )


def downgrade() -> None:
    with op.batch_alter_table("contact_groups", schema=None) as batch_op:
        batch_op.drop_constraint("fk_contact_groups_secondary_staff_id", type_="foreignkey")
        batch_op.drop_constraint("fk_contact_groups_primary_staff_id", type_="foreignkey")
        batch_op.drop_column("secondary_role")
        batch_op.drop_column("secondary_email")
        batch_op.drop_column("secondary_phone")
        batch_op.drop_column("secondary_name")
        batch_op.drop_column("secondary_staff_id")
        batch_op.drop_column("secondary_type")
        batch_op.drop_column("primary_role")
        batch_op.drop_column("primary_email")
        batch_op.drop_column("primary_phone")
        batch_op.drop_column("primary_name")
        batch_op.drop_column("primary_staff_id")
        batch_op.drop_column("primary_type")
        batch_op.drop_column("use_shift_incharge")
        batch_op.drop_column("category_name")
