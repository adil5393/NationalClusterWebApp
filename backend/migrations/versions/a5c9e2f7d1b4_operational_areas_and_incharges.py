"""operational areas and shift-wise in-charges

Adds OperationalArea as the stable reporting/team classification duties can
be grouped under (WHO leads it), separate from DutyAssignment.duty_type
(WHAT specific task, free text) — see the Staff Operations in-charge audit:
duty_type carries documented legacy aliases (Food/Fooding,
Accommodation/Lodging, Reception/Team Reception, Electricity/Technical) and
has no server-side validation, so it isn't safe to key reporting off of it
directly.

- operational_areas: a small seeded lookup table (10 initial rows), same
  shape/conventions as event_locations.
- duty_assignments.operational_area_id: nullable FK. Every existing duty
  keeps working completely unmodified; NULL means "not yet classified" and
  stays that way for any duty_type this migration doesn't recognize.
- Deterministic backfill: only the duty_type values already in
  schemas.DUTY_TYPES (current values *and* the documented legacy aliases)
  are mapped to their area, by exact case-insensitive string match against
  the duty_type values actually present in the table. Anything else —
  custom/unknown organizer-entered text — is left NULL rather than guessed,
  and is never defaulted to General Operations.
- shift_operational_incharges: WHO leads WHICH area for ONE ShiftBlock.
  Keyed to shift_block_id, NOT staff_shifts.id — DutyAssignment.shift_id
  points at a StaffShift row (a different id space); see
  app/models.py's ShiftOperationalIncharge docstring for why a duty's
  in-charges are only ever resolved via
  DutyAssignment.shift_id -> StaffShift.shift_block_id -> this table.

No destructive changes: nothing is dropped, renamed, or rewritten on
duty_assignments other than adding this one nullable column.

Revision ID: a5c9e2f7d1b4
Revises: d5e8f2a1c4b7
Create Date: 2026-09-15 13:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a5c9e2f7d1b4"
down_revision: Union[str, None] = "d5e8f2a1c4b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (code, name, sort_order) — seed rows only; the operational_areas table
# itself is the runtime source of truth from here on (organizers can add/
# rename/deactivate rows via the CRUD API, same as EventLocation).
AREAS = [
    ("GROUND_MATCH", "Ground / Match Operations", 10),
    ("FOOD", "Food", 20),
    ("ACCOMMODATION", "Accommodation", 30),
    ("TRANSPORT", "Transport", 40),
    ("RECEPTION", "Reception", 50),
    ("SECURITY", "Security", 60),
    ("MEDICAL", "Medical", 70),
    ("CLEANING", "Cleaning", 80),
    ("TECHNICAL", "Technical", 90),
    ("GENERAL_OPERATIONS", "General Operations", 100),
]

# Deterministic backfill: exact (case-insensitive) duty_type -> area code.
# Covers today's schemas.DUTY_TYPES only, aliases included. Anything else is
# intentionally left unmapped (operational_area_id stays NULL).
DUTY_TYPE_TO_AREA_CODE = {
    "ground coordination": "GROUND_MATCH",
    "match control": "GROUND_MATCH",
    "food": "FOOD",
    "fooding": "FOOD",
    "accommodation": "ACCOMMODATION",
    "lodging": "ACCOMMODATION",
    "transport": "TRANSPORT",
    "team reception": "RECEPTION",
    "reception": "RECEPTION",
    "security": "SECURITY",
    "medical": "MEDICAL",
    "cleaning": "CLEANING",
    "technical / electricity": "TECHNICAL",
    "electricity": "TECHNICAL",
    "general operations": "GENERAL_OPERATIONS",
}


def upgrade() -> None:
    op.create_table(
        "operational_areas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_operational_areas_code"),
        sa.UniqueConstraint("name", name="uq_operational_areas_name"),
    )

    areas_table = sa.table(
        "operational_areas",
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("sort_order", sa.Integer),
    )
    op.bulk_insert(
        areas_table,
        [{"code": code, "name": name, "sort_order": order} for code, name, order in AREAS],
    )

    with op.batch_alter_table("duty_assignments", schema=None) as batch_op:
        batch_op.add_column(sa.Column("operational_area_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_duty_assignments_operational_area_id_operational_areas",
            "operational_areas",
            ["operational_area_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            batch_op.f("ix_duty_assignments_operational_area_id"), ["operational_area_id"], unique=False
        )

    # Deterministic, data-driven backfill — only touches duty_type values
    # that actually exist and are recognized; never guesses.
    connection = op.get_bind()
    area_id_by_code = {
        code: area_id
        for area_id, code in connection.execute(sa.text("SELECT id, code FROM operational_areas")).fetchall()
    }
    existing_duty_types = connection.execute(
        sa.text("SELECT DISTINCT duty_type FROM duty_assignments WHERE duty_type IS NOT NULL")
    ).fetchall()
    for (duty_type,) in existing_duty_types:
        area_code = DUTY_TYPE_TO_AREA_CODE.get(duty_type.strip().lower())
        area_id = area_id_by_code.get(area_code) if area_code else None
        if not area_id:
            continue
        connection.execute(
            sa.text(
                "UPDATE duty_assignments SET operational_area_id = :area_id "
                "WHERE duty_type = :duty_type AND operational_area_id IS NULL"
            ),
            {"area_id": area_id, "duty_type": duty_type},
        )

    op.create_table(
        "shift_operational_incharges",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("shift_block_id", sa.Integer(), nullable=False),
        sa.Column("operational_area_id", sa.Integer(), nullable=False),
        sa.Column("staff_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["shift_block_id"], ["shift_blocks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["operational_area_id"], ["operational_areas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["staff_id"], ["staff_members.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shift_block_id", "operational_area_id", "staff_id", name="uq_shift_area_incharge"),
    )
    op.create_index(
        op.f("ix_shift_operational_incharges_shift_block_id"),
        "shift_operational_incharges", ["shift_block_id"], unique=False,
    )
    op.create_index(
        op.f("ix_shift_operational_incharges_operational_area_id"),
        "shift_operational_incharges", ["operational_area_id"], unique=False,
    )
    op.create_index(
        op.f("ix_shift_operational_incharges_staff_id"),
        "shift_operational_incharges", ["staff_id"], unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_shift_operational_incharges_staff_id"), table_name="shift_operational_incharges")
    op.drop_index(op.f("ix_shift_operational_incharges_operational_area_id"), table_name="shift_operational_incharges")
    op.drop_index(op.f("ix_shift_operational_incharges_shift_block_id"), table_name="shift_operational_incharges")
    op.drop_table("shift_operational_incharges")

    with op.batch_alter_table("duty_assignments", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_duty_assignments_operational_area_id"))
        batch_op.drop_constraint("fk_duty_assignments_operational_area_id_operational_areas", type_="foreignkey")
        batch_op.drop_column("operational_area_id")

    op.drop_table("operational_areas")
