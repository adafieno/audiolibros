"""Audio cache model for TTS auditions with Azure Blob Storage."""
from datetime import datetime, timedelta, timezone
from uuid import UUID
from typing import Optional
from sqlalchemy import String, Integer, Text, ForeignKey, DateTime, BigInteger, Index, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column

from shared.db.database import Base


class AudioCache(Base):
    """
    Audio cache for TTS-generated audio files.
    
    Stores metadata and blob paths for cached audio to avoid redundant TTS API calls.
    Cache key is deterministic hash of (text + voice_id + voice_settings).
    """
    
    __tablename__ = "audio_cache"
    
    # Primary key
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=func.gen_random_uuid())
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), 
        nullable=False, 
        index=True
    )
    
    # Cache Key (hash of text + voice + settings)
    cache_key: Mapped[str] = mapped_column(
        String(255), 
        unique=True, 
        nullable=False, 
        index=True
    )
    
    # Input parameters (for debugging and analytics)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    ssml: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    voice_id: Mapped[str] = mapped_column(String(255), nullable=False)
    voice_settings: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    
    # Output - Azure Blob Storage
    audio_blob_path: Mapped[str] = mapped_column(Text, nullable=False)
    audio_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    audio_duration_seconds: Mapped[Optional[float]] = mapped_column(nullable=True)
    audio_file_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    
    # Usage tracking for LRU eviction
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_accessed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=func.now()
    )
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        server_default=func.now()
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), 
        nullable=True
    )
    
    def __repr__(self):
        return f"<AudioCache {self.cache_key[:16]}... hits={self.hit_count}>"
    
    @classmethod
    def default_expiration(cls) -> datetime:
        """Default expiration time: 30 days from now."""
        return datetime.now(timezone.utc) + timedelta(days=30)


# Create indexes for efficient querying
Index('idx_audio_cache_tenant', AudioCache.tenant_id)
Index('idx_audio_cache_key', AudioCache.cache_key)
Index('idx_audio_cache_expires', AudioCache.expires_at)
Index('idx_audio_cache_last_accessed', AudioCache.last_accessed_at)

