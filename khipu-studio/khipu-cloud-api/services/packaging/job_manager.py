"""
Packaging job manager.

Handles creation, status updates, and lifecycle management of packaging jobs.
Jobs track the async process of:
1. Downloading audio segments
2. Assembling/concatenating audio
3. Running platform packager
4. Uploading to blob storage
5. Creating package record
"""

from typing import Dict, List, Optional
from uuid import UUID, uuid4
from datetime import datetime, timedelta, UTC
from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import PackagingJob


class JobStatus:
    """Job status constants."""
    QUEUED = "queued"
    DOWNLOADING_AUDIO = "downloading_audio"
    PROCESSING = "processing"
    UPLOADING = "uploading"
    COMPLETED = "completed"
    FAILED = "failed"


async def create_packaging_job(
    db: AsyncSession,
    tenant_id: UUID,
    project_id: UUID,
    platform_id: str,
    created_by: UUID,
    audio_spec: Dict
) -> PackagingJob:
    """
    Create a new packaging job.
    
    Args:
        db: Database session
        tenant_id: Tenant ID
        project_id: Project ID
        platform_id: Platform identifier (apple, google, etc.)
        created_by: User ID who initiated the job
        audio_spec: Audio specification dict (codec, bitrate, etc.)
    
    Returns:
        Newly created PackagingJob
    """
    
    job = PackagingJob(
        id=uuid4(),
        tenant_id=tenant_id,
        project_id=project_id,
        platform_id=platform_id,
        status=JobStatus.QUEUED,
        progress_percent=0,
        current_step="Queued for processing",
        created_by=created_by,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC)
    )
    
    db.add(job)
    await db.commit()
    await db.refresh(job)
    
    return job


async def update_job_status(
    db: AsyncSession,
    job_id: UUID,
    status: str,
    progress_percent: Optional[int] = None,
    current_step: Optional[str] = None,
    error_message: Optional[str] = None,
    package_id: Optional[UUID] = None
) -> PackagingJob:
    """
    Update packaging job status and progress.
    
    Args:
        job_id: Job ID to update
        status: New status (queued, downloading_audio, processing, etc.)
        progress_percent: Progress percentage (0-100)
        current_step: Human-readable description of current operation
        error_message: Error details if status is 'failed'
        package_id: Package ID if status is 'completed'
    
    Returns:
        Updated PackagingJob
    """
    
    job_query = select(PackagingJob).where(PackagingJob.id == job_id)
    result = await db.execute(job_query)
    job = result.scalar_one_or_none()
    
    if not job:
        raise ValueError(f"Job {job_id} not found")
    
    job.status = status
    job.updated_at = datetime.now(UTC)
    
    if progress_percent is not None:
        job.progress_percent = max(0, min(100, progress_percent))
    
    if current_step is not None:
        job.current_step = current_step
    
    if error_message is not None:
        job.error_message = error_message
    
    if package_id is not None:
        job.package_id = package_id
    
    await db.commit()
    await db.refresh(job)
    
    return job


async def get_job_status(
    db: AsyncSession,
    job_id: UUID,
    tenant_id: UUID
) -> PackagingJob:
    """
    Get current status of a packaging job.
    
    Args:
        job_id: Job ID
        tenant_id: Tenant ID (for security)
    
    Returns:
        PackagingJob with current status
    """
    
    job_query = select(PackagingJob).where(
        and_(
            PackagingJob.id == job_id,
            PackagingJob.tenant_id == tenant_id
        )
    )
    result = await db.execute(job_query)
    job = result.scalar_one_or_none()
    
    if not job:
        raise ValueError(f"Job {job_id} not found")
    
    return job


