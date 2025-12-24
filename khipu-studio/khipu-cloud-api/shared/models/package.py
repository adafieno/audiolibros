"""Package model for packaging module."""
from datetime import datetime
from uuid import UUID
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Boolean, Text, BigInteger, Integer, ForeignKey, DateTime, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB

from shared.db.database import Base

if TYPE_CHECKING:
    from shared.models import Project, User


class Package(Base):
    """
    Stores generated audiobook packages for different platforms.
    
    Supports two storage tiers:
    - 'temp': Ephemeral packages (24h TTL), not counted toward quota
    - 'archive': User-archived packages with version limits and retention
    """
    
    __tablename__ = "packages"
    
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
    
    # Platform & Version
    platform_id: Mapped[str] = mapped_column(String(50), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    
    # Package Info
    package_format: Mapped[str] = mapped_column(String(50), nullable=False)  # 'm4b', 'zip_mp3', 'epub3'
    blob_path: Mapped[str] = mapped_column(Text, nullable=False)
    blob_container: Mapped[str] = mapped_column(String(50), nullable=False)  # 'temp' or 'packages-archive'
    download_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Pre-signed URL (generated on-demand)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    
    # Storage Tier
    storage_tier: Mapped[str] = mapped_column(String(20), nullable=False, default='temp')  # 'temp' or 'archive'
    
    # Audio Spec Used (for validation and regeneration)
    audio_spec: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # {
    #   "codec": "aac" | "mp3",
    #   "bitrate": "128k" | "192k" | "256k",
    #   "sample_rate": 44100,
    #   "channels": 1
    # }
    
    # Validation
    is_validated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    validation_results: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    
    # Optimization (deduplication)
    same_as_package_id: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("packages.id", ondelete="SET NULL"),
        nullable=True
    )
    
    # Expiration
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Metadata
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now()
    )
    created_by: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="packages")
    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])
    same_as_package: Mapped[Optional["Package"]] = relationship(
        "Package",
        remote_side=[id],
        foreign_keys=[same_as_package_id]
    )


# Create indexes
Index('ix_packages_project', Package.project_id)
Index('ix_packages_platform_version', Package.project_id, Package.platform_id, Package.version_number)
Index('ix_packages_tenant', Package.tenant_id)
Index('ix_packages_expiration', Package.expires_at, postgresql_where=(Package.expires_at.isnot(None)))
Index(
    'ix_packages_expired',
    Package.expires_at,
    postgresql_where=((Package.storage_tier == 'temp') & (Package.expires_at < func.now()))
)
