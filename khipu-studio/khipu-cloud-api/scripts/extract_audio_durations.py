"""
Extract audio duration from existing AudioCache entries.

This script reads audio blobs from Azure storage and extracts duration
using the same logic as the TTS endpoint.
"""
import asyncio
import sys
import os
import wave
import io
import logging

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from shared.config import settings
from shared.models import AudioCache, Project
from shared.services.blob_storage import BlobStorageService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_audio_duration(audio_bytes: bytes) -> float | None:
    """Extract duration from WAV audio data."""
    try:
        with io.BytesIO(audio_bytes) as audio_file:
            with wave.open(audio_file, 'rb') as wav:
                frames = wav.getnframes()
                rate = wav.getframerate()
                duration = frames / float(rate)
                return duration
    except Exception as e:
        logger.warning(f"Failed to extract audio duration: {e}")
        return None


async def extract_durations():
    """Extract duration from all AudioCache entries that have NULL duration."""
    
    # Setup database
    database_url = settings.DATABASE_URL
    engine = create_async_engine(database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        # Get Puntajada project by UUID (title query has encoding/whitespace issues)
        puntajada_id = "bb476fec-2c2d-4bc5-b3b5-25ae502a81f7"
        logger.info(f"🔍 Looking for Puntajada project (ID: {puntajada_id})...")
        result = await db.execute(
            select(Project).where(Project.id == puntajada_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            logger.error(f"❌ Puntajada project not found with ID: {puntajada_id}")
            return
        
        logger.info(f"📦 Project: {project.title}")
        logger.info(f"📋 Settings size: {len(str(project.settings))} characters")
        
        # Setup blob service with project storage settings
        storage_config = project.settings.get("creds", {}).get("storage", {}).get("azure", {})
        
        # Also check for direct storage config (might be at different path)
        if not storage_config and "storage" in project.settings:
            storage_config = project.settings.get("storage", {})
        
        logger.info(f"🔍 Storage config: {storage_config}")
        
        account_name = storage_config.get("accountName") or storage_config.get("storageAccountName")
        access_key = storage_config.get("accessKey") or storage_config.get("storageAccessKey")
        container_name = storage_config.get("containerName", "audios")
        
        if not account_name or not access_key:
            logger.error("❌ No Azure Storage configured in project settings")
            logger.error(f"   Found: accountName={account_name}, accessKey={'***' if access_key else None}")
            return
        
        connection_string = f"DefaultEndpointsProtocol=https;AccountName={account_name};AccountKey={access_key};EndpointSuffix=core.windows.net"
        blob_service = BlobStorageService(settings, connection_string, container_name)
        
        logger.info(f"✅ Connected to Azure Storage: {account_name}/{container_name}")
        # Get all cache entries with NULL duration
        result = await db.execute(
            select(AudioCache).where(AudioCache.audio_duration_seconds.is_(None))
        )
        cache_entries = result.scalars().all()
        
        logger.info(f"📊 Found {len(cache_entries)} audio cache entries without duration")
        
        if not cache_entries:
            logger.info("✅ All audio cache entries already have duration!")
            return
        
        success_count = 0
        error_count = 0
        
        for cache_entry in cache_entries:
            try:
                logger.info(f"📏 Extracting duration for cache_key: {cache_entry.cache_key[:16]}...")
                
                # Download audio blob
                audio_bytes = await blob_service.download_audio(cache_entry.audio_blob_path)
                
                if not audio_bytes:
                    logger.warning(f"⚠️  No audio data found for {cache_entry.cache_key[:16]}")
                    error_count += 1
                    continue
                
                # Extract duration
                duration = get_audio_duration(audio_bytes)
                
                if duration:
                    cache_entry.audio_duration_seconds = duration
                    logger.info(f"✓ Extracted duration: {duration:.2f}s")
                    success_count += 1
                else:
                    logger.warning(f"⚠️  Failed to extract duration for {cache_entry.cache_key[:16]}")
                    error_count += 1
                    
            except Exception as e:
                logger.error(f"❌ Error processing {cache_entry.cache_key[:16]}: {e}")
                error_count += 1
        
        # Commit all changes
        await db.commit()
        
        logger.info("=" * 60)
        logger.info(f"✅ Migration complete!")
        logger.info(f"   Success: {success_count}")
        logger.info(f"   Errors: {error_count}")
        logger.info("=" * 60)


if __name__ == "__main__":
    asyncio.run(extract_durations())
