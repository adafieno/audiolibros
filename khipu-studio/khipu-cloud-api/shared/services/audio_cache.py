"""Audio cache service with two-tier caching (L2: Database + Blob Storage)."""
import logging
import hashlib
import json
from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
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
        voice_settings: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate deterministic cache key from input parameters.
        
        Args:
            text: Text to synthesize
            voice_id: Voice identifier
            voice_settings: Optional voice settings (style, rate, pitch, etc.)
            
        Returns:
            str: SHA256 hash as cache key
        """
        # Create deterministic representation
        cache_input = {
            "text": text,
            "voice_id": voice_id,
            "settings": voice_settings or {}
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
        voice_settings: Optional[Dict[str, Any]] = None
    ) -> Optional[bytes]:
        """
        Get cached audio from L2 cache (Database + Blob).
        
        Args:
            db: Database session
            tenant_id: Tenant UUID
            text: Text that was synthesized
            voice_id: Voice identifier
            voice_settings: Voice settings used
            
        Returns:
            bytes: Audio data if found and not expired, None otherwise
        """
        cache_key = self.generate_cache_key(text, voice_id, voice_settings)
        
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
            if cache_entry.expires_at and cache_entry.expires_at < datetime.utcnow():
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
                    last_accessed_at=datetime.utcnow()
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
        audio_duration_seconds: Optional[float] = None
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
            
        Returns:
            AudioCache: Created cache entry
        """
        cache_key = self.generate_cache_key(text, voice_id, voice_settings)
        
        try:
            # Generate blob path
            blob_path = self.blob_service.generate_blob_path(str(tenant_id), cache_key)
            
            # Upload to blob storage
            blob_url = await self.blob_service.upload_audio(blob_path, audio_data)
            
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
            # Delete from blob storage
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
                    AudioCache.expires_at < datetime.utcnow()
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


# Dependency injection
def get_audio_cache_service(
    blob_service: BlobStorageService,
    settings: Settings
) -> AudioCacheService:
    """Get audio cache service instance."""
    return AudioCacheService(blob_service, settings)
