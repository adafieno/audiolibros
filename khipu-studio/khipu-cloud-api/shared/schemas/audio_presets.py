"""
Audio Presets Schemas
"""
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field
from typing import Any, Dict


class AudioPresetCreate(BaseModel):
    """Schema for creating a new audio preset"""
    name: str = Field(..., min_length=1, max_length=255, description="Name of the preset")
    description: str | None = Field(None, description="Description of the preset")
    processing_chain: Dict[str, Any] = Field(..., description="Processing chain configuration")
    icon: str | None = Field(None, max_length=10, description="Icon/emoji for the preset")


class AudioPresetResponse(BaseModel):
    """Schema for audio preset response"""
    id: UUID
    project_id: UUID
    name: str
    description: str | None
    processing_chain: Dict[str, Any]
    icon: str | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
