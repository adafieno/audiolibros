"""Chapter model for audiobook projects."""
from datetime import datetime
from uuid import UUID
from sqlalchemy import String, Integer, Text, ForeignKey, DateTime, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from shared.db.database import Base


class Chapter(Base):
    """Chapter model for storing manuscript content."""
    
    __tablename__ = "chapters"
    
    # Primary key
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    
    # Foreign keys
    project_id: Mapped[UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    
    # Chapter metadata
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    chapter_type: Mapped[str] = mapped_column(String(50), nullable=False, server_default="chapter")
    
    # Chapter content
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    character_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Status tracking
    is_complete: Mapped[bool] = mapped_column(nullable=False, default=False)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"), onupdate=datetime.utcnow)
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="chapters")
    
    def __repr__(self):
        return f"<Chapter {self.title} (Project: {self.project_id})>"
