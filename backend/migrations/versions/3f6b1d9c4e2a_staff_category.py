"""staff category

Revision ID: 3f6b1d9c4e2a
Revises: 99c1958a1b39
Create Date: 2026-08-24 00:00:00.000000
"""
from alembic import op


revision = '3f6b1d9c4e2a'
down_revision = '99c1958a1b39'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('staff_members', 'department', new_column_name='category')


def downgrade() -> None:
    op.alter_column('staff_members', 'category', new_column_name='department')
