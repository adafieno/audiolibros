"""Plan model for chapter orchestration."""
from datetime import datetime
from uuid import UUID
from typing import TYPE_CHECKING
from sqlalchemy import DateTime, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB

from shared.db.database import Base

if TYPE_CHECKING:
    from shared.models import Project
    from shared.models.chapter import Chapter


class ChapterPlan(Base):
    """Chapter plan with segments for TTS orchestration."""
    
    __tablename__ = "chapter_plans"
    
    # Primary key
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    
    # Foreign keys
    project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    chapter_id: Mapped[UUID] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"), nullable=False, unique=True)
    
    # Plan data - stored as JSON array of segments
    segments: Mapped[list] = mapped_column(JSONB, nullable=False)
    
    # Status
    is_complete: Mapped[bool] = mapped_column(nullable=False, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"), onupdate=datetime.utcnow)
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="chapter_plans")
    chapter: Mapped["Chapter"] = relationship("Chapter", back_populates="plan", uselist=False)
    
    def __repr__(self):
        return f"<ChapterPlan for Chapter {self.chapter_id}>"
