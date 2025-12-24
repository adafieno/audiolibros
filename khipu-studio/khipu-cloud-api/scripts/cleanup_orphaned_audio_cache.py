#!/usr/bin/env python3
"""
Cleanup Orphaned Audio Cache Entries

This script identifies and removes orphaned audio cache entries that are no longer
accessible due to cache key changes (e.g., when pause configuration support was added).

Orphaned entries are identified as:
1. Cache entries not accessed in X days (default: 30 days)
2. Cache entries with hit_count = 0 and created > X days ago

The script can run in two modes:
- Dry-run mode (default): Shows what would be deleted without making changes
- Execute mode: Actually deletes the orphaned entries from database and blob storage

Usage:
    # Dry-run mode (safe, shows what would be deleted)
    python scripts/cleanup_orphaned_audio_cache.py
    
    # Execute mode (actually deletes entries)
    python scripts/cleanup_orphaned_audio_cache.py --execute
    
    # Custom threshold (45 days)
    python scripts/cleanup_orphaned_audio_cache.py --days 45
    
    # Filter by tenant
    python scripts/cleanup_orphaned_audio_cache.py --tenant-id <UUID> --execute
"""

import asyncio
import argparse
import sys
import os
from datetime import datetime, timezone, timedelta
from uuid import UUID
from typing import Optional

# Add parent directory to path for imports
script_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(script_dir)
sys.path.insert(0, parent_dir)

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.database import AsyncSessionLocal
from shared.models import AudioCache
from shared.services.blob_storage import BlobStorageService
from shared.config import get_settings

import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def find_orphaned_entries(
    db: AsyncSession,
    days_threshold: int,
    tenant_id: Optional[UUID] = None
) -> list[AudioCache]:
    """
    Find orphaned cache entries based on last access time.
    
    Args:
        db: Database session
        days_threshold: Number of days since last access to consider orphaned
        tenant_id: Optional tenant ID to filter by
    
    Returns:
        List of orphaned AudioCache entries
    """
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_threshold)
    
    logger.info(f"🔍 Finding cache entries not accessed since {cutoff_date.isoformat()}")
    
    # Build query
    query = select(AudioCache).where(
        # Not accessed in X days OR never accessed and created > X days ago
        and_(
            AudioCache.created_at < cutoff_date,
            (
                (AudioCache.last_accessed_at < cutoff_date) |
                (AudioCache.last_accessed_at.is_(None))
            )
        )
    )
    
    # Filter by tenant if specified
    if tenant_id:
        query = query.where(AudioCache.tenant_id == tenant_id)
        logger.info(f"🔒 Filtering by tenant_id: {tenant_id}")
    
    # Order by oldest first
    query = query.order_by(AudioCache.created_at.asc())
    
    result = await db.execute(query)
    entries = result.scalars().all()
    
    logger.info(f"📊 Found {len(entries)} orphaned cache entries")
    
    return entries


async def calculate_storage_impact(entries: list[AudioCache]) -> dict:
    """Calculate the storage impact of deleting these entries."""
    total_size = sum(entry.audio_file_size_bytes or 0 for entry in entries)
    total_size_mb = total_size / (1024 * 1024)
    total_size_gb = total_size_mb / 1024
    
    # Count entries by tenant
    tenant_counts = {}
    for entry in entries:
        tenant_id = str(entry.tenant_id)
        tenant_counts[tenant_id] = tenant_counts.get(tenant_id, 0) + 1
    
    return {
        "total_entries": len(entries),
        "total_size_bytes": total_size,
        "total_size_mb": round(total_size_mb, 2),
        "total_size_gb": round(total_size_gb, 3),
        "tenant_counts": tenant_counts
    }


async def delete_cache_entry(
    db: AsyncSession,
    blob_service: BlobStorageService,
    entry: AudioCache,
    dry_run: bool = True
) -> bool:
    """
    Delete a single cache entry from database and blob storage.
    
    Args:
        db: Database session
        blob_service: Blob storage service
        entry: Cache entry to delete
        dry_run: If True, only log what would be deleted
    
    Returns:
        True if successful (or would be successful in dry-run mode)
    """
    try:
        if dry_run:
            logger.info(
                f"[DRY-RUN] Would delete cache entry: {entry.cache_key[:16]}... "
                f"(tenant: {entry.tenant_id}, size: {entry.audio_file_size_bytes or 0} bytes, "
                f"created: {entry.created_at}, last_accessed: {entry.last_accessed_at})"
            )
            return True
        
        # Delete from blob storage first
        if entry.audio_blob_path and blob_service.is_configured:
            try:
                await blob_service.delete_audio(entry.audio_blob_path)
                logger.info(f"✅ Deleted blob: {entry.audio_blob_path}")
            except Exception as e:
                logger.warning(f"⚠️  Failed to delete blob {entry.audio_blob_path}: {e}")
        
        # Delete from database
        await db.delete(entry)
        logger.info(
            f"✅ Deleted cache entry: {entry.cache_key[:16]}... "
            f"(tenant: {entry.tenant_id}, size: {entry.audio_file_size_bytes or 0} bytes)"
        )
        
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to delete cache entry {entry.cache_key[:16]}...: {e}")
        return False


