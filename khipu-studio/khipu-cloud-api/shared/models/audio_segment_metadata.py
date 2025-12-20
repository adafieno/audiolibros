"""Audio segment metadata model for audio production module."""
from datetime import datetime
from uuid import UUID
from typing import Optional
from sqlalchemy import String, Boolean, Text, Float, ForeignKey, DateTime, Index, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column

from shared.db.database import Base


class AudioSegmentMetadata(Base):
    """
    Metadata for audio segments in the audio production workflow.
    
    Stores processing chain configurations, revision tracking, and references
    to cached raw TTS audio for each segment in a chapter.
    """
    
    __tablename__ = "audio_segment_metadata"
    
    # Primary key
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    
    # Foreign keys
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Chapter and segment identification
    chapter_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    segment_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    
    # Preset identification
    preset_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # Processing chain configuration (JSON)
    processing_chain: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    
    # Revision tracking
    needs_revision: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    revision_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Audio metadata
    raw_audio_cache_key: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
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
    
    # Unique constraint: one metadata entry per segment per chapter per project
    __table_args__ = (
        Index('idx_segment_metadata_project_chapter', 'project_id', 'chapter_id'),
        Index('idx_segment_metadata_unique', 'project_id', 'chapter_id', 'segment_id', unique=True),
    )
