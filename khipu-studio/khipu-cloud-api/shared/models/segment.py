"""Segment model for normalized audio segments."""
from datetime import datetime
from uuid import UUID
from typing import TYPE_CHECKING
from sqlalchemy import DateTime, ForeignKey, Integer, String, Boolean, text as sql_text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB

from shared.db.database import Base

if TYPE_CHECKING:
    from shared.models.plan import ChapterPlan
    from shared.models.audio_segment_metadata import AudioSegmentMetadata


class Segment(Base):
    """Normalized segment table with proper UUID relationships."""
    
    __tablename__ = "segments"
    
    # Primary key
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=sql_text("gen_random_uuid()"))
    
    # Foreign keys
    chapter_plan_id: Mapped[UUID] = mapped_column(
        ForeignKey("chapter_plans.id", ondelete="CASCADE"), 
        nullable=False,
        index=True
    )
    
    # Segment data
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(String, nullable=False)
    voice: Mapped[str | None] = mapped_column(String(255), nullable=True)
    needs_revision: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    
    # Additional segment metadata stored as JSONB (e.g., delimiter, start_idx, end_idx)
    segment_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=sql_text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=sql_text("now()"),
        onupdate=datetime.utcnow
    )
    
    # Relationships
    chapter_plan: Mapped["ChapterPlan"] = relationship("ChapterPlan", back_populates="normalized_segments")
    audio_metadata: Mapped["AudioSegmentMetadata | None"] = relationship(
        "AudioSegmentMetadata", 
        back_populates="segment",
        uselist=False,
        cascade="all, delete-orphan"
    )
    
    def __repr__(self):
        return f"<Segment {self.id} order={self.order_index} voice={self.voice}>"
    
    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": str(self.id),
            "order": self.order_index,
            "text": self.text,
            "voice": self.voice,
            "needsRevision": self.needs_revision,
            **(self.segment_metadata or {})
        }