async def cleanup_orphaned_cache(
    days_threshold: int = 30,
    tenant_id: Optional[UUID] = None,
    dry_run: bool = True
):
    """
    Main cleanup function.
    
    Args:
        days_threshold: Number of days since last access to consider orphaned
        tenant_id: Optional tenant ID to filter by
        dry_run: If True, only show what would be deleted
    """
    settings = get_settings()
    
    logger.info("=" * 80)
    logger.info("🧹 Audio Cache Cleanup Script")
    logger.info("=" * 80)
    logger.info(f"Mode: {'DRY-RUN (safe, no changes)' if dry_run else 'EXECUTE (will delete entries)'}")
    logger.info(f"Days threshold: {days_threshold}")
    if tenant_id:
        logger.info(f"Tenant filter: {tenant_id}")
    logger.info("=" * 80)
    
    # Initialize blob storage service
    blob_service = BlobStorageService(settings)
    if not blob_service.is_configured:
        logger.warning("⚠️  Blob storage not configured - will only delete database entries")
    
    # Create database session
    async with AsyncSessionLocal() as db:
        # Find orphaned entries
        entries = await find_orphaned_entries(db, days_threshold, tenant_id)
        
        if not entries:
            logger.info("✅ No orphaned cache entries found")
            return
        
        # Calculate impact
        impact = await calculate_storage_impact(entries)
        
        logger.info("")
        logger.info("📊 Storage Impact:")
        logger.info(f"   Total entries: {impact['total_entries']}")
        logger.info(f"   Total size: {impact['total_size_gb']} GB ({impact['total_size_mb']} MB)")
        logger.info(f"   Tenants affected: {len(impact['tenant_counts'])}")
        for tenant_id, count in impact['tenant_counts'].items():
            logger.info(f"      - {tenant_id}: {count} entries")
        logger.info("")
        
        if dry_run:
            logger.info("=" * 80)
            logger.info("🔍 DRY-RUN MODE - Showing entries that would be deleted:")
            logger.info("=" * 80)
        else:
            logger.info("=" * 80)
            logger.info("⚠️  EXECUTE MODE - Deleting entries...")
            logger.info("=" * 80)
        
        # Delete entries
        success_count = 0
        fail_count = 0
        
        for i, entry in enumerate(entries, 1):
            logger.info(f"[{i}/{len(entries)}] Processing cache entry...")
            
            success = await delete_cache_entry(db, blob_service, entry, dry_run)
            
            if success:
                success_count += 1
            else:
                fail_count += 1
        
        # Commit changes if not dry-run
        if not dry_run:
            await db.commit()
            logger.info("✅ Database changes committed")
        
        # Summary
        logger.info("")
        logger.info("=" * 80)
        logger.info("📊 Cleanup Summary:")
        logger.info("=" * 80)
        logger.info(f"Total entries processed: {len(entries)}")
        logger.info(f"Successful: {success_count}")
        if fail_count > 0:
            logger.info(f"Failed: {fail_count}")
        if dry_run:
            logger.info("")
            logger.info("ℹ️  This was a DRY-RUN. No changes were made.")
            logger.info("   To actually delete these entries, run with --execute flag")
        else:
            logger.info("")
            logger.info(f"✅ Successfully cleaned up {success_count} orphaned cache entries")
            logger.info(f"   Freed up approximately {impact['total_size_gb']} GB of storage")
        logger.info("=" * 80)


def main():
    """Parse arguments and run cleanup."""
    parser = argparse.ArgumentParser(
        description="Cleanup orphaned audio cache entries",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    parser.add_argument(
        "--days",
        type=int,
        default=30,
        help="Number of days since last access to consider entry orphaned (default: 30)"
    )
    
    parser.add_argument(
        "--tenant-id",
        type=str,
        help="Filter by specific tenant UUID"
    )
    
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually delete entries (default is dry-run mode)"
    )
    
    args = parser.parse_args()
    
    # Parse tenant_id if provided
    tenant_id = None
    if args.tenant_id:
        try:
            tenant_id = UUID(args.tenant_id)
        except ValueError:
            logger.error(f"❌ Invalid tenant UUID: {args.tenant_id}")
            sys.exit(1)
    
    # Run cleanup
    asyncio.run(cleanup_orphaned_cache(
        days_threshold=args.days,
        tenant_id=tenant_id,
        dry_run=not args.execute
    ))


if __name__ == "__main__":
    main()
