"""operational categories

Adds `operational_categories` table, `staff_member_categories` join table,
adds `designation` to `staff_members`, seeds standard operational categories,
and migrates existing staff category assignments.

Revision ID: e5f6a7b8c9d0
Revises: c3d4e5f6a7b9
Create Date: 2026-09-20 16:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e5f6a7b8c9d0"
down_revision = "c3d4e5f6a7b9"
branch_labels = None
depends_on = None

INITIAL_CATEGORIES = [
    {
        "name": "Accommodation",
        "key": "accommodation",
        "description": "Hostels, room allotment, bedding and amenities",
        "icon": "BedDouble",
        "display_order": 1,
    },
    {
        "name": "Transport",
        "key": "transport",
        "description": "Station pickups, team shuttles, vehicle dispatch",
        "icon": "Bus",
        "display_order": 2,
    },
    {
        "name": "Medical & First Aid",
        "key": "medical",
        "description": "Campus clinic, emergency response, physiotherapy",
        "icon": "Activity",
        "display_order": 3,
    },
    {
        "name": "Match Control",
        "key": "match_control",
        "description": "Table officials, scoring, timing and technical governance",
        "icon": "Radio",
        "display_order": 4,
    },
    {
        "name": "Food & Dining",
        "key": "food",
        "description": "Delegation meals, dining hall coordination, refreshments",
        "icon": "Utensils",
        "display_order": 5,
    },
    {
        "name": "Registration & Accreditation",
        "key": "registration",
        "description": "Team verification, ID badging, entry desk",
        "icon": "FileCheck",
        "display_order": 6,
    },
    {
        "name": "Security & Safety",
        "key": "security",
        "description": "Main gate access, crowd control, campus surveillance",
        "icon": "Shield",
        "display_order": 7,
    },
    {
        "name": "Administration",
        "key": "administration",
        "description": "Accounts, general operations, administrative coordination",
        "icon": "Building",
        "display_order": 8,
    },
    {
        "name": "Support & Housekeeping",
        "key": "housekeeping",
        "description": "Sanitation, cleaning, campus maintenance and logistics",
        "icon": "HardHat",
        "display_order": 9,
    },
]


def upgrade() -> None:
    # 1. Create operational_categories table
    op.create_table(
        "operational_categories",
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("key", sa.String(length=80), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(length=60), nullable=True),
        sa.Column("display_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.UniqueConstraint("name", name="uq_operational_categories_name"),
        sa.UniqueConstraint("key", name="uq_operational_categories_key"),
    )
    op.create_index("ix_operational_categories_key", "operational_categories", ["key"])

    # 2. Create staff_member_categories join table
    op.create_table(
        "staff_member_categories",
        sa.Column("staff_member_id", sa.Integer(), sa.ForeignKey("staff_members.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("operational_categories.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_staff_member_categories_staff_id", "staff_member_categories", ["staff_member_id"])
    op.create_index("ix_staff_member_categories_category_id", "staff_member_categories", ["category_id"])

    # 3. Add designation column to staff_members
    op.add_column("staff_members", sa.Column("designation", sa.String(length=120), nullable=True))

    # 4. Seed initial operational categories and migrate existing staff categories
    bind = op.get_bind()
    op_cat_table = sa.table(
        "operational_categories",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("key", sa.String),
        sa.column("description", sa.Text),
        sa.column("icon", sa.String),
        sa.column("display_order", sa.Integer),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(op_cat_table, INITIAL_CATEGORIES)

    # Fetch inserted categories map
    cats = bind.execute(sa.text("SELECT id, name, key FROM operational_categories")).fetchall()
    cat_by_key = {row.key: row.id for row in cats}
    cat_by_name = {row.name.lower(): row.id for row in cats}

    # Map existing staff category values
    staff_rows = bind.execute(sa.text("SELECT id, category FROM staff_members WHERE category IS NOT NULL")).fetchall()
    links = []
    for staff_id, old_cat in staff_rows:
        if not old_cat:
            continue
        clean = old_cat.strip()
        matched_cat_id = None
        desig = clean

        if clean.lower() == "transport":
            matched_cat_id = cat_by_key.get("transport")
        elif clean.lower() in ("academic & administrative", "administration"):
            matched_cat_id = cat_by_key.get("administration")
        elif clean.lower() in ("support & housekeeping", "housekeeping"):
            matched_cat_id = cat_by_key.get("housekeeping")
        elif clean.lower() in ("game manager", "match control"):
            matched_cat_id = cat_by_key.get("match_control")
        elif clean.lower() == "medical":
            matched_cat_id = cat_by_key.get("medical")
        elif clean.lower() == "security":
            matched_cat_id = cat_by_key.get("security")
        elif clean.lower() == "accommodation":
            matched_cat_id = cat_by_key.get("accommodation")
        elif clean.lower() == "food":
            matched_cat_id = cat_by_key.get("food")
        elif clean.lower() in cat_by_name:
            matched_cat_id = cat_by_name[clean.lower()]

        # Update designation
        bind.execute(
            sa.text("UPDATE staff_members SET designation = :desig WHERE id = :sid"),
            {"desig": desig, "sid": staff_id},
        )

        if matched_cat_id:
            links.append({"staff_member_id": staff_id, "category_id": matched_cat_id})

    if links:
        link_table = sa.table(
            "staff_member_categories",
            sa.column("staff_member_id", sa.Integer),
            sa.column("category_id", sa.Integer),
        )
        op.bulk_insert(link_table, links)


def downgrade() -> None:
    op.drop_column("staff_members", "designation")
    op.drop_table("staff_member_categories")
    op.drop_table("operational_categories")
