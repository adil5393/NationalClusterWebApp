"""staff locations

Adds staff_locations: one row per OrganizerUser holding their last reported
approximate location for the organizer-only Staff Live Map (see
routers/staff_locations.py, models.StaffLocation). user_id is the primary
key (one-to-one with organizer_users, no location history kept) —
`updated_at` (server_default now(), onupdate now()) doubles as the
"last seen" timestamp, so no separate column is needed for that.

Purely additive: a new table, no existing table is touched.

Revision ID: d4e9f7b3c8a2
Revises: c3d8e5a2f1b7
Create Date: 2026-09-13 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "d4e9f7b3c8a2"
down_revision = "c3d8e5a2f1b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staff_locations",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("accuracy", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["organizer_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("staff_locations")
