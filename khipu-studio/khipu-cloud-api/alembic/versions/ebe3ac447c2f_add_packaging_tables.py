"""add_packaging_tables

Revision ID: ebe3ac447c2f
Revises: 29926f9609d6
Create Date: 2025-12-24 08:34:57.295680

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'ebe3ac447c2f'
down_revision: Union[str, None] = '29926f9609d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create packages table
    op.create_table(
        'packages',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        
        # Platform & Version
        sa.Column('platform_id', sa.String(50), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False, server_default='1'),
        
        # Package Info
        sa.Column('package_format', sa.String(50), nullable=False),
        sa.Column('blob_path', sa.Text(), nullable=False),
        sa.Column('blob_container', sa.String(50), nullable=False),
        sa.Column('download_url', sa.Text(), nullable=True),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=False),
        
        # Storage Tier
        sa.Column('storage_tier', sa.String(20), nullable=False, server_default='temp'),
        
        # Audio Spec Used
        sa.Column('audio_spec', postgresql.JSONB(), nullable=False),
        
        # Validation
        sa.Column('is_validated', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('validation_results', postgresql.JSONB(), nullable=True),
        
        # Optimization (deduplication)
        sa.Column('same_as_package_id', postgresql.UUID(as_uuid=True), nullable=True),
        
        # Expiration
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
        
        # Metadata
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        
        # Constraints
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['same_as_package_id'], ['packages.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_id', 'platform_id', 'version_number', name='uq_packages_project_platform_version')
    )
    
    # Create indexes for packages table
    op.create_index('ix_packages_project', 'packages', ['project_id'])
    op.create_index('ix_packages_platform_version', 'packages', ['project_id', 'platform_id', 'version_number'])
    op.create_index('ix_packages_tenant', 'packages', ['tenant_id'])
    op.create_index('ix_packages_expiration', 'packages', ['expires_at'], postgresql_where=sa.text("expires_at IS NOT NULL"))
    # Note: Removed ix_packages_expired index - use query-time filtering instead of index predicate with now()
    
    # Create packaging_jobs table
    op.create_table(
        'packaging_jobs',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), primary_key=True),
        sa.Column('tenant_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('platform_id', sa.String(50), nullable=False),
        
        # Job Status
        sa.Column('status', sa.String(50), nullable=False, server_default='queued'),
        sa.Column('progress_percent', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('current_step', sa.Text(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        
        # Result
        sa.Column('package_id', postgresql.UUID(as_uuid=True), nullable=True),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        
        # Constraints
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['package_id'], ['packages.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for packaging_jobs table
    op.create_index('ix_packaging_jobs_project', 'packaging_jobs', ['project_id'])
    op.create_index('ix_packaging_jobs_status', 'packaging_jobs', ['status'], 
                    postgresql_where=sa.text("status IN ('queued', 'downloading_audio', 'processing', 'uploading')"))
    op.create_index('ix_packaging_jobs_tenant', 'packaging_jobs', ['tenant_id'])


def downgrade() -> None:
    # Drop packaging_jobs indexes
    op.drop_index('ix_packaging_jobs_tenant', table_name='packaging_jobs')
    op.drop_index('ix_packaging_jobs_status', table_name='packaging_jobs')
    op.drop_index('ix_packaging_jobs_project', table_name='packaging_jobs')
    
    # Drop packaging_jobs table
    op.drop_table('packaging_jobs')
    
    # Drop packages indexes
    op.drop_index('ix_packages_expiration', table_name='packages')
    op.drop_index('ix_packages_tenant', table_name='packages')
    op.drop_index('ix_packages_platform_version', table_name='packages')
    op.drop_index('ix_packages_project', table_name='packages')
    
    # Drop packages table
    op.drop_table('packages')
