"""Project schemas."""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator


class ProjectBase(BaseModel):
    """Base project schema."""
    title: str = Field(..., min_length=1, max_length=500)
    subtitle: Optional[str] = Field(None, max_length=500)
    authors: Optional[List[str]] = None
    narrators: Optional[List[str]] = None
    translators: Optional[List[str]] = None
    adaptors: Optional[List[str]] = None
    language: str = Field(default="es-PE", max_length=10)
    description: Optional[str] = None
    publisher: Optional[str] = Field(None, max_length=255)
    publish_date: Optional[datetime] = None
    isbn: Optional[str] = Field(None, max_length=20)


class ProjectCreate(ProjectBase):
    """Schema for creating a project."""
    pass


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    subtitle: Optional[str] = Field(None, max_length=500)
    authors: Optional[List[str]] = None
    narrators: Optional[List[str]] = None
    translators: Optional[List[str]] = None
    adaptors: Optional[List[str]] = None
    language: Optional[str] = Field(None, max_length=10)
    description: Optional[str] = None
    publisher: Optional[str] = Field(None, max_length=255)
    publish_date: Optional[datetime] = None
    isbn: Optional[str] = Field(None, max_length=20)
    status: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None
    workflow_completed: Optional[Dict[str, Any]] = None
    
    # Note: Blob storage settings are stored in the settings JSON field with structure:
    # settings.creds.storage.azure = { accountName, accessKey, containerName, endpoint }


class ProjectResponse(ProjectBase):
    """Schema for project response."""
    id: str
    tenant_id: str
    owner_id: str
    status: str
    cover_image_url: Optional[str] = None
    manuscript_word_count: Optional[int] = None
    manuscript_character_count: Optional[int] = None
    workflow_completed: Dict[str, Any] = {}
    settings: Dict[str, Any] = {}
    created_at: datetime
    updated_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None

    @field_validator('id', 'tenant_id', 'owner_id', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v: Any) -> str:
        """Convert UUID to string."""
        return str(v)

    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    """Schema for project list response."""
    items: List[ProjectResponse]
    total: int
    page: int
    page_size: int
    pages: int
