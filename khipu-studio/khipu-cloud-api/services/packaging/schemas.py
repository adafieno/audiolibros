"""Pydantic schemas for packaging module."""
from datetime import datetime
from typing import Optional, Dict, List, Any
from uuid import UUID
from pydantic import BaseModel, Field


# ============= Audio Spec =============

class AudioSpec(BaseModel):
    """Audio specification for a package."""
    codec: str = Field(..., description="Audio codec: 'aac' or 'mp3'")
    bitrate: str = Field(..., description="Bitrate: '128k', '192k', '256k'")
    sample_rate: int = Field(..., description="Sample rate in Hz: 44100")
    channels: int = Field(..., description="Number of channels: 1 (mono)")


# ============= Package Schemas =============

class PackageBase(BaseModel):
    """Base package schema."""
    platform_id: str = Field(..., description="Platform ID: 'apple', 'google', 'spotify', 'acx', 'kobo'")
    package_format: str = Field(..., description="Package format: 'm4b', 'zip_mp3', 'epub3'")
    audio_spec: AudioSpec


class PackageCreate(PackageBase):
    """Schema for creating a new package."""
    project_id: UUID
    blob_path: str
    blob_container: str = Field(default="temp")
    file_size_bytes: int
    storage_tier: str = Field(default="temp")
    same_as_package_id: Optional[UUID] = None
    expires_at: Optional[datetime] = None


class PackageUpdate(BaseModel):
    """Schema for updating a package."""
    storage_tier: Optional[str] = None
    is_validated: Optional[bool] = None
    validation_results: Optional[Dict[str, Any]] = None
    download_url: Optional[str] = None
    expires_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None


class PackageResponse(PackageBase):
    """Schema for package response."""
    id: UUID
    project_id: UUID
    version_number: int
    blob_path: str
    blob_container: str
    download_url: Optional[str] = None
    file_size_bytes: int
    storage_tier: str
    is_validated: bool
    validation_results: Optional[Dict[str, Any]] = None
    same_as_package_id: Optional[UUID] = None
    expires_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    created_at: datetime
    created_by: Optional[UUID] = None
    
    class Config:
        from_attributes = True


# ============= Packaging Job Schemas =============

class PackagingJobCreate(BaseModel):
    """Schema for creating a packaging job."""
    project_id: UUID
    platform_id: str
    status: str = Field(default="queued")


class PackagingJobUpdate(BaseModel):
    """Schema for updating a packaging job."""
    status: Optional[str] = None
    progress_percent: Optional[int] = None
    current_step: Optional[str] = None
    error_message: Optional[str] = None
    package_id: Optional[UUID] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class PackagingJobResponse(BaseModel):
    """Schema for packaging job response."""
    id: UUID
    project_id: UUID
    platform_id: str
    status: str
    progress_percent: int
    current_step: Optional[str] = None
    error_message: Optional[str] = None
    package_id: Optional[UUID] = None
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ============= Platform Configuration =============

class PlatformRequirement(BaseModel):
    """Single platform requirement check."""
    id: str = Field(..., description="Requirement ID: 'title', 'author', 'cover', etc.")
    met: bool = Field(..., description="Whether requirement is met")
    details: Optional[str] = Field(None, description="Additional details if not met")
    expected: Optional[Any] = Field(None, description="Expected value")
    actual: Optional[Any] = Field(None, description="Actual value")


class PlatformReadiness(BaseModel):
    """Platform readiness status."""
    id: str = Field(..., description="Platform ID")
    name: str = Field(..., description="Platform name")
    enabled: bool = Field(..., description="Whether platform is enabled in project settings")
    ready: bool = Field(..., description="Whether platform is ready for packaging")
    requirements: List[PlatformRequirement] = Field(..., description="List of requirement checks")


class CompletionStats(BaseModel):
    """Project completion statistics for packaging."""
    total_chapters: int
    chapters_with_complete_audio: int
    total_segments: int
    segments_with_audio: int
    percent_complete: float


class PackagingReadinessResponse(BaseModel):
    """Response for packaging readiness check."""
    overall_ready: bool
    completion_stats: CompletionStats
    platforms: List[PlatformReadiness]
    missing_audio: Dict[str, List[UUID]] = Field(..., description="Missing audio by type: 'chapterIds', 'segmentIds'")


# ============= Package Operations =============

class CreatePackagesRequest(BaseModel):
    """Request to create packages for all enabled platforms."""
    generate_missing_audio: bool = Field(default=True, description="Generate missing segment audio on-the-fly")
    validate_after_creation: bool = Field(default=True, description="Validate packages after creation")


class CreatePackagesResponse(BaseModel):
    """Response for package creation."""
    job_ids: Dict[str, UUID] = Field(..., description="Job IDs by platform")
    message: str


class ArchivePackageRequest(BaseModel):
    """Request to archive a package."""
    retention_days: Optional[int] = Field(None, description="Retention days (defaults to tenant plan)")


class ArchivePackageResponse(BaseModel):
    """Response for package archiving."""
    package_id: UUID
    storage_tier: str
    expires_at: Optional[datetime]
    message: str


# ============= Validation =============

class ValidationIssue(BaseModel):
    """Single validation issue."""
    severity: str = Field(..., description="'error', 'warning', or 'info'")
    category: str = Field(..., description="Issue category: 'audio_quality', 'metadata', 'structure'")
    message: str
    details: Optional[str] = None
    affected_chapters: Optional[List[int]] = None


class ValidationResult(BaseModel):
    """Package validation result."""
    valid: bool
    platform: str
    package_path: str
    issues: List[ValidationIssue] = Field(default_factory=list)
    specs: Dict[str, Any] = Field(default_factory=dict, description="Measured package specifications")


class ValidatePackageResponse(BaseModel):
    """Response for package validation."""
    success: bool
    result: ValidationResult


# ============= Storage Quota =============

class StorageQuota(BaseModel):
    """Storage quota information."""
    used: float = Field(..., description="Used storage in MB")
    limit: float = Field(..., description="Storage limit in MB")
    unit: str = Field(default="MB")


class PackageListResponse(BaseModel):
    """Response for listing packages."""
    packages: List[PackageResponse]
    storage_quota: StorageQuota
