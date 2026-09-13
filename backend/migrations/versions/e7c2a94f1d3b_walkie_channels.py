"""walkie channels

Adds the Walkie-Talkie PTT feature's only persisted state: the channel
catalog (walkie_channels) and an explicit transmit-permission allow-list for
"All Staff" (walkie_channel_transmit_permissions). Seeds the 7 required
system channels as data in this same migration so a fresh database is
immediately correct with no manual setup.

Deliberately NOT persisted anywhere: who is currently speaking, floor
ownership, or channel presence — all of that is live, seconds-scale,
single-worker in-memory state (see app/walkie_state.py), the same "no
Redis/DB needed" reasoning already used for app/ws.py's match-live hub. No
audio, and no history of who spoke when, is ever stored.

Revision ID: e7c2a94f1d3b
Revises: c3d8e5a2f1b7
Create Date: 2026-09-13 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e7c2a94f1d3b"
down_revision = "c3d8e5a2f1b7"
branch_labels = None
depends_on = None

SYSTEM_CHANNELS = [
    # (key, name, icon, transmit_restricted)
    ("all_staff", "All Staff", "📢", True),
    ("match_control", "Ground / Match Control", "🏟", False),
    ("transport", "Transport", "🚌", False),
    ("accommodation", "Accommodation", "🏨", False),
    ("food", "Food", "🍱", False),
    ("medical", "Medical", "🚑", False),
    ("security", "Security", "🔐", False),
]


def upgrade() -> None:
    op.create_table(
        "walkie_channels",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("icon", sa.String(length=8), nullable=True),
        sa.Column("kind", sa.String(length=10), nullable=False, server_default="SYSTEM"),
        sa.Column("staff_category", sa.String(length=80), nullable=True),
        sa.Column("transmit_restricted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("key", name="uq_walkie_channels_key"),
    )

    op.create_table(
        "walkie_channel_transmit_permissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("channel_id", sa.Integer(), nullable=False),
        sa.Column("organizer_user_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["channel_id"], ["walkie_channels.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organizer_user_id"], ["organizer_users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("channel_id", "organizer_user_id", name="uq_walkie_transmit_permission"),
    )

    channels_table = sa.table(
        "walkie_channels",
        sa.column("key", sa.String),
        sa.column("name", sa.String),
        sa.column("icon", sa.String),
        sa.column("kind", sa.String),
        sa.column("transmit_restricted", sa.Boolean),
    )
    op.bulk_insert(
        channels_table,
        [
            {"key": key, "name": name, "icon": icon, "kind": "SYSTEM", "transmit_restricted": restricted}
            for key, name, icon, restricted in SYSTEM_CHANNELS
        ],
    )


def downgrade() -> None:
    op.drop_table("walkie_channel_transmit_permissions")
    op.drop_table("walkie_channels")
