"""Audio preset model for storing custom processing chains."""
from datetime import datetime
from uuid import UUID
from typing import Optional
from sqlalchemy import String, Text, ForeignKey, DateTime, Index, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column

from shared.db.database import Base


class AudioPreset(Base):
    """
    Custom audio processing presets for projects.
    
    Stores user-created processing chain configurations that can be
    reused across multiple segments and sessions.
    """
    
    __tablename__ = "audio_presets"
    
    # Primary key
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    
    # Foreign keys
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Preset identification
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    
    # Processing chain configuration (JSON)
    processing_chain: Mapped[dict] = mapped_column(JSON, nullable=False)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    
    # Indexes
    __table_args__ = (
        Index('ix_audio_presets_project_name', 'project_id', 'name'),
    )
