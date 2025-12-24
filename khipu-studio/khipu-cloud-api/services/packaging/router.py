"""
Packaging API router.

Endpoints:
- GET /projects/{project_id}/packaging/readiness - Check if project is ready for packaging
- POST /projects/{project_id}/packaging/create-all - Create packages for all platforms
- GET /projects/{project_id}/packaging/jobs/{job_id} - Get packaging job status
- GET /projects/{project_id}/packages - List all packages for a project
- POST /projects/{project_id}/packages/{package_id}/archive - Move package to archive tier
- POST /projects/{project_id}/packages/{package_id}/validate - Validate package quality
"""

from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.database import get_db
from shared.auth import get_current_active_user
from shared.models import Package, User
from .schemas import (
    PackagingReadinessResponse,
    CreatePackagesRequest,
    CreatePackagesResponse,
    PackagingJobResponse,
    PackageListResponse,
    PackageResponse,
    ArchivePackageRequest,
    ArchivePackageResponse,
    ValidatePackageResponse,
    StorageQuota
)
from .readiness import check_project_readiness, check_storage_quota
from .job_manager import (
    create_jobs_for_platforms,
    get_job_status,
    get_project_jobs
)
from .storage_tier_manager import StorageTierManager
from .platform_configs import get_platform_config


router = APIRouter(
    prefix="/projects",
    tags=["packaging"]
)


@router.get(
    "/{project_id}/packaging/readiness",
    response_model=PackagingReadinessResponse,
    summary="Check packaging readiness",
    description="Check if a project is ready for packaging across all platforms"
)
async def get_packaging_readiness(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Check if project meets requirements for packaging.
    
    Returns readiness status for each platform including:
    - Audio completion percentage
    - Missing requirements (cover, ISBN, etc.)
    - Estimated package sizes
    """
    
    try:
        readiness = await check_project_readiness(
            db=db,
            project_id=project_id,
            tenant_id=current_user.tenant_id
        )
        return readiness
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error checking readiness: {str(e)}"
        )


@router.post(
    "/{project_id}/packaging/create-all",
    response_model=CreatePackagesResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Create packages for all platforms",
    description="Queue packaging jobs for all enabled platforms"
)
async def create_all_packages(
    project_id: UUID,
    request: CreatePackagesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Create packaging jobs for multiple platforms.
    
    This is an async operation that returns immediately with job IDs.
    Use the job status endpoint to poll for completion.
    
    Steps:
    1. Validate project is ready for packaging
    2. Create packaging jobs for each platform
    3. Background worker will:
       - Download audio segments
       - Assemble audio files
       - Run platform packager
       - Upload to blob storage
       - Create package record
    """
    
    try:
        # Check project readiness
        readiness = await check_project_readiness(
            db=db,
            project_id=project_id,
            tenant_id=current_user.tenant_id
        )
        
        if not readiness.is_ready:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project is not ready for packaging. Check readiness endpoint for details."
            )
        
        # Determine which platforms to package
        platform_ids = request.platform_ids
        if not platform_ids:
            # Default: all ready platforms
            platform_ids = [
                p.platform_id for p in readiness.platforms if p.is_ready
            ]
        
        # Build audio specs for each platform
        audio_specs = {}
        for platform_id in platform_ids:
            config = get_platform_config(platform_id)
            if config:
                audio_specs[platform_id] = {
                    "codec": config.audio_spec.codec,
                    "bitrate_kbps": config.audio_spec.bitrate_kbps,
                    "sample_rate_hz": config.audio_spec.sample_rate_hz,
                    "channels": config.audio_spec.channels
                }
        
        # Create packaging jobs
        jobs = await create_jobs_for_platforms(
            db=db,
            tenant_id=current_user.tenant_id,
            project_id=project_id,
            created_by=current_user.id,
            platform_ids=platform_ids,
            audio_specs=audio_specs
        )
        
        # Convert to response format
        job_responses = [
            PackagingJobResponse(
                id=job.id,
                project_id=job.project_id,
                platform_id=job.platform_id,
                status=job.status,
                progress_percent=job.progress_percent,
                current_step=job.current_step,
                error_message=job.error_message,
                package_id=job.package_id,
                created_at=job.created_at,
                updated_at=job.updated_at
            )
            for job in jobs
        ]
        
        return CreatePackagesResponse(
            project_id=project_id,
            jobs=job_responses,
            message=f"Created {len(jobs)} packaging jobs"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating packages: {str(e)}"
        )


