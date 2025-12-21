"""
Database Models - SQLAlchemy ORM Models
"""
from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey, Text, ARRAY, JSON, Float, BigInteger
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid

from shared.db.database import Base
from .chapter import Chapter
from .plan import ChapterPlan
from .action_history import ActionHistory
from .audio_cache import AudioCache
from .audio_segment_metadata import AudioSegmentMetadata
from .audio_preset import AudioPreset
from .sfx_segments import SfxSegment


class Tenant(Base):
    """Tenant model for multi-tenancy"""
    __tablename__ = "tenants"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    subdomain = Column(String(100), unique=True, nullable=False, index=True)
    plan = Column(String(50), nullable=False, default="single")
    
    # Limits
    max_projects = Column(Integer, default=10)
    max_storage_gb = Column(Integer, default=100)
    max_users = Column(Integer, default=5)
    
    # Settings
    settings = Column(JSON, default={})
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_active = Column(Boolean, default=True)
    suspended_at = Column(DateTime(timezone=True), nullable=True)
    suspended_reason = Column(Text, nullable=True)
    
    # Billing
    stripe_customer_id = Column(String(255), nullable=True)
    subscription_status = Column(String(50), nullable=True)
    
    # Relationships
    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="tenant", cascade="all, delete-orphan")


class User(Base):
    """User model"""
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Identity
    email = Column(String(255), nullable=False, index=True)
    hashed_password = Column(String(255), nullable=True)  # Nullable for Azure AD users
    azure_ad_id = Column(String(255), nullable=True, unique=True, index=True)
    full_name = Column(String(255), nullable=True)
    avatar_url = Column(Text, nullable=True)
    
    # Role & Permissions
    role = Column(String(50), nullable=False, default="creator")  # 'admin', 'creator', 'validator'
    permissions = Column(JSON, default=[])
    is_superuser = Column(Boolean, default=False)
    
    # Status
    is_active = Column(Boolean, default=True)
    email_verified = Column(Boolean, default=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="users")
    projects = relationship("Project", back_populates="owner", foreign_keys="Project.owner_id")


class Project(Base):
    """Project model"""
    __tablename__ = "projects"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    
    # Project Info
    title = Column(String(500), nullable=False)
    subtitle = Column(String(500), nullable=True)
    authors = Column(ARRAY(String), nullable=True)
    narrators = Column(ARRAY(String), nullable=True)
    translators = Column(ARRAY(String), nullable=True)
    adaptors = Column(ARRAY(String), nullable=True)
    language = Column(String(10), nullable=False, default="es-PE")
    
    # Description
    description = Column(Text, nullable=True)
    publisher = Column(String(255), nullable=True)
    publish_date = Column(DateTime(timezone=True), nullable=True)
    isbn = Column(String(20), nullable=True)
    
    # Cover & Manuscript
    cover_image_url = Column(Text, nullable=True)
    cover_image_blob_path = Column(Text, nullable=True)
    manuscript_blob_path = Column(Text, nullable=True)
    manuscript_word_count = Column(Integer, nullable=True)
    manuscript_character_count = Column(Integer, nullable=True)
    
    # Status
    status = Column(String(50), nullable=False, default="draft")
    workflow_completed = Column(JSON, default={})
    settings = Column(JSON, default={})
    
    # Metadata
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    tenant = relationship("Tenant", back_populates="projects")
    owner = relationship("User", back_populates="projects", foreign_keys=[owner_id])
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    chapters = relationship("Chapter", back_populates="project", cascade="all, delete-orphan", order_by="Chapter.order")
    chapter_plans = relationship("ChapterPlan", back_populates="project", cascade="all, delete-orphan")


class ProjectMember(Base):
    """Project team member model for role-based access control"""
    __tablename__ = "project_members"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Role in project: 'creator', 'reviewer'
    role = Column(String(50), nullable=False, default="reviewer")
    
    # Permissions specific to this project
    # Examples: ["read", "write", "review", "annotate", "approve"]
    permissions = Column(ARRAY(String), default=["read"])
    
    # Metadata
    added_at = Column(DateTime(timezone=True), server_default=func.now())
    added_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    # Relationships
    project = relationship("Project", back_populates="members")
    user = relationship("User", foreign_keys=[user_id])
    added_by_user = relationship("User", foreign_keys=[added_by])


# Add __init__.py files to make modules importable
