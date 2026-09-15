"""event_location physical source links

Adds three nullable link columns to event_locations so a row can either stay
a genuine standalone operational station (Main Gate, Medical Desk — the
existing behavior, unchanged) or become a thin, reusable wrapper around an
existing authoritative physical record: a Mat (match/ground registry), a
Building, or a Room (accommodation hierarchy) — see models.EventLocation's
docstring and routers/event_locations.py's resolve_event_location_for_source
for how these wrapper rows get created (never manually by an organizer, only
resolved-or-reused the first time a Staff Duty is assigned to that physical
place).

DutyAssignment is NOT changed — it keeps storing only location_id ->
EventLocation.id, exactly as before. Existing standalone EventLocation rows
and existing duties are untouched and remain fully valid.

Safety, enforced here rather than only in application code:
- ck_event_location_single_source: at most one of mat_id/building_id/room_id
  may be set on any one row (never two at once).
- Three partial unique indexes: a given Mat/Building/Room can back at most
  one EventLocation row — no duplicate wrappers.
- FKs use ON DELETE RESTRICT: deleting a linked Mat/Building/Room while an
  EventLocation still wraps it is refused at the database level too (the
  primary guard is the new 409 checks added to routers/mats.py,
  routers/venues.py and routers/structure.py in this same change).

No backfill: this migration deliberately does NOT auto-link any existing
EventLocation row to a Mat/Building/Room just because the names look similar
— a matching name does not prove identity. It only reports likely candidates
(via a NOTICE-style print during upgrade) for an organizer to review and link
manually later through the app, if ever.

Revision ID: b8d4f2a9c6e1
Revises: a5c9e2f7d1b4
Create Date: 2026-09-15 15:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b8d4f2a9c6e1"
down_revision: Union[str, None] = "a5c9e2f7d1b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("event_locations", schema=None) as batch_op:
        batch_op.add_column(sa.Column("mat_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("building_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("room_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_event_locations_mat_id_mats", "mats", ["mat_id"], ["id"], ondelete="RESTRICT"
        )
        batch_op.create_foreign_key(
            "fk_event_locations_building_id_buildings", "buildings", ["building_id"], ["id"], ondelete="RESTRICT"
        )
        batch_op.create_foreign_key(
            "fk_event_locations_room_id_rooms", "rooms", ["room_id"], ["id"], ondelete="RESTRICT"
        )
        batch_op.create_index(batch_op.f("ix_event_locations_mat_id"), ["mat_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_event_locations_building_id"), ["building_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_event_locations_room_id"), ["room_id"], unique=False)
        batch_op.create_check_constraint(
            "ck_event_location_single_source",
            "(CASE WHEN mat_id IS NOT NULL THEN 1 ELSE 0 END) "
            "+ (CASE WHEN building_id IS NOT NULL THEN 1 ELSE 0 END) "
            "+ (CASE WHEN room_id IS NOT NULL THEN 1 ELSE 0 END) <= 1",
        )

    # Partial unique indexes (one wrapper per physical record, at most) —
    # created outside batch mode: straightforward op.create_index with a
    # postgresql_where predicate.
    op.create_index(
        "uq_event_locations_mat_id", "event_locations", ["mat_id"], unique=True,
        postgresql_where=sa.text("mat_id IS NOT NULL"),
    )
    op.create_index(
        "uq_event_locations_building_id", "event_locations", ["building_id"], unique=True,
        postgresql_where=sa.text("building_id IS NOT NULL"),
    )
    op.create_index(
        "uq_event_locations_room_id", "event_locations", ["room_id"], unique=True,
        postgresql_where=sa.text("room_id IS NOT NULL"),
    )

    # Report-only: surface likely (name-matched) candidates for an organizer
    # to review and link manually later. Never auto-linked — a shared name
    # does not prove the rows refer to the same physical place.
    connection = op.get_bind()
    dupes = connection.execute(
        sa.text(
            """
            SELECT el.id, el.name, 'mat' AS source, m.id AS source_id, m.name AS source_name
            FROM event_locations el JOIN mats m ON lower(trim(el.name)) = lower(trim(m.name))
            UNION ALL
            SELECT el.id, el.name, 'building' AS source, b.id AS source_id, b.name AS source_name
            FROM event_locations el JOIN buildings b ON lower(trim(el.name)) = lower(trim(b.name))
            UNION ALL
            SELECT el.id, el.name, 'room' AS source, r.id AS source_id, r.name AS source_name
            FROM event_locations el JOIN rooms r ON lower(trim(el.name)) = lower(trim(r.name))
            """
        )
    ).fetchall()
    for row in dupes:
        print(
            f"[b8d4f2a9c6e1] Possible duplicate: EventLocation #{row[0]} '{row[1]}' shares a name with "
            f"{row[2]} #{row[3]} '{row[4]}' — review manually; not auto-linked."
        )


def downgrade() -> None:
    op.drop_index("uq_event_locations_room_id", table_name="event_locations")
    op.drop_index("uq_event_locations_building_id", table_name="event_locations")
    op.drop_index("uq_event_locations_mat_id", table_name="event_locations")

    with op.batch_alter_table("event_locations", schema=None) as batch_op:
        batch_op.drop_constraint("ck_event_location_single_source", type_="check")
        batch_op.drop_index(batch_op.f("ix_event_locations_room_id"))
        batch_op.drop_index(batch_op.f("ix_event_locations_building_id"))
        batch_op.drop_index(batch_op.f("ix_event_locations_mat_id"))
        batch_op.drop_constraint("fk_event_locations_room_id_rooms", type_="foreignkey")
        batch_op.drop_constraint("fk_event_locations_building_id_buildings", type_="foreignkey")
        batch_op.drop_constraint("fk_event_locations_mat_id_mats", type_="foreignkey")
        batch_op.drop_column("room_id")
        batch_op.drop_column("building_id")
        batch_op.drop_column("mat_id")
