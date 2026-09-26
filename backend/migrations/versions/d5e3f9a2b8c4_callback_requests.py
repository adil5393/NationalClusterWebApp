"""Adds callback_requests — "Call me back" requests from the public Contacts
page to a staff member, optionally with the requester's device location
(see models.CallbackRequest).

Revision ID: d5e3f9a2b8c4
Revises: c4d2e8f1a7b3
Create Date: 2026-09-26 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "d5e3f9a2b8c4"
down_revision = "c4d2e8f1a7b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "callback_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("staff_member_id", sa.Integer(), sa.ForeignKey("staff_members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("contact_group_id", sa.Integer(), sa.ForeignKey("contact_groups.id", ondelete="SET NULL"), nullable=True),
        sa.Column("topic", sa.String(length=160), nullable=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="SET NULL"), nullable=True),
        sa.Column("requester_kind", sa.String(length=20), nullable=False),
        sa.Column("participant_id", sa.Integer(), sa.ForeignKey("participants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("coach_id", sa.Integer(), sa.ForeignKey("coaches.id", ondelete="SET NULL"), nullable=True),
        sa.Column("requester_name", sa.String(length=200), nullable=False),
        sa.Column("requester_role", sa.String(length=40), nullable=True),
        sa.Column("callback_phone", sa.String(length=30), nullable=False),
        sa.Column("message", sa.String(length=300), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("location_accuracy_m", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="PENDING"),
        sa.Column("handled_by_user_id", sa.Integer(), sa.ForeignKey("organizer_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("handled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_callback_requests_staff_member_id", "callback_requests", ["staff_member_id"])
    op.create_index("ix_callback_requests_status", "callback_requests", ["status"])


def downgrade() -> None:
    op.drop_index("ix_callback_requests_status", table_name="callback_requests")
    op.drop_index("ix_callback_requests_staff_member_id", table_name="callback_requests")
    op.drop_table("callback_requests")
