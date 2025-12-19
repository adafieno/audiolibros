"""SFX segments model for audio production module."""
from datetime import datetime
from uuid import UUID
from sqlalchemy import String, Integer, BigInteger, Float, ForeignKey, DateTime, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column

from shared.db.database import Base


class SfxSegment(Base):
    """
    Sound effect (SFX) segments for audio production.
    
    Stores user-uploaded audio files that are inserted between plan segments
    in the final audio production. Files are stored in Azure Blob Storage.
    """
    
    __tablename__ = "sfx_segments"
    
    # Primary key
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    
    # Foreign keys
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    
    # Chapter identification
    chapter_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    
    # SFX file information
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    blob_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    duration_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    
    # Position in chapter (where to insert in segment list)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    # Indexes
    __table_args__ = (
        Index('idx_sfx_project_chapter', 'project_id', 'chapter_id', 'display_order'),
        Index('idx_sfx_chapter_order', 'chapter_id', 'display_order'),
    )
