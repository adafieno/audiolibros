"""Audio cache model for TTS auditions with Azure Blob Storage."""
from datetime import datetime, timedelta
from uuid import UUID
from typing import Optional
from sqlalchemy import String, Integer, Text, ForeignKey, DateTime, BigInteger, text, Index
from sqlalchemy.dialects.postgresql import JSON as JSONB
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
    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    
    # Foreign keys
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Cache Key (hash of text + voice + settings)
    cache_key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    
    # Input parameters (for debugging and analytics)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    ssml: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    voice_id: Mapped[str] = mapped_column(String(255), nullable=False)
    voice_settings: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    
    # Output - Azure Blob Storage
    audio_blob_path: Mapped[str] = mapped_column(Text, nullable=False)  # Path in blob storage (e.g., "audio-cache/tenant-id/cache-key.mp3")
    audio_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Public URL if generated
    audio_duration_seconds: Mapped[Optional[float]] = mapped_column(nullable=True)
    audio_file_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    
    # Usage tracking for LRU eviction
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_accessed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"), onupdate=datetime.utcnow)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)  # Optional expiration for cleanup
    
    def __repr__(self):
        return f"<AudioCache {self.cache_key[:16]}... hits={self.hit_count}>"
    
    @classmethod
    def default_expiration(cls) -> datetime:
        """Default expiration time: 30 days from now."""
        return datetime.utcnow() + timedelta(days=30)


# Create indexes for efficient querying
Index('idx_audio_cache_tenant', AudioCache.tenant_id)
Index('idx_audio_cache_key', AudioCache.cache_key)
Index('idx_audio_cache_expires', AudioCache.expires_at)
Index('idx_audio_cache_last_accessed', AudioCache.last_accessed_at)
