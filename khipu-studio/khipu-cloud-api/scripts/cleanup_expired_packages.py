"""
Background job to cleanup expired packages.

This script should be run periodically (e.g., daily via cron job) to:
1. Delete expired temp packages (24h TTL)
2. Delete expired archived packages (per tenant retention policy)
3. Remove corresponding blobs from Azure Blob Storage
"""
import asyncio
import logging
from datetime import datetime
from typing import List
from uuid import UUID

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.database import AsyncSessionLocal
from shared.models.package import Package
from shared.services.blob_storage import BlobStorageService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def get_expired_packages(db: AsyncSession) -> List[Package]:
    """
    Get all packages that have expired.
    
    Returns packages where expires_at < now()
    """
    stmt = select(Package).where(
        and_(
            Package.expires_at.isnot(None),
            Package.expires_at < datetime.utcnow()
        )
    )
    result = await db.execute(stmt)
    packages = result.scalars().all()
    return list(packages)


async def delete_package_blob(package: Package, blob_service: BlobStorageService) -> bool:
    """
    Delete package blob from Azure Blob Storage.
    
    Args:
        package: Package model with blob_path and blob_container
        blob_service: BlobStorageService instance
        
    Returns:
        True if deleted successfully, False otherwise
    """
    try:
        await blob_service.delete_blob(
            container_name=package.blob_container,
            blob_name=package.blob_path
        )
        logger.info(f"Deleted blob: {package.blob_container}/{package.blob_path}")
        return True
    except Exception as e:
        logger.error(f"Failed to delete blob for package {package.id}: {e}")
        return False


async def cleanup_expired_packages(dry_run: bool = False) -> dict:
    """
    Main cleanup function.
    
    Args:
        dry_run: If True, only report what would be deleted without deleting
        
    Returns:
        Dictionary with cleanup statistics
    """
    stats = {
        "total_expired": 0,
        "blobs_deleted": 0,
        "packages_deleted": 0,
        "errors": 0,
        "storage_freed_mb": 0.0
    }
    
    async with AsyncSessionLocal() as db:
        # Get expired packages
        expired_packages = await get_expired_packages(db)
        stats["total_expired"] = len(expired_packages)
        
        if stats["total_expired"] == 0:
            logger.info("No expired packages found")
            return stats
        
        logger.info(f"Found {stats['total_expired']} expired packages")
        
        # Initialize blob storage service
        blob_service = BlobStorageService()
        
        for package in expired_packages:
            logger.info(
                f"Processing package {package.id}: "
                f"platform={package.platform_id}, "
                f"tier={package.storage_tier}, "
                f"expired={package.expires_at}"
            )
            
            # Calculate storage to be freed
            storage_mb = package.file_size_bytes / (1024 * 1024)
            
            if dry_run:
                logger.info(f"[DRY RUN] Would delete package {package.id} ({storage_mb:.2f} MB)")
                stats["blobs_deleted"] += 1
                stats["packages_deleted"] += 1
                stats["storage_freed_mb"] += storage_mb
            else:
                # Delete blob from storage
                blob_deleted = await delete_package_blob(package, blob_service)
                
                if blob_deleted:
                    stats["blobs_deleted"] += 1
                    stats["storage_freed_mb"] += storage_mb
                    
                    # Delete package record from database
                    try:
                        await db.delete(package)
                        await db.commit()
                        stats["packages_deleted"] += 1
                        logger.info(f"Deleted package {package.id} from database")
                    except Exception as e:
                        logger.error(f"Failed to delete package {package.id} from database: {e}")
                        await db.rollback()
                        stats["errors"] += 1
                else:
                    stats["errors"] += 1
    
    # Log summary
    logger.info("=" * 60)
    logger.info("Cleanup Summary:")
    logger.info(f"  Total expired packages: {stats['total_expired']}")
    logger.info(f"  Blobs deleted: {stats['blobs_deleted']}")
    logger.info(f"  Database records deleted: {stats['packages_deleted']}")
    logger.info(f"  Storage freed: {stats['storage_freed_mb']:.2f} MB")
    logger.info(f"  Errors: {stats['errors']}")
    logger.info("=" * 60)
    
    return stats


async def cleanup_by_tenant(tenant_id: UUID, dry_run: bool = False) -> dict:
    """
    Cleanup expired packages for a specific tenant.
    
    Args:
        tenant_id: Tenant UUID
        dry_run: If True, only report what would be deleted
        
    Returns:
        Dictionary with cleanup statistics
    """
    stats = {
        "total_expired": 0,
        "blobs_deleted": 0,
        "packages_deleted": 0,
        "errors": 0,
        "storage_freed_mb": 0.0
    }
    
    async with AsyncSessionLocal() as db:
        # Get expired packages for tenant
        stmt = select(Package).where(
            and_(
                Package.tenant_id == tenant_id,
                Package.expires_at.isnot(None),
                Package.expires_at < datetime.utcnow()
            )
        )
        result = await db.execute(stmt)
        expired_packages = result.scalars().all()
        stats["total_expired"] = len(expired_packages)
        
        if stats["total_expired"] == 0:
            logger.info(f"No expired packages found for tenant {tenant_id}")
            return stats
        
        logger.info(f"Found {stats['total_expired']} expired packages for tenant {tenant_id}")
        
        blob_service = BlobStorageService()
        
        for package in expired_packages:
            storage_mb = package.file_size_bytes / (1024 * 1024)
            
            if dry_run:
                logger.info(f"[DRY RUN] Would delete package {package.id} ({storage_mb:.2f} MB)")
                stats["blobs_deleted"] += 1
                stats["packages_deleted"] += 1
                stats["storage_freed_mb"] += storage_mb
            else:
                blob_deleted = await delete_package_blob(package, blob_service)
                
                if blob_deleted:
                    stats["blobs_deleted"] += 1
                    stats["storage_freed_mb"] += storage_mb
                    
                    try:
                        await db.delete(package)
                        await db.commit()
                        stats["packages_deleted"] += 1
                    except Exception as e:
                        logger.error(f"Failed to delete package {package.id}: {e}")
                        await db.rollback()
                        stats["errors"] += 1
                else:
                    stats["errors"] += 1
    
    logger.info(f"Tenant {tenant_id} cleanup: {stats}")
    return stats


if __name__ == "__main__":
    import sys
    
    # Parse command line arguments
    dry_run = "--dry-run" in sys.argv or "-n" in sys.argv
    tenant_id_arg = None
    
    for i, arg in enumerate(sys.argv):
        if arg == "--tenant-id" and i + 1 < len(sys.argv):
            try:
                tenant_id_arg = UUID(sys.argv[i + 1])
            except ValueError:
                logger.error(f"Invalid tenant ID: {sys.argv[i + 1]}")
                sys.exit(1)
    
    if dry_run:
        logger.info("Running in DRY RUN mode - no data will be deleted")
    
    # Run cleanup
    if tenant_id_arg:
        logger.info(f"Running cleanup for tenant: {tenant_id_arg}")
        stats = asyncio.run(cleanup_by_tenant(tenant_id_arg, dry_run=dry_run))
    else:
        logger.info("Running cleanup for all tenants")
        stats = asyncio.run(cleanup_expired_packages(dry_run=dry_run))
    
    # Exit with error code if there were errors
    sys.exit(1 if stats["errors"] > 0 else 0)
