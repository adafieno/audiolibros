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
import logging
import traceback

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
    ManifestResponse,
    StorageQuota
)
from .readiness import check_project_readiness, check_storage_quota
from .manifest import generate_manifest
from .job_manager import (
    create_jobs_for_platforms,
    get_job_status,
    get_project_jobs
)
from .storage_tier_manager import StorageTierManager
from .platform_configs import get_platform_config

logger = logging.getLogger(__name__)


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
        logger.error(f"Error in get_packaging_readiness: {e}")
        logger.error(traceback.format_exc())
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
        logger.error(f"Error in create_all_packages: {e}")
        logger.error(traceback.format_exc())
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
        logger.error(f"Error in get_job_status: {e}")
        logger.error(traceback.format_exc())
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
                file_size_bytes=pkg.file_size_bytes,
                audio_spec=pkg.audio_spec,
                is_validated=pkg.is_validated,
                validation_results=pkg.validation_results,
                same_as_package_id=pkg.same_as_package_id,
                expires_at=pkg.expires_at,
                created_at=pkg.created_at
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
        logger.error(f"Error in list_packages: {e}")
        logger.error(traceback.format_exc())
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
async def validate_package_endpoint(
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
    - Metadata completeness
    - Platform-specific rules (RMS levels for ACX, chapter duration for Spotify, etc.)
    
    Returns validation results with errors and warnings.
    """
    
    try:
        from sqlalchemy import select, and_
        from .validator import validate_package
        import tempfile
        import os
        
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
        
        if not package.blob_path:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Package has no blob path"
            )
        
        # Download package from blob storage to temp file
        from shared.services.blob_storage import get_blob_storage_service
        from shared.config import get_settings
        
        settings = get_settings()
        blob_service = get_blob_storage_service(settings)
        
        # Determine file extension based on platform
        file_ext = {
            'apple': '.m4b',
            'google': '.zip',
            'spotify': '.zip',
            'acx': '.zip',
            'kobo': '.epub'
        }.get(package.platform_id, '.bin')
        
        # Create temp file
        temp_fd, temp_path = tempfile.mkstemp(suffix=file_ext, prefix='khipu_validate_')
        
        try:
            # Download blob to temp file
            os.close(temp_fd)  # Close fd, we'll write with blob client
            
            await blob_service.download_blob_to_file(
                container=package.blob_container,
                blob_name=package.blob_path,
                file_path=temp_path
            )
            
            # Get expected specs from platform config
            from .platform_configs import PLATFORM_CONFIGS
            platform_config = PLATFORM_CONFIGS.get(package.platform_id)
            expected_specs = None
            if platform_config:
                expected_specs = {
                    'bitrate': platform_config.audio_spec.bitrate,
                    'sampleRate': platform_config.audio_spec.sample_rate,
                    'channels': platform_config.audio_spec.channels
                }
            
            # Run validation
            validation_result = await validate_package(
                platform_id=package.platform_id,
                package_path=temp_path,
                expected_specs=expected_specs
            )
            
            # Update package validation status
            package.is_validated = True
            package.validation_results = validation_result.to_dict()
            await db.commit()
            
            # Convert to schema format
            from .schemas import ValidationIssue, ValidationResult as ValidationResultSchema
            
            schema_result = ValidationResultSchema(
                valid=validation_result.valid,
                platform=validation_result.platform,
                package_path=validation_result.package_path,
                issues=[
                    ValidationIssue(
                        severity=issue.severity,
                        category=issue.category,
                        message=issue.message,
                        details=issue.details
                    )
                    for issue in validation_result.issues
                ],
                specs=validation_result.specs
            )
            
            return ValidatePackageResponse(
                success=True,
                result=schema_result
            )
        
        finally:
            # Clean up temp file
            try:
                os.unlink(temp_path)
            except Exception:
                pass
    
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


@router.get(
    "/{project_id}/packaging/manifest",
    response_model=ManifestResponse,
    summary="Generate universal manifest",
    description="Generate a universal manifest aggregating all project metadata, chapters, and audio information"
)
async def get_manifest(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
) -> ManifestResponse:
    """
    Generate universal packaging manifest.
    
    The manifest aggregates:
    - Project and book metadata
    - Chapter structure with segment details
    - Audio completion statistics
    - Blob storage paths for audio segments
    
    Unlike desktop version, this is generated dynamically from database
    rather than from filesystem files.
    """
    try:
        manifest = await generate_manifest(db, project_id)
        return ManifestResponse(
            success=True,
            manifest=manifest
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Manifest generation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