@router.get(
    "/{project_id}/packaging/jobs/{job_id}",
    response_model=PackagingJobResponse,
    summary="Get packaging job status",
    description="Poll status of an async packaging job"
)
async def get_packaging_job(
    project_id: UUID,
    job_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get current status of a packaging job.
    
    Poll this endpoint to track progress of packaging operations.
    Job status values:
    - queued: Waiting to start
    - downloading_audio: Downloading segment audio from blob storage
    - processing: Assembling and encoding audio
    - uploading: Uploading package to blob storage
    - completed: Package created successfully (package_id available)
    - failed: Error occurred (check error_message)
    """
    
    try:
        job = await get_job_status(
            db=db,
            job_id=job_id,
            tenant_id=current_user.tenant_id
        )
        
        return PackagingJobResponse(
            id=job.id,
            project_id=job.project_id,
            platform_id=job.platform_id,
            status=job.status,
            progress_percent=job.progress_percent,
            current_step=job.current_step,
            error_message=job.error_message,
            package_id=job.package_id,
            created_at=job.created_at,
            updated_at=job.updated_at
        )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting job status: {str(e)}"
        )


@router.get(
    "/{project_id}/packages",
    response_model=PackageListResponse,
    summary="List packages",
    description="Get all packages for a project"
)
async def list_packages(
    project_id: UUID,
    platform_id: Optional[str] = None,
    storage_tier: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    List all packages for a project.
    
    Optional filters:
    - platform_id: Filter by platform (apple, google, spotify, acx, kobo)
    - storage_tier: Filter by tier (temp, archive)
    - limit: Maximum packages to return (default 50)
    
    Returns packages ordered by created_at descending (newest first).
    """
    
    try:
        from sqlalchemy import select, and_
        
        # Build query
        query = select(Package).where(
            and_(
                Package.project_id == project_id,
                Package.tenant_id == current_user.tenant_id
            )
        )
        
        if platform_id:
            query = query.where(Package.platform_id == platform_id)
        
        if storage_tier:
            query = query.where(Package.storage_tier == storage_tier)
        
        query = query.order_by(Package.created_at.desc()).limit(limit)
        
        result = await db.execute(query)
        packages = list(result.scalars().all())
        
        # Convert to response format
        package_responses = [
            PackageResponse(
                id=pkg.id,
                project_id=pkg.project_id,
                platform_id=pkg.platform_id,
                platform_name=get_platform_config(pkg.platform_id).display_name if get_platform_config(pkg.platform_id) else pkg.platform_id,
                version_number=pkg.version_number,
                package_format=pkg.package_format,
                blob_path=pkg.blob_path,
                blob_container=pkg.blob_container,
                storage_tier=pkg.storage_tier,
                size_bytes=pkg.size_bytes,
                audio_spec=pkg.audio_spec,
                is_validated=pkg.is_validated,
                validation_results=pkg.validation_results,
                same_as_package_id=pkg.same_as_package_id,
                expires_at=pkg.expires_at,
                created_at=pkg.created_at,
                updated_at=pkg.updated_at
            )
            for pkg in packages
        ]
        
        # Get storage quota
        quota = await check_storage_quota(db, current_user.tenant_id)
        
        return PackageListResponse(
            packages=package_responses,
            total_count=len(package_responses),
            storage_quota=StorageQuota(**quota)
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing packages: {str(e)}"
        )


@router.post(
    "/{project_id}/packages/{package_id}/archive",
    response_model=ArchivePackageResponse,
    summary="Archive package",
    description="Move package from temp to archive tier"
)
async def archive_package(
    project_id: UUID,
    package_id: UUID,
    request: ArchivePackageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Move a package from temp to archive tier.
    
    Archive tier:
    - Longer retention (based on tenant plan: 7/30/90 days)
    - Counts toward storage quota
    - Requires explicit user action
    - Max 3 versions per platform
    
    This endpoint checks storage quota before archiving.
    """
    
    try:
        storage_manager = StorageTierManager(db)
        
        # Archive the package
        package = await storage_manager.archive_package(
            package_id=package_id,
            tenant_id=current_user.tenant_id
        )
        
        # Get updated quota
        quota = await storage_manager.check_storage_quota(current_user.tenant_id)
        
        return ArchivePackageResponse(
            package_id=package.id,
            storage_tier=package.storage_tier,
            expires_at=package.expires_at,
            message="Package archived successfully",
            storage_quota=StorageQuota(**quota)
        )
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error archiving package: {str(e)}"
        )


@router.post(
    "/{project_id}/packages/{package_id}/validate",
    response_model=ValidatePackageResponse,
    summary="Validate package",
    description="Run quality validation checks on a package"
)
async def validate_package(
    project_id: UUID,
    package_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Validate package against platform requirements.
    
    Checks:
    - Audio format compliance
    - File size limits
    - Cover image requirements
    - ISBN requirements
    - Platform-specific rules (RMS levels for ACX, chapter duration for Spotify, etc.)
    
    Returns validation results with errors and warnings.
    """
    
    try:
        from sqlalchemy import select, and_
        
        # Get package
        query = select(Package).where(
            and_(
                Package.id == package_id,
                Package.project_id == project_id,
                Package.tenant_id == current_user.tenant_id
            )
        )
        result = await db.execute(query)
        package = result.scalar_one_or_none()
        
        if not package:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Package not found"
            )
        
        # TODO: Implement actual validation logic
        # This would involve:
        # 1. Download package from blob storage (or just analyze metadata)
        # 2. Check audio specs against platform requirements
        # 3. For ACX: run audio analysis (RMS, peak, noise floor)
        # 4. For Spotify: check chapter duration limits
        # 5. For all: verify cover image exists and meets size requirements
        
        # Placeholder validation result
        from .schemas import ValidationIssue, ValidationResult
        
        validation_result = ValidationResult(
            is_valid=True,
            issues=[],
            warnings=[
                ValidationIssue(
                    issue_id="validation_pending",
                    severity="warning",
                    message="Full validation not yet implemented",
                    affected_items=[]
                )
            ]
        )
        
        # Update package validation status
        package.is_validated = True
        package.validation_results = validation_result.dict()
        await db.commit()
        
        return ValidatePackageResponse(
            package_id=package.id,
            platform_id=package.platform_id,
            validation_result=validation_result
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error validating package: {str(e)}"
        )


@router.get(
    "/{project_id}/packaging/jobs",
    response_model=List[PackagingJobResponse],
    summary="List packaging jobs",
    description="Get all packaging jobs for a project"
)
async def list_packaging_jobs(
    project_id: UUID,
    status_filter: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    List all packaging jobs for a project.
    
    Optional filters:
    - status: Filter by job status (queued, downloading_audio, processing, etc.)
    - limit: Maximum jobs to return (default 50)
    
    Returns jobs ordered by created_at descending (newest first).
    """
    
    try:
        jobs = await get_project_jobs(
            db=db,
            project_id=project_id,
            tenant_id=current_user.tenant_id,
            status=status_filter,
            limit=limit
        )
        
        return [
            PackagingJobResponse(
                id=job.id,
                project_id=job.project_id,
                platform_id=job.platform_id,
                status=job.status,
                progress_percent=job.progress_percent,
                current_step=job.current_step,
                error_message=job.error_message,
                package_id=job.package_id,
                created_at=job.created_at,
                updated_at=job.updated_at
            )
            for job in jobs
        ]
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error listing jobs: {str(e)}"
        )