async def get_project_jobs(
    db: AsyncSession,
    project_id: UUID,
    tenant_id: UUID,
    status: Optional[str] = None,
    limit: int = 50
) -> List[PackagingJob]:
    """
    Get all packaging jobs for a project.
    
    Args:
        project_id: Project ID
        tenant_id: Tenant ID (for security)
        status: Optional status filter
        limit: Maximum number of jobs to return
    
    Returns:
        List of PackagingJob ordered by created_at desc
    """
    
    query = select(PackagingJob).where(
        and_(
            PackagingJob.project_id == project_id,
            PackagingJob.tenant_id == tenant_id
        )
    )
    
    if status:
        query = query.where(PackagingJob.status == status)
    
    query = query.order_by(PackagingJob.created_at.desc()).limit(limit)
    
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_active_jobs(
    db: AsyncSession,
    tenant_id: UUID,
    limit: int = 100
) -> List[PackagingJob]:
    """
    Get all active (non-completed, non-failed) jobs for a tenant.
    
    Useful for background workers to pick up pending jobs.
    
    Args:
        tenant_id: Tenant ID
        limit: Maximum number of jobs to return
    
    Returns:
        List of active PackagingJob ordered by created_at asc
    """
    
    active_statuses = [
        JobStatus.QUEUED,
        JobStatus.DOWNLOADING_AUDIO,
        JobStatus.PROCESSING,
        JobStatus.UPLOADING
    ]
    
    query = select(PackagingJob).where(
        and_(
            PackagingJob.tenant_id == tenant_id,
            PackagingJob.status.in_(active_statuses)
        )
    ).order_by(PackagingJob.created_at.asc()).limit(limit)
    
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_jobs_for_platforms(
    db: AsyncSession,
    tenant_id: UUID,
    project_id: UUID,
    created_by: UUID,
    platform_ids: List[str],
    audio_specs: Dict[str, Dict]
) -> List[PackagingJob]:
    """
    Create multiple packaging jobs for different platforms.
    
    Used when user clicks "Create All Packages" to generate
    packages for multiple platforms simultaneously.
    
    Args:
        db: Database session
        tenant_id: Tenant ID
        project_id: Project ID
        created_by: User ID
        platform_ids: List of platform IDs to create jobs for
        audio_specs: Dict mapping platform_id to audio_spec dict
    
    Returns:
        List of created PackagingJob instances
    """
    
    jobs = []
    
    for platform_id in platform_ids:
        audio_spec = audio_specs.get(platform_id, {})
        
        job = await create_packaging_job(
            db=db,
            tenant_id=tenant_id,
            project_id=project_id,
            platform_id=platform_id,
            created_by=created_by,
            audio_spec=audio_spec
        )
        
        jobs.append(job)
    
    return jobs


async def cancel_job(
    db: AsyncSession,
    job_id: UUID,
    tenant_id: UUID
) -> PackagingJob:
    """
    Cancel a running or queued packaging job.
    
    Args:
        job_id: Job ID to cancel
        tenant_id: Tenant ID (for security)
    
    Returns:
        Updated PackagingJob with failed status
    """
    
    job = await get_job_status(db, job_id, tenant_id)
    
    # Only allow canceling if not already completed
    if job.status in [JobStatus.COMPLETED, JobStatus.FAILED]:
        raise ValueError(f"Cannot cancel job with status: {job.status}")
    
    return await update_job_status(
        db=db,
        job_id=job_id,
        status=JobStatus.FAILED,
        error_message="Cancelled by user",
        current_step="Cancelled"
    )


async def retry_failed_job(
    db: AsyncSession,
    job_id: UUID,
    tenant_id: UUID,
    created_by: UUID
) -> PackagingJob:
    """
    Create a new job to retry a failed packaging attempt.
    
    Args:
        job_id: Failed job ID
        tenant_id: Tenant ID (for security)
        created_by: User ID initiating retry
    
    Returns:
        New PackagingJob for retry
    """
    
    failed_job = await get_job_status(db, job_id, tenant_id)
    
    if failed_job.status != JobStatus.FAILED:
        raise ValueError(f"Can only retry failed jobs. Current status: {failed_job.status}")
    
    # Create new job with same parameters
    new_job = await create_packaging_job(
        db=db,
        tenant_id=tenant_id,
        project_id=failed_job.project_id,
        platform_id=failed_job.platform_id,
        created_by=created_by,
        audio_spec={}  # TODO: Store audio_spec in job for retry
    )
    
    return new_job


async def cleanup_old_jobs(
    db: AsyncSession,
    tenant_id: UUID,
    days_old: int = 30
) -> int:
    """
    Delete old completed/failed jobs to keep database clean.
    
    Args:
        tenant_id: Tenant ID
        days_old: Delete jobs older than this many days
    
    Returns:
        Number of jobs deleted
    """
    
    cutoff_date = datetime.now(UTC) - timedelta(days=days_old)
    
    # Only delete completed or failed jobs
    terminal_statuses = [JobStatus.COMPLETED, JobStatus.FAILED]
    
    delete_query = delete(PackagingJob).where(
        and_(
            PackagingJob.tenant_id == tenant_id,
            PackagingJob.status.in_(terminal_statuses),
            PackagingJob.created_at < cutoff_date
        )
    )
    
    result = await db.execute(delete_query)
    await db.commit()
    
    return result.rowcount
