"""add_audio_presets_table

Revision ID: f34b8ca3ab31
Revises: dada0ab8db9a
Create Date: 2025-12-20 22:08:35.913160

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON


# revision identifiers, used by Alembic.
revision: str = 'f34b8ca3ab31'
down_revision: Union[str, None] = 'dada0ab8db9a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'audio_presets',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('project_id', UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('processing_chain', JSON, nullable=False),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    )
    
    # Create indexes
    op.create_index('ix_audio_presets_project_id', 'audio_presets', ['project_id'])
    op.create_index('ix_audio_presets_name', 'audio_presets', ['name'])


def downgrade() -> None:
    op.drop_index('ix_audio_presets_name', table_name='audio_presets')
    op.drop_index('ix_audio_presets_project_id', table_name='audio_presets')
    op.drop_table('audio_presets')
