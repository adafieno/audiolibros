"""
Version manager for packages.

Handles:
- Enforcing max versions per platform (max 3)
- Deduplication (Google/Spotify can share same package)
- Version numbering logic
- Cleanup of old versions when limit reached
"""

from typing import Dict, List, Optional, Tuple
from uuid import UUID
from sqlalchemy import select, and_, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Package
from .platform_configs import can_deduplicate


class VersionManager:
    """Manages package versioning and deduplication logic."""
    
    MAX_VERSIONS_PER_PLATFORM = 3
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_next_version_number(
        self,
        project_id: UUID,
        platform_id: str
    ) -> int:
        """
        Get next version number for a platform.
        
        Returns the next sequential version number (1, 2, 3, etc.)
        """
        
        # Get highest version number for this project/platform
        query = select(func.max(Package.version_number)).where(
            and_(
                Package.project_id == project_id,
                Package.platform_id == platform_id
            )
        )
        
        result = await self.db.execute(query)
        max_version = result.scalar()
        
        return (max_version or 0) + 1
    
    async def enforce_version_limit(
        self,
        project_id: UUID,
        platform_id: str,
        tenant_id: UUID
    ):
        """
        Enforce maximum versions per platform.
        
        If creating a new version would exceed MAX_VERSIONS_PER_PLATFORM,
        delete the oldest version first.
        
        Args:
            project_id: Project ID
            platform_id: Platform ID
            tenant_id: Tenant ID (for security)
        """
        
        # Count existing versions
        count_query = select(func.count(Package.id)).where(
            and_(
                Package.project_id == project_id,
                Package.platform_id == platform_id,
                Package.tenant_id == tenant_id
            )
        )
        
        result = await self.db.execute(count_query)
        version_count = result.scalar() or 0
        
        # If at limit, delete oldest version
        if version_count >= self.MAX_VERSIONS_PER_PLATFORM:
            await self._delete_oldest_version(project_id, platform_id, tenant_id)
    
    async def _delete_oldest_version(
        self,
        project_id: UUID,
        platform_id: str,
        tenant_id: UUID
    ):
        """Delete the oldest package version for a platform."""
        
        # Find oldest version
        oldest_query = select(Package).where(
            and_(
                Package.project_id == project_id,
                Package.platform_id == platform_id,
                Package.tenant_id == tenant_id
            )
        ).order_by(Package.version_number.asc()).limit(1)
        
        result = await self.db.execute(oldest_query)
        oldest_package = result.scalar_one_or_none()
        
        if oldest_package:
            # Delete blob from storage
            # TODO: Integrate with BlobStorageService
            # await blob_service.delete_blob(oldest_package.blob_container, oldest_package.blob_path)
            
            # Delete package record
            await self.db.delete(oldest_package)
            await self.db.commit()
    
    async def check_deduplication_opportunity(
        self,
        project_id: UUID,
        platform_id: str,
        audio_spec: Dict
    ) -> Optional[UUID]:
        """
        Check if we can deduplicate with an existing package.
        
        For example, if Google and Spotify both use 256kbps MP3,
        we can create a package entry pointing to the same blob.
        
        Args:
            project_id: Project ID
            platform_id: Platform ID being created
            audio_spec: Audio specification dict
        
        Returns:
            Package ID to reference if deduplication possible, else None
        """
        
        # Get all existing packages for this project
        existing_query = select(Package).where(
            Package.project_id == project_id
        )
        
        result = await self.db.execute(existing_query)
        existing_packages = list(result.scalars().all())
        
        # Check each existing package for deduplication opportunity
        for existing_pkg in existing_packages:
            # Check if platforms can deduplicate
            if not can_deduplicate(platform_id, existing_pkg.platform_id):
                continue
            
            # Check if audio specs match
            if existing_pkg.audio_spec == audio_spec:
                # Can reuse this package's blob
                return existing_pkg.id
        
        return None
    
    async def get_package_versions(
        self,
        project_id: UUID,
        platform_id: str,
        tenant_id: UUID
    ) -> List[Package]:
        """
        Get all versions of packages for a platform.
        
        Returns packages ordered by version_number descending (newest first).
        """
        
        query = select(Package).where(
            and_(
                Package.project_id == project_id,
                Package.platform_id == platform_id,
                Package.tenant_id == tenant_id
            )
        ).order_by(Package.version_number.desc())
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def get_latest_package(
        self,
        project_id: UUID,
        platform_id: str,
        tenant_id: UUID
    ) -> Optional[Package]:
        """Get the latest version of a package for a platform."""
        
        query = select(Package).where(
            and_(
                Package.project_id == project_id,
                Package.platform_id == platform_id,
                Package.tenant_id == tenant_id
            )
        ).order_by(Package.version_number.desc()).limit(1)
        
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def delete_all_versions(
        self,
        project_id: UUID,
        platform_id: str,
        tenant_id: UUID
    ) -> int:
        """
        Delete all versions of packages for a platform.
        
        Used when user wants to completely remove a platform's packages.
        
        Returns:
            Number of packages deleted
        """
        
        # Get all packages to delete blobs
        packages = await self.get_package_versions(project_id, platform_id, tenant_id)
        
        # Delete blobs from storage
        for package in packages:
            # TODO: Integrate with BlobStorageService
            # await blob_service.delete_blob(package.blob_container, package.blob_path)
            pass
        
        # Delete package records
        delete_query = delete(Package).where(
            and_(
                Package.project_id == project_id,
                Package.platform_id == platform_id,
                Package.tenant_id == tenant_id
            )
        )
        
        result = await self.db.execute(delete_query)
        await self.db.commit()
        
        return result.rowcount
    
    async def get_version_summary(
        self,
        project_id: UUID,
        tenant_id: UUID
    ) -> Dict[str, Dict]:
        """
        Get summary of all package versions across platforms.
        
        Returns:
            {
                "apple": {
                    "version_count": 2,
                    "latest_version": 2,
                    "total_size_mb": 150.5,
                    "latest_created_at": datetime(...)
                },
                "google": {...},
                ...
            }
        """
        
        # Get all packages for project
        query = select(Package).where(
            and_(
                Package.project_id == project_id,
                Package.tenant_id == tenant_id
            )
        )
        
        result = await self.db.execute(query)
        packages = list(result.scalars().all())
        
        # Group by platform
        summary = {}
        
        for package in packages:
            platform_id = package.platform_id
            
            if platform_id not in summary:
                summary[platform_id] = {
                    "version_count": 0,
                    "latest_version": 0,
                    "total_size_mb": 0.0,
                    "latest_created_at": None
                }
            
            summary[platform_id]["version_count"] += 1
            summary[platform_id]["latest_version"] = max(
                summary[platform_id]["latest_version"],
                package.version_number
            )
            summary[platform_id]["total_size_mb"] += package.size_bytes / (1024 * 1024) if package.size_bytes else 0
            
            if (summary[platform_id]["latest_created_at"] is None or 
                package.created_at > summary[platform_id]["latest_created_at"]):
                summary[platform_id]["latest_created_at"] = package.created_at
        
        return summary
    
    async def can_create_new_version(
        self,
        project_id: UUID,
        platform_id: str,
        tenant_id: UUID
    ) -> Tuple[bool, Optional[str]]:
        """
        Check if a new version can be created.
        
        Returns:
            (can_create: bool, reason: Optional[str])
        """
        
        # Count existing versions
        count_query = select(func.count(Package.id)).where(
            and_(
                Package.project_id == project_id,
                Package.platform_id == platform_id,
                Package.tenant_id == tenant_id
            )
        )
        
        result = await self.db.execute(count_query)
        version_count = result.scalar() or 0
        
        # Check if at limit
        if version_count >= self.MAX_VERSIONS_PER_PLATFORM:
            # Can still create (will auto-delete oldest), but warn user
            return (
                True,
                f"Creating new version will delete oldest version (limit: {self.MAX_VERSIONS_PER_PLATFORM})"
            )
        
        return (True, None)
    
    async def mark_as_deduplicated(
        self,
        package_id: UUID,
        same_as_package_id: UUID
    ):
        """
        Mark a package as deduplicated (referencing another package's blob).
        
        Args:
            package_id: Package to mark as deduplicated
            same_as_package_id: Package whose blob is being referenced
        """
        
        query = select(Package).where(Package.id == package_id)
        result = await self.db.execute(query)
        package = result.scalar_one_or_none()
        
        if not package:
            raise ValueError(f"Package {package_id} not found")
        
        # Update same_as_package_id to reference the other package
        package.same_as_package_id = same_as_package_id
        
        # Copy blob path from referenced package
        ref_query = select(Package).where(Package.id == same_as_package_id)
        ref_result = await self.db.execute(ref_query)
        ref_package = ref_result.scalar_one_or_none()
        
        if ref_package:
            package.blob_path = ref_package.blob_path
            package.blob_container = ref_package.blob_container
            package.size_bytes = ref_package.size_bytes
        
        await self.db.commit()
