"""fix_audio_cache_id_default

Revision ID: 52a86866b0ba
Revises: c3f89bde72a1
Create Date: 2025-12-19 06:13:11.314519

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '52a86866b0ba'
down_revision: Union[str, None] = 'c3f89bde72a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add server_default for id column to generate UUIDs automatically
    op.alter_column(
        'audio_cache',
        'id',
        server_default=sa.text('gen_random_uuid()'),
        existing_type=sa.UUID(),
        existing_nullable=False
    )


def downgrade() -> None:
    # Remove server_default from id column
    op.alter_column(
        'audio_cache',
        'id',
        server_default=None,
        existing_type=sa.UUID(),
        existing_nullable=False
    )
