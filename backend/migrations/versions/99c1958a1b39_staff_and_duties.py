"""staff and duties

Revision ID: 99c1958a1b39
Revises: 1a120ac19c2c
Create Date: 2026-08-22 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = '99c1958a1b39'
down_revision = '1a120ac19c2c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('staff_members',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('full_name', sa.String(length=160), nullable=False),
    sa.Column('phone', sa.String(length=60), nullable=True),
    sa.Column('email', sa.String(length=200), nullable=True),
    sa.Column('department', sa.String(length=80), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('duty_assignments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('staff_id', sa.Integer(), nullable=False),
    sa.Column('room_id', sa.Integer(), nullable=False),
    sa.Column('duty_type', sa.String(length=80), nullable=False),
    sa.Column('start_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('end_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['staff_id'], ['staff_members.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['room_id'], ['rooms.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('duty_assignments')
    op.drop_table('staff_members')
