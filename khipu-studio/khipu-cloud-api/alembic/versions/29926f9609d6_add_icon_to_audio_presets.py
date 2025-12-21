"""add_icon_to_audio_presets

Revision ID: 29926f9609d6
Revises: f34b8ca3ab31
Create Date: 2025-12-20 22:35:22.944166

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '29926f9609d6'
down_revision: Union[str, None] = 'f34b8ca3ab31'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add icon column to audio_presets table
    op.add_column('audio_presets', sa.Column('icon', sa.String(length=10), nullable=True))


def downgrade() -> None:
    # Remove icon column from audio_presets table
    op.drop_column('audio_presets', 'icon')
