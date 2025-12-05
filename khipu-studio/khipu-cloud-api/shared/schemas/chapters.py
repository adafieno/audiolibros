"""Chapter schemas for request/response validation."""
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


class ChapterBase(BaseModel):
    """Base chapter schema."""
    title: str = Field(..., min_length=1, max_length=500)
    content: str = Field(default="")
    order: int = Field(default=0, ge=0)
    chapter_type: str = Field(default="chapter")
    is_complete: bool = Field(default=False)


class ChapterCreate(ChapterBase):
    """Schema for creating a new chapter."""
    pass


class ChapterUpdate(BaseModel):
    """Schema for updating a chapter."""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    content: Optional[str] = None
    order: Optional[int] = Field(None, ge=0)
    chapter_type: Optional[str] = None
    is_complete: Optional[bool] = None


class ChapterResponse(ChapterBase):
    """Schema for chapter response."""
    id: UUID
    project_id: UUID
    word_count: int
    character_count: int
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class ChapterListResponse(BaseModel):
    """Schema for chapter list response."""
    items: list[ChapterResponse]
    total: int
