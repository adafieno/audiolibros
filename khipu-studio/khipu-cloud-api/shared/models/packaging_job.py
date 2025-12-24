"""Packaging job model for async package generation tracking."""
from datetime import datetime
from uuid import UUID
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Integer, Text, ForeignKey, DateTime, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from shared.db.database import Base

if TYPE_CHECKING:
    from shared.models import Project
    from shared.models.package import Package


class PackagingJob(Base):
    """
    Tracks async packaging job progress and status.
    
    Status flow:
    - 'queued': Job created, waiting to start
    - 'downloading_audio': Downloading segment audio from blob storage
    - 'processing': Concatenating, encoding, creating package
    - 'uploading': Uploading final package to blob storage
    - 'completed': Package successfully created
    - 'failed': Job failed with error
    """
    
    __tablename__ = "packaging_jobs"
    
    # Primary key
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    project_id: Mapped[UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    platform_id: Mapped[str] = mapped_column(String(50), nullable=False)
    
    # Job Status
    status: Mapped[str] = mapped_column(String(50), nullable=False, default='queued')
    # Valid statuses: 'queued', 'downloading_audio', 'processing', 'uploading', 'completed', 'failed'
    
    progress_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_step: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Result
    package_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("packages.id", ondelete="SET NULL"),
        nullable=True
    )
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="packaging_jobs")
    package: Mapped[Optional["Package"]] = relationship("Package")


# Create indexes
Index('ix_packaging_jobs_project', PackagingJob.project_id)
Index('ix_packaging_jobs_tenant', PackagingJob.tenant_id)
Index(
    'ix_packaging_jobs_status',
    PackagingJob.status,
    postgresql_where=(PackagingJob.status.in_(['queued', 'downloading_audio', 'processing', 'uploading']))
)
