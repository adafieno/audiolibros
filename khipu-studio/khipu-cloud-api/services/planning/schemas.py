"""Pydantic schemas for planning service."""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from uuid import UUID


class SegmentSchema(BaseModel):
    """Schema for a text segment."""
    segment_id: int
    start_idx: int
    end_idx: int
    delimiter: str
    text: str
    originalText: Optional[str] = None
    voice: Optional[str] = None
    needsRevision: Optional[bool] = False


class PlanGenerateOptions(BaseModel):
    """Options for plan generation."""
    maxKB: Optional[int] = 48


class ChapterPlanResponse(BaseModel):
    """Response schema for chapter plan."""
    id: UUID
    project_id: UUID
    chapter_id: UUID
    segments: List[SegmentSchema]
    is_complete: bool
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class PlanUpdateRequest(BaseModel):
    """Request to update plan segments."""
    segments: List[SegmentSchema]


class SegmentOperationResponse(BaseModel):
    """Response from segment operations."""
    success: bool
    message: Optional[str] = None
    segments: Optional[List[SegmentSchema]] = None
