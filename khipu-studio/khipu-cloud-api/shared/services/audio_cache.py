"""Audio cache service with two-tier caching (L2: Database + Blob Storage)."""
import logging
import hashlib
import json
import asyncio
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_
from uuid import UUID

from shared.models.audio_cache import AudioCache
from shared.services.blob_storage import BlobStorageService
from shared.config import Settings

logger = logging.getLogger(__name__)


class AudioCacheService:
    """
    Two-tier audio cache service.
    
    L1: Frontend in-memory cache (handled by frontend)
    L2: Database + Azure Blob Storage (handled here)
    
    Flow:
    1. Check database for cache entry
    2. If found and not expired, download from blob storage
    3. If not found, generate audio via TTS
    4. Store in blob storage and database
    5. Return audio data
    """
    
    def __init__(self, blob_service: BlobStorageService, settings: Settings):
        """Initialize audio cache service."""
        self.blob_service = blob_service
        self.settings = settings
    
    @staticmethod
    def generate_cache_key(
        text: str,
        voice_id: str,
        voice_settings: Optional[Dict[str, Any]] = None,
        pause_config: Optional[Dict[str, int]] = None,
        tenant_id: Optional[UUID] = None,
        tts_provider: str = "azure"
    ) -> str:
        """
        Generate deterministic cache key with tenant and provider isolation.
        
        Args:
            text: Text to synthesize
            voice_id: Voice identifier from TTS provider
            voice_settings: Optional voice settings (style, rate, pitch, etc.)
            pause_config: Optional pause configuration (sentenceMs, paragraphMs, commaMs, etc.)
            tenant_id: Tenant UUID for cache isolation (required for multi-tenant)
            tts_provider: TTS provider identifier ("azure", "google", "elevenlabs", etc.)
            
        Returns:
            str: SHA256 hash as cache key
        """
        # Normalize voice settings keys (handle camelCase and snake_case)
        normalized_settings = {}
        if voice_settings:
            key_mappings = {
                "styledegree": "style_degree",
                "styleDegree": "style_degree",
                "rate_pct": "rate_pct",
                "ratePct": "rate_pct",
                "pitch_pct": "pitch_pct",
                "pitchPct": "pitch_pct",
            }
            for key, value in voice_settings.items():
                normalized_key = key_mappings.get(key, key)
                # Only include non-null values in cache key
                if value is not None:
                    normalized_settings[normalized_key] = value
        
        # Create deterministic representation with tenant and provider isolation
        cache_input = {
            "tenant_id": str(tenant_id) if tenant_id else "global",
            "tts_provider": tts_provider,
            "voice_id": voice_id,
            "text": text.strip(),  # Normalize whitespace
            "settings": normalized_settings,
            "pause_config": pause_config if pause_config else None
        }
        
        # Sort keys for deterministic JSON
        cache_json = json.dumps(cache_input, sort_keys=True)
        
        # Generate SHA256 hash
        cache_key = hashlib.sha256(cache_json.encode('utf-8')).hexdigest()
        
        return cache_key
    
    async def get_cached_audio(
        self,
        db: AsyncSession,
        tenant_id: UUID,
        text: str,
        voice_id: str,
        voice_settings: Optional[Dict[str, Any]] = None,
        pause_config: Optional[Dict[str, int]] = None,
        tts_provider: str = "azure"
    ) -> Optional[bytes]:
        """
        Get cached audio from L2 cache (Database + Blob).
        
        Args:
            db: Database session
            tenant_id: Tenant UUID
            text: Text that was synthesized
            voice_id: Voice identifier
            voice_settings: Voice settings used
            pause_config: Pause configuration used (sentenceMs, paragraphMs, etc.)
            tts_provider: TTS provider identifier ("azure", "google", "elevenlabs", etc.)
            
        Returns:
            bytes: Audio data if found and not expired, None otherwise
        """
        cache_key = self.generate_cache_key(text, voice_id, voice_settings, pause_config, tenant_id, tts_provider)
        
        try:
            # Query database for cache entry
            result = await db.execute(
                select(AudioCache).where(
                    AudioCache.tenant_id == tenant_id,
                    AudioCache.cache_key == cache_key
                )
            )
            cache_entry = result.scalar_one_or_none()
            
            if not cache_entry:
                logger.info(f"L2 cache miss: {cache_key[:16]}...")
                return None
            
            # Check if expired
            if cache_entry.expires_at and cache_entry.expires_at < datetime.now(timezone.utc):
                logger.info(f"L2 cache expired: {cache_key[:16]}...")
                # Delete expired entry
                await self._delete_cache_entry(db, cache_entry)
                return None
            
            # Download audio from blob storage
            audio_data = await self.blob_service.download_audio(cache_entry.audio_blob_path)
            
            if not audio_data:
                logger.warning(f"Blob not found for cache entry: {cache_key[:16]}...")
                # Clean up orphaned database entry
                await db.delete(cache_entry)
                await db.commit()
                return None
            
            # Update hit count and last accessed time
            await db.execute(
                update(AudioCache)
                .where(AudioCache.id == cache_entry.id)
                .values(
                    hit_count=AudioCache.hit_count + 1,
                    last_accessed_at=datetime.now(timezone.utc)
                )
            )
            await db.commit()
            
            logger.info(f"✅ L2 cache HIT: {cache_key[:16]}... (hits: {cache_entry.hit_count + 1})")
            return audio_data
            
        except Exception as e:
            logger.error(f"Error retrieving cached audio: {e}")
            return None
    
    async def store_cached_audio(
        self,
        db: AsyncSession,
        tenant_id: UUID,
        text: str,
        voice_id: str,
        voice_settings: Optional[Dict[str, Any]],
        audio_data: bytes,
        ssml: Optional[str] = None,
        audio_duration_seconds: Optional[float] = None,
        pause_config: Optional[Dict[str, int]] = None,
        tts_provider: str = "azure"
    ) -> AudioCache:
        """
        Store audio in L2 cache (Database + Blob Storage).
        
        Args:
            db: Database session
            tenant_id: Tenant UUID
            text: Text that was synthesized
            voice_id: Voice identifier
            voice_settings: Voice settings used
            audio_data: Generated audio bytes
            ssml: Optional SSML representation
            audio_duration_seconds: Optional audio duration
            pause_config: Pause configuration used (sentenceMs, paragraphMs, etc.)
            tts_provider: TTS provider identifier
            
        Returns:
            AudioCache: Created cache entry
        """
        cache_key = self.generate_cache_key(text, voice_id, voice_settings, pause_config, tenant_id, tts_provider)
        
        # Check if entry already exists (prevent duplicate key errors)
        existing_result = await db.execute(
            select(AudioCache).where(
                and_(
                    AudioCache.tenant_id == tenant_id,
                    AudioCache.cache_key == cache_key
                )
            )
        )
        existing_entry = existing_result.scalar_one_or_none()
        
        if existing_entry:
            logger.info(f"💾 Cache entry already exists: {cache_key[:16]}... (reusing)")
            return existing_entry
        
        try:
            # Generate blob path
            blob_path = self.blob_service.generate_blob_path(str(tenant_id), cache_key)
            
            # Upload to blob storage (if configured)
            blob_url = None
            if self.blob_service.is_configured:
                blob_url = await self.blob_service.upload_audio(blob_path, audio_data)
            else:
                logger.debug("Blob storage not configured, skipping upload")
            
            # Create database entry
            cache_entry = AudioCache(
                tenant_id=tenant_id,
                cache_key=cache_key,
                text=text[:5000],  # Limit text storage to 5000 chars
                ssml=ssml[:10000] if ssml else None,  # Limit SSML to 10000 chars
                voice_id=voice_id,
                voice_settings=voice_settings,
                audio_blob_path=blob_path,
                audio_url=blob_url,
                audio_duration_seconds=audio_duration_seconds,
                audio_file_size_bytes=len(audio_data),
                hit_count=0,
                expires_at=AudioCache.default_expiration()
            )
            
            db.add(cache_entry)
            await db.commit()
            await db.refresh(cache_entry)
            
            logger.info(f"💾 Stored in L2 cache: {cache_key[:16]}... (size: {len(audio_data)} bytes)")
            return cache_entry
            
        except Exception as e:
            logger.error(f"Error storing cached audio: {e}")
            await db.rollback()
            raise
    
    async def _delete_cache_entry(self, db: AsyncSession, cache_entry: AudioCache) -> bool:
        """
        Delete cache entry from database and blob storage.
        
        Args:
            db: Database session
            cache_entry: Cache entry to delete
            
        Returns:
            bool: True if successful
        """
        try:
            # Delete from blob storage (if configured)
            if self.blob_service.is_configured:
                await self.blob_service.delete_audio(cache_entry.audio_blob_path)
            
            # Delete from database
            await db.delete(cache_entry)
            await db.commit()
            
            logger.info(f"Deleted cache entry: {cache_entry.cache_key[:16]}...")
            return True
            
        except Exception as e:
            logger.error(f"Error deleting cache entry: {e}")
            await db.rollback()
            return False
    
    async def cleanup_expired_cache(self, db: AsyncSession) -> int:
        """
        Clean up expired cache entries.
        
        Args:
            db: Database session
            
        Returns:
            int: Number of entries deleted
        """
        try:
            # Find expired entries
            result = await db.execute(
                select(AudioCache).where(
                    AudioCache.expires_at < datetime.now(timezone.utc)
                )
            )
            expired_entries = result.scalars().all()
            
            deleted_count = 0
            for entry in expired_entries:
                if await self._delete_cache_entry(db, entry):
                    deleted_count += 1
            
            logger.info(f"Cleaned up {deleted_count} expired cache entries")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Error cleaning up expired cache: {e}")
            return 0
    
    async def cleanup_lru_cache(self, db: AsyncSession, tenant_id: UUID, max_entries: int = 1000) -> int:
        """
        Clean up least recently used cache entries for a tenant.
        
        Keeps only the most recent max_entries based on last_accessed_at.
        
        Args:
            db: Database session
            tenant_id: Tenant UUID
            max_entries: Maximum number of entries to keep per tenant
            
        Returns:
            int: Number of entries deleted
        """
        try:
            # Count total entries for tenant
            result = await db.execute(
                select(AudioCache).where(
                    AudioCache.tenant_id == tenant_id
                )
            )
            total_entries = len(result.scalars().all())
            
            if total_entries <= max_entries:
                return 0
            
            # Get LRU entries to delete
            result = await db.execute(
                select(AudioCache)
                .where(AudioCache.tenant_id == tenant_id)
                .order_by(AudioCache.last_accessed_at.asc())
                .limit(total_entries - max_entries)
            )
            lru_entries = result.scalars().all()
            
            deleted_count = 0
            for entry in lru_entries:
                if await self._delete_cache_entry(db, entry):
                    deleted_count += 1
            
            logger.info(f"Cleaned up {deleted_count} LRU cache entries for tenant {tenant_id}")
            return deleted_count
            
        except Exception as e:
            logger.error(f"Error cleaning up LRU cache: {e}")
            return 0
    
    async def get_cache_stats(self, db: AsyncSession, tenant_id: UUID) -> Dict[str, Any]:
        """
        Get cache statistics for a tenant.
        
        Args:
            db: Database session
            tenant_id: Tenant UUID
            
        Returns:
            dict: Cache statistics
        """
        try:
            result = await db.execute(
                select(AudioCache).where(AudioCache.tenant_id == tenant_id)
            )
            entries = result.scalars().all()
            
            total_size_bytes = sum(entry.audio_file_size_bytes or 0 for entry in entries)
            total_hits = sum(entry.hit_count for entry in entries)
            
            return {
                "total_entries": len(entries),
                "total_size_bytes": total_size_bytes,
                "total_size_mb": round(total_size_bytes / (1024 * 1024), 2),
                "total_hits": total_hits,
                "average_hits_per_entry": round(total_hits / len(entries), 2) if entries else 0,
            }
            
        except Exception as e:
            logger.error(f"Error getting cache stats: {e}")
            return {
                "total_entries": 0,
                "total_size_bytes": 0,
                "total_size_mb": 0,
                "total_hits": 0,
                "average_hits_per_entry": 0,
            }


