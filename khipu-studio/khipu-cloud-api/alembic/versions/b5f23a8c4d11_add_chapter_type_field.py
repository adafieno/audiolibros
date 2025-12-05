"""Add chapter_type field

Revision ID: b5f23a8c4d11
Revises: 057d99a91eea
Create Date: 2025-12-04 20:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b5f23a8c4d11'
down_revision: Union[str, None] = '057d99a91eea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add chapter_type column with default 'chapter'
    op.add_column('chapters', 
        sa.Column('chapter_type', sa.String(length=50), nullable=False, server_default='chapter')
    )


def downgrade() -> None:
    # Remove chapter_type column
    op.drop_column('chapters', 'chapter_type')
