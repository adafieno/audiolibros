"""Project member schemas."""
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, field_validator


class ProjectMemberBase(BaseModel):
    """Base project member schema."""
    user_id: str
    role: str = "reviewer"  # 'creator' or 'reviewer'


class ProjectMemberAdd(ProjectMemberBase):
    """Schema for adding a member to a project."""
    permissions: Optional[list[str]] = None


class ProjectMemberUpdate(BaseModel):
    """Schema for updating a project member."""
    role: Optional[str] = None
    permissions: Optional[list[str]] = None


class ProjectMemberResponse(ProjectMemberBase):
    """Schema for project member response."""
    id: str
    project_id: str
    permissions: list[str]
    added_at: datetime
    added_by: Optional[str] = None
    user_email: Optional[str] = None
    user_name: Optional[str] = None

    @field_validator('id', 'project_id', 'user_id', 'added_by', mode='before')
    @classmethod
    def convert_uuid_to_str(cls, v: Any) -> Optional[str]:
        """Convert UUID to string."""
        return str(v) if v is not None else None

    class Config:
        from_attributes = True
