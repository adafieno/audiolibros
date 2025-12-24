"""
Storage tier manager for packages.

Handles:
- Moving packages between temp and archive tiers
- Setting expiration dates based on tier
- Calculating storage quota usage
- Enforcing tenant storage limits
"""

from typing import Dict, Optional
from uuid import UUID
from datetime import datetime, timedelta, UTC
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Package, Tenant


class StorageTier:
    """Storage tier constants."""
    TEMP = "temp"
    ARCHIVE = "archive"


class StorageTierManager:
    """Manages package storage tiers and quotas."""
    
    # Retention periods by tier (in days)
    TEMP_RETENTION_DAYS = 1  # 24 hours
    
    # Archive retention by tenant plan (placeholder - would come from tenant.plan)
    ARCHIVE_RETENTION_BY_PLAN = {
        "free": 7,
        "basic": 30,
        "pro": 90,
        "enterprise": 365
    }
    
    # Storage limits by plan (in MB)
    STORAGE_LIMIT_BY_PLAN = {
        "free": 1024,      # 1 GB
        "basic": 10240,    # 10 GB
        "pro": 51200,      # 50 GB
        "enterprise": 512000  # 500 GB
    }
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create_temp_package(
        self,
        package: Package
    ) -> Package:
        """
        Set package as temp tier with expiration.
        
        Args:
            package: Package to configure as temp
        
        Returns:
            Updated package
        """
        
        package.storage_tier = StorageTier.TEMP
        package.expires_at = datetime.now(UTC) + timedelta(days=self.TEMP_RETENTION_DAYS)
        
        await self.db.commit()
        await self.db.refresh(package)
        
        return package
    
    async def archive_package(
        self,
        package_id: UUID,
        tenant_id: UUID
    ) -> Package:
        """
        Move package from temp to archive tier.
        
        This requires explicit user action and:
        - Changes storage_tier to 'archive'
        - Sets expiration based on tenant plan
        - Counts toward storage quota
        
        Args:
            package_id: Package to archive
            tenant_id: Tenant ID (for security and plan lookup)
        
        Returns:
            Updated package
        
        Raises:
            ValueError: If package not found or quota exceeded
        """
        
        # Get package
        query = select(Package).where(
            and_(
                Package.id == package_id,
                Package.tenant_id == tenant_id
            )
        )
        result = await self.db.execute(query)
        package = result.scalar_one_or_none()
        
        if not package:
            raise ValueError(f"Package {package_id} not found")
        
        # Check if already archived
        if package.storage_tier == StorageTier.ARCHIVE:
            return package
        
        # Check storage quota
        quota_check = await self.check_storage_quota(tenant_id)
        package_size_mb = (package.size_bytes or 0) / (1024 * 1024)
        
        if quota_check["available_mb"] < package_size_mb:
            raise ValueError(
                f"Insufficient storage quota. Need {package_size_mb:.2f}MB, "
                f"have {quota_check['available_mb']:.2f}MB available"
            )
        
        # Get tenant plan for retention period
        tenant = await self._get_tenant(tenant_id)
        retention_days = self.ARCHIVE_RETENTION_BY_PLAN.get(
            tenant.plan if tenant and tenant.plan else "free",
            7  # Default to 7 days
        )
        
        # Update package
        package.storage_tier = StorageTier.ARCHIVE
        package.expires_at = datetime.now(UTC) + timedelta(days=retention_days)
        
        await self.db.commit()
        await self.db.refresh(package)
        
        return package
    
    async def check_storage_quota(
        self,
        tenant_id: UUID
    ) -> Dict[str, float]:
        """
        Check tenant's storage quota usage.
        
        Only counts packages in 'archive' tier.
        Temp packages don't count toward quota.
        
        Returns:
            {
                "used_mb": float,
                "limit_mb": float,
                "available_mb": float,
                "percentage_used": float
            }
        """
        
        # Get tenant plan
        tenant = await self._get_tenant(tenant_id)
        plan = tenant.plan if (tenant and tenant.plan) else "free"
        limit_mb = self.STORAGE_LIMIT_BY_PLAN.get(plan, 1024)
        
        # Calculate used storage (only archive tier)
        used_query = select(func.sum(Package.size_bytes)).where(
            and_(
                Package.tenant_id == tenant_id,
                Package.storage_tier == StorageTier.ARCHIVE
            )
        )
        
        result = await self.db.execute(used_query)
        used_bytes = result.scalar() or 0
        used_mb = used_bytes / (1024 * 1024)
        
        available_mb = max(0, limit_mb - used_mb)
        percentage_used = (used_mb / limit_mb * 100) if limit_mb > 0 else 0
        
        return {
            "used_mb": round(used_mb, 2),
            "limit_mb": limit_mb,
            "available_mb": round(available_mb, 2),
            "percentage_used": round(percentage_used, 2)
        }
    
    async def get_package_count_by_tier(
        self,
        tenant_id: UUID
    ) -> Dict[str, int]:
        """
        Get count of packages by storage tier.
        
        Returns:
            {
                "temp": int,
                "archive": int,
                "total": int
            }
        """
        
        # Count temp packages
        temp_query = select(func.count(Package.id)).where(
            and_(
                Package.tenant_id == tenant_id,
                Package.storage_tier == StorageTier.TEMP
            )
        )
        temp_result = await self.db.execute(temp_query)
        temp_count = temp_result.scalar() or 0
        
        # Count archive packages
        archive_query = select(func.count(Package.id)).where(
            and_(
                Package.tenant_id == tenant_id,
                Package.storage_tier == StorageTier.ARCHIVE
            )
        )
        archive_result = await self.db.execute(archive_query)
        archive_count = archive_result.scalar() or 0
        
        return {
            "temp": temp_count,
            "archive": archive_count,
            "total": temp_count + archive_count
        }
    
    async def extend_archive_expiration(
        self,
        package_id: UUID,
        tenant_id: UUID,
        additional_days: int = 30
    ) -> Package:
        """
        Extend expiration date for an archived package.
        
        Useful if user wants to keep a package longer.
        
        Args:
            package_id: Package to extend
            tenant_id: Tenant ID (for security)
            additional_days: Days to add to current expiration
        
        Returns:
            Updated package
        """
        
        query = select(Package).where(
            and_(
                Package.id == package_id,
                Package.tenant_id == tenant_id,
                Package.storage_tier == StorageTier.ARCHIVE
            )
        )
        result = await self.db.execute(query)
        package = result.scalar_one_or_none()
        
        if not package:
            raise ValueError(f"Archived package {package_id} not found")
        
        # Extend expiration
        if package.expires_at:
            package.expires_at = package.expires_at + timedelta(days=additional_days)
        else:
            package.expires_at = datetime.now(UTC) + timedelta(days=additional_days)
        
        await self.db.commit()
        await self.db.refresh(package)
        
        return package
    
    async def downgrade_to_temp(
        self,
        package_id: UUID,
        tenant_id: UUID
    ) -> Package:
        """
        Move package from archive back to temp tier.
        
        This frees up quota space but reduces retention to 24 hours.
        
        Args:
            package_id: Package to downgrade
            tenant_id: Tenant ID (for security)
        
        Returns:
            Updated package
        """
        
        query = select(Package).where(
            and_(
                Package.id == package_id,
                Package.tenant_id == tenant_id
            )
        )
        result = await self.db.execute(query)
        package = result.scalar_one_or_none()
        
        if not package:
            raise ValueError(f"Package {package_id} not found")
        
        # Update to temp tier
        package.storage_tier = StorageTier.TEMP
        package.expires_at = datetime.now(UTC) + timedelta(days=self.TEMP_RETENTION_DAYS)
        
        await self.db.commit()
        await self.db.refresh(package)
        
        return package
    
    async def get_expiring_soon(
        self,
        tenant_id: UUID,
        days_threshold: int = 7
    ) -> list[Package]:
        """
        Get packages expiring within a certain number of days.
        
        Useful for sending expiration warnings to users.
        
        Args:
            tenant_id: Tenant ID
            days_threshold: Number of days to look ahead
        
        Returns:
            List of packages expiring soon
        """
        
        cutoff_date = datetime.now(UTC) + timedelta(days=days_threshold)
        
        query = select(Package).where(
            and_(
                Package.tenant_id == tenant_id,
                Package.expires_at.isnot(None),
                Package.expires_at <= cutoff_date,
                Package.expires_at > datetime.now(UTC)  # Not already expired
            )
        ).order_by(Package.expires_at)
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def _get_tenant(self, tenant_id: UUID) -> Optional[Tenant]:
        """Get tenant record for plan lookup."""
        query = select(Tenant).where(Tenant.id == tenant_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()
    
    async def get_storage_stats(
        self,
        tenant_id: UUID
    ) -> Dict[str, any]:
        """
        Get comprehensive storage statistics for a tenant.
        
        Returns:
            {
                "quota": {...},  # From check_storage_quota
                "package_count": {...},  # From get_package_count_by_tier
                "expiring_soon_count": int,
                "largest_packages": List[Dict],
                "oldest_packages": List[Dict]
            }
        """
        
        quota = await self.check_storage_quota(tenant_id)
        package_count = await self.get_package_count_by_tier(tenant_id)
        expiring_soon = await self.get_expiring_soon(tenant_id, days_threshold=7)
        
        # Get largest packages (top 5)
        largest_query = select(Package).where(
            and_(
                Package.tenant_id == tenant_id,
                Package.storage_tier == StorageTier.ARCHIVE
            )
        ).order_by(Package.size_bytes.desc()).limit(5)
        
        largest_result = await self.db.execute(largest_query)
        largest_packages = [
            {
                "id": str(pkg.id),
                "platform_id": pkg.platform_id,
                "size_mb": (pkg.size_bytes or 0) / (1024 * 1024),
                "created_at": pkg.created_at.isoformat() if pkg.created_at else None
            }
            for pkg in largest_result.scalars().all()
        ]
        
        # Get oldest archived packages (top 5)
        oldest_query = select(Package).where(
            and_(
                Package.tenant_id == tenant_id,
                Package.storage_tier == StorageTier.ARCHIVE
            )
        ).order_by(Package.created_at.asc()).limit(5)
        
        oldest_result = await self.db.execute(oldest_query)
        oldest_packages = [
            {
                "id": str(pkg.id),
                "platform_id": pkg.platform_id,
                "age_days": (datetime.now(UTC) - pkg.created_at).days if pkg.created_at else 0,
                "expires_at": pkg.expires_at.isoformat() if pkg.expires_at else None
            }
            for pkg in oldest_result.scalars().all()
        ]
        
        return {
            "quota": quota,
            "package_count": package_count,
            "expiring_soon_count": len(expiring_soon),
            "largest_packages": largest_packages,
            "oldest_packages": oldest_packages
        }
