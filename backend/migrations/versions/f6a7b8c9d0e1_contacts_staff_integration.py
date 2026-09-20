"""contacts staff integration

Adds `contact_groups`, `contact_group_staff`, and `external_contacts` tables,
linking contacts with operational categories, operational areas, and staff members,
with support for active shift incharges and designated group leads.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-09-20 17:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None

DEFAULT_CONTACT_GROUPS = [
    {
        "title": "Emergency Medical & First Aid",
        "description": "24/7 campus clinic, emergency ambulances, and nearby hospital coordination.",
        "icon": "Shield",
        "category_key": "medical",
        "area_code": "MEDICAL",
        "display_order": 1,
        "is_public": True,
        "show_shift_incharges": True,
    },
    {
        "title": "Transport & Transit Logistics",
        "description": "Railway station team pickups, intra-campus shuttles, and driver fleet dispatchers.",
        "icon": "Bus",
        "category_key": "transport",
        "area_code": "TRANSPORT",
        "display_order": 2,
        "is_public": True,
        "show_shift_incharges": True,
    },
    {
        "title": "Hostel & Accommodation Wardens",
        "description": "Hostel room allotment, bedding supplies, warden desks, and curfew compliance.",
        "icon": "BedDouble",
        "category_key": "accommodation",
        "area_code": "ACCOMMODATION",
        "display_order": 3,
        "is_public": True,
        "show_shift_incharges": True,
    },
    {
        "title": "Match Control & Technical Desk",
        "description": "Referee panel coordination, scoring table, and jury of appeal.",
        "icon": "Radio",
        "category_key": "match_control",
        "area_code": "GROUND_MATCH",
        "display_order": 4,
        "is_public": True,
        "show_shift_incharges": True,
    },
    {
        "title": "Registration & Accreditation",
        "description": "Eligibility verification, photo ID cards, weigh-ins, and team confirmation.",
        "icon": "FileCheck",
        "category_key": "registration",
        "area_code": "REGISTRATION",
        "display_order": 5,
        "is_public": True,
        "show_shift_incharges": True,
    },
    {
        "title": "Security & Campus Control Room",
        "description": "Campus gate access, lost & found, and emergency security dispatch.",
        "icon": "Lock",
        "category_key": "security",
        "area_code": "SECURITY",
        "display_order": 6,
        "is_public": True,
        "show_shift_incharges": True,
    },
    {
        "title": "Organizing Committee & Helpdesk",
        "description": "General tournament enquiries, delegation support, and administration.",
        "icon": "Users",
        "category_key": "administration",
        "area_code": None,
        "display_order": 7,
        "is_public": True,
        "show_shift_incharges": False,
    },
]


def upgrade() -> None:
    # 1. Create contact_groups
    op.create_table(
        "contact_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(length=60), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "operational_category_id",
            sa.Integer(),
            sa.ForeignKey("operational_categories.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "operational_area_id",
            sa.Integer(),
            sa.ForeignKey("operational_areas.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column(
            "lead_staff_id",
            sa.Integer(),
            sa.ForeignKey("staff_members.id", ondelete="SET NULL"),
            nullable=True,
            index=True,
        ),
        sa.Column("show_shift_incharges", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 2. Create contact_group_staff
    op.create_table(
        "contact_group_staff",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "contact_group_id",
            sa.Integer(),
            sa.ForeignKey("contact_groups.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "staff_id",
            sa.Integer(),
            sa.ForeignKey("staff_members.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("custom_role_override", sa.String(length=100), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("contact_group_id", "staff_id", name="uq_contact_group_staff"),
    )

    # 3. Create external_contacts
    op.create_table(
        "external_contacts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "contact_group_id",
            sa.Integer(),
            sa.ForeignKey("contact_groups.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("role_label", sa.String(length=100), nullable=False),
        sa.Column("phone", sa.String(length=60), nullable=False),
        sa.Column("email", sa.String(length=200), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 4. Seed initial contact groups linked to operational categories & areas
    conn = op.get_bind()
    for g in DEFAULT_CONTACT_GROUPS:
        cat_id = None
        if g["category_key"]:
            cat_row = conn.execute(
                sa.text("SELECT id FROM operational_categories WHERE key = :k LIMIT 1"),
                {"k": g["category_key"]},
            ).fetchone()
            if cat_row:
                cat_id = cat_row[0]

        area_id = None
        if g["area_code"]:
            area_row = conn.execute(
                sa.text("SELECT id FROM operational_areas WHERE code = :c LIMIT 1"),
                {"c": g["area_code"]},
            ).fetchone()
            if area_row:
                area_id = area_row[0]

        conn.execute(
            sa.text(
                """
                INSERT INTO contact_groups (
                    title, description, icon, display_order, is_active, is_public,
                    operational_category_id, operational_area_id, show_shift_incharges,
                    created_at, updated_at
                )
                VALUES (
                    :title, :desc, :icon, :order, true, :is_public,
                    :cat_id, :area_id, :show_inch,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                """
            ),
            {
                "title": g["title"],
                "desc": g["description"],
                "icon": g["icon"],
                "order": g["display_order"],
                "is_public": g["is_public"],
                "cat_id": cat_id,
                "area_id": area_id,
                "show_inch": g["show_shift_incharges"],
            },
        )


def downgrade() -> None:
    op.drop_table("external_contacts")
    op.drop_table("contact_group_staff")
    op.drop_table("contact_groups")