# Tenant-aware singleton registry: (tenant_id, storage_account_name) -> service instance
_cache_service_registry: Dict[tuple, AudioCacheService] = {}
_registry_lock = None  # Will be initialized as asyncio.Lock() when needed


async def get_audio_cache_service(
    tenant_id: UUID,
    blob_service: BlobStorageService,
    settings: Settings
) -> AudioCacheService:
    """
    Get or create tenant-specific AudioCacheService instance (singleton registry pattern).
    
    This implements connection pooling per tenant/storage account combination:
    - Same tenant + same storage account = reuse service instance
    - Different tenant or storage account = create new instance
    
    Args:
        tenant_id: Tenant UUID for cache isolation
        blob_service: Project-specific or global blob storage service
        settings: Application settings
        
    Returns:
        AudioCacheService instance configured for the tenant/storage combination
    """
    global _registry_lock
    
    # Initialize lock on first use
    if _registry_lock is None:
        _registry_lock = asyncio.Lock()
    
    # Create registry key from tenant_id and storage account name
    # Extract account name from blob_service connection string or use default
    storage_key = getattr(blob_service, 'account_name', 'default')
    registry_key = (str(tenant_id), storage_key)
    
    # Check if instance exists (read operation, no lock needed)
    if registry_key in _cache_service_registry:
        return _cache_service_registry[registry_key]
    
    # Create new instance (write operation, needs lock)
    async with _registry_lock:
        # Double-check after acquiring lock (another coroutine might have created it)
        if registry_key not in _cache_service_registry:
            _cache_service_registry[registry_key] = AudioCacheService(blob_service, settings)
            logger.info(f"✨ Created new AudioCacheService instance for tenant {tenant_id}, storage {storage_key}")
        
        return _cache_service_registry[registry_key]
