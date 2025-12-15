"""add_chapter_plans_table

Revision ID: b1da7da88de8
Revises: b5f23a8c4d11
Create Date: 2025-12-15 08:56:14.010832

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b1da7da88de8'
down_revision: Union[str, None] = 'b5f23a8c4d11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create chapter_plans table
    op.create_table(
        'chapter_plans',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('chapter_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('segments', postgresql.JSONB(), nullable=False),
        sa.Column('is_complete', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['chapter_id'], ['chapters.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('chapter_id', name='uq_chapter_plans_chapter_id')
    )
    
    # Create indexes for better query performance
    op.create_index('ix_chapter_plans_project_id', 'chapter_plans', ['project_id'])
    op.create_index('ix_chapter_plans_chapter_id', 'chapter_plans', ['chapter_id'])


def downgrade() -> None:
    # Drop indexes first
    op.drop_index('ix_chapter_plans_chapter_id', table_name='chapter_plans')
    op.drop_index('ix_chapter_plans_project_id', table_name='chapter_plans')
    
    # Drop table
    op.drop_table('chapter_plans')
