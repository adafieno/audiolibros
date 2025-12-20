"""Pydantic schemas for audio production API."""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from uuid import UUID


class SegmentAudioRequest(BaseModel):
    """Request to generate audio for a segment."""
    text: str = Field(..., description="Text content to convert to speech")
    voice: str = Field(..., description="Voice ID for TTS")
    prosody: Optional[Dict[str, Any]] = Field(None, description="Voice prosody settings")


class SegmentAudioResponse(BaseModel):
    """Response after generating segment audio."""
    success: bool
    raw_audio_url: str = Field(..., description="URL to cached raw audio")
    cache_status: str = Field(..., description="HIT or MISS")
    duration: Optional[float] = Field(None, description="Audio duration in seconds")


class ProcessingChainResponse(BaseModel):
    """Response containing processing chain configuration."""
    processing_chain: Optional[Dict[str, Any]] = Field(
        None,
        description="Processing chain JSON configuration"
    )
    preset_id: Optional[str] = Field(None, description="Preset ID if using a preset")


class ProcessingChainUpdateRequest(BaseModel):
    """Request to update processing chain."""
    processing_chain: Dict[str, Any] = Field(
        ...,
        description="Processing chain JSON configuration"
    )
    preset_id: Optional[str] = Field(None, description="Preset ID if using a preset")


class RevisionMarkRequest(BaseModel):
    """Request to mark/unmark segment for revision."""
    needs_revision: bool = Field(..., description="Whether segment needs revision")
    notes: Optional[str] = Field(None, description="Revision notes")


class SfxUploadResponse(BaseModel):
    """Response after uploading SFX file."""
    id: UUID = Field(..., description="SFX segment ID")
    filename: str = Field(..., description="Original filename")
    blob_url: str = Field(..., description="URL to blob storage")
    duration: float = Field(..., description="Audio duration in seconds")
    file_size: int = Field(..., description="File size in bytes")


class SfxPositionUpdateRequest(BaseModel):
    """Request to update SFX position."""
    display_order: int = Field(..., description="New display order")


class AudioSegmentData(BaseModel):
    """Audio segment data for chapter response."""
    segment_id: str = Field(..., description="Segment or SFX ID")
    type: str = Field(..., description="'plan' or 'sfx'")
    display_order: int = Field(..., description="Display order in chapter")
    text: Optional[str] = Field(None, description="Text content (plan segments only)")
    voice: Optional[str] = Field(None, description="Voice ID (plan segments only)")
    character_name: Optional[str] = Field(None, description="Character name (plan segments only)")
    raw_audio_url: Optional[str] = Field(None, description="URL to raw audio")
    has_audio: bool = Field(..., description="Whether audio file exists")
    processing_chain: Optional[Dict[str, Any]] = Field(None, description="Processing chain config")
    preset_id: Optional[str] = Field(None, description="Preset ID if using a preset")
    needs_revision: bool = Field(False, description="Whether marked for revision")
    duration: Optional[float] = Field(None, description="Audio duration in seconds")


class ChapterAudioProductionResponse(BaseModel):
    """Combined chapter audio production data."""
    segments: list[AudioSegmentData] = Field(..., description="All segments in display order")
