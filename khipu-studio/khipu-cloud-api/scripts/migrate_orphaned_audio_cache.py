"""
One-time migration script to link orphaned AudioCache entries to AudioSegmentMetadata.

Problem: Some segments have cached audio in AudioCache but no AudioSegmentMetadata records,
or metadata records with NULL raw_audio_cache_key. This causes durations to show as 00:00
and has_audio to be False.

This script:
1. Finds all AudioSegmentMetadata records with NULL raw_audio_cache_key
2. For each one, generates the cache key from the segment data in ChapterPlan
3. Looks up the matching AudioCache entry
4. Updates the metadata with the cache key and duration

Run this ONCE to fix the data, then remove it.
"""

import asyncio
import hashlib
import json
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# Import models
import sys
sys.path.append('/app')

from shared.models.audio_cache import AudioCache
from shared.models.audio_segment_metadata import AudioSegmentMetadata
from shared.models.plan import ChapterPlan
from shared.config import settings


def generate_cache_key(text: str, voice_id: str, voice_settings: dict) -> str:
    """Generate cache key matching AudioCacheService logic"""
    # Normalize voice settings
    normalized_settings = {
        k: v for k, v in sorted(voice_settings.items())
        if v is not None
    }
    
    # Create composite key
    key_parts = [
        text.strip(),
        voice_id,
        json.dumps(normalized_settings, sort_keys=True)
    ]
    composite = "|".join(key_parts)
    
    # Generate SHA256 hash
    return hashlib.sha256(composite.encode('utf-8')).hexdigest()


async def migrate_orphaned_cache_entries():
    """Main migration function"""
    # Create async engine
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as session:
        print("🔍 Finding metadata records with NULL cache keys...")
        
        # Find all metadata with NULL raw_audio_cache_key
        result = await session.execute(
            select(AudioSegmentMetadata).where(
                AudioSegmentMetadata.raw_audio_cache_key.is_(None)
            )
        )
        orphaned_metadata = result.scalars().all()
        
        print(f"📊 Found {len(orphaned_metadata)} orphaned metadata records")
        
        if not orphaned_metadata:
            print("✅ No orphaned metadata found. Migration not needed.")
            return
        
        # Group by project/chapter to load plans efficiently
        by_chapter = {}
        for metadata in orphaned_metadata:
            key = (metadata.project_id, metadata.chapter_id)
            if key not in by_chapter:
                by_chapter[key] = []
            by_chapter[key].append(metadata)
        
        total_fixed = 0
        total_not_found = 0
        
        # Process each chapter
        for (project_id, chapter_id), metadata_list in by_chapter.items():
            print(f"\n📁 Processing chapter {chapter_id} in project {project_id}")
            
            # Load chapter plan to get segment data
            # Note: chapter_id might be stored as string (e.g., '0') not UUID
            plan_result = await session.execute(
                select(ChapterPlan).where(
                    and_(
                        ChapterPlan.project_id == project_id,
                        ChapterPlan.chapter_id == str(chapter_id)  # Convert to string for comparison
                    )
                )
            )
            plan = plan_result.scalar_one_or_none()
            
            if not plan:
                print(f"  ⚠️  No plan found for chapter {chapter_id}")
                continue
            
            # Extract segments from plan
            if isinstance(plan.segments, dict):
                plan_segments = plan.segments.get('segments', [])
            elif isinstance(plan.segments, list):
                plan_segments = plan.segments
            else:
                plan_segments = []
            
            # Build segment lookup
            segment_lookup = {seg.get('id'): seg for seg in plan_segments if seg.get('id')}
            
            # Process each orphaned metadata
            for metadata in metadata_list:
                segment_data = segment_lookup.get(metadata.segment_id)
                
                if not segment_data:
                    print(f"  ⚠️  No segment data found for {metadata.segment_id}")
                    total_not_found += 1
                    continue
                
                # Generate cache key
                text = segment_data.get('text', '')
                voice = segment_data.get('voice', '')
                cache_key = generate_cache_key(text, voice, {})
                
                # Look up cache entry
                cache_result = await session.execute(
                    select(AudioCache).where(
                        AudioCache.cache_key == cache_key
                    )
                )
                cache_entry = cache_result.scalar_one_or_none()
                
                if cache_entry:
                    # Update metadata
                    metadata.raw_audio_cache_key = cache_key
                    metadata.duration_seconds = cache_entry.audio_duration_seconds
                    print(f"  ✅ Fixed segment {metadata.segment_id}: duration={cache_entry.audio_duration_seconds}s")
                    total_fixed += 1
                else:
                    print(f"  ❌ No cache entry found for segment {metadata.segment_id}")
                    total_not_found += 1
        
        # Commit all changes
        await session.commit()
        
        print(f"\n{'='*60}")
        print(f"✅ Migration complete!")
        print(f"   Fixed: {total_fixed} segments")
        print(f"   Not found: {total_not_found} segments")
        print(f"{'='*60}")


if __name__ == "__main__":
    asyncio.run(migrate_orphaned_cache_entries())
