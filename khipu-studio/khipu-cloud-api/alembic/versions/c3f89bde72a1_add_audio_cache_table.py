"""add_audio_cache_table

Revision ID: c3f89bde72a1
Revises: a922f38873df
Create Date: 2025-01-10 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c3f89bde72a1'
down_revision: Union[str, None] = 'a922f38873df'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create audio_cache table for TTS audition caching with Azure Blob Storage"""
    op.create_table(
        'audio_cache',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('tenant_id', sa.UUID(), nullable=False),
        sa.Column('cache_key', sa.String(length=255), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('ssml', sa.Text(), nullable=True),
        sa.Column('voice_id', sa.String(length=255), nullable=False),
        sa.Column('voice_settings', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('audio_blob_path', sa.Text(), nullable=False),
        sa.Column('audio_url', sa.Text(), nullable=True),
        sa.Column('audio_duration_seconds', sa.Float(), nullable=True),
        sa.Column('audio_file_size_bytes', sa.BigInteger(), nullable=True),
        sa.Column('hit_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('last_accessed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for efficient querying
    op.create_index(
        'ix_audio_cache_cache_key',
        'audio_cache',
        ['cache_key'],
        unique=True
    )
    op.create_index(
        'ix_audio_cache_tenant_id',
        'audio_cache',
        ['tenant_id'],
        unique=False
    )
    op.create_index(
        'ix_audio_cache_expires_at',
        'audio_cache',
        ['expires_at'],
        unique=False
    )
    op.create_index(
        'ix_audio_cache_last_accessed_at',
        'audio_cache',
        ['last_accessed_at'],
        unique=False
    )


def downgrade() -> None:
    """Drop audio_cache table and indexes"""
    op.drop_index('ix_audio_cache_last_accessed_at', table_name='audio_cache')
    op.drop_index('ix_audio_cache_expires_at', table_name='audio_cache')
    op.drop_index('ix_audio_cache_tenant_id', table_name='audio_cache')
    op.drop_index('ix_audio_cache_cache_key', table_name='audio_cache')
    op.drop_table('audio_cache')
