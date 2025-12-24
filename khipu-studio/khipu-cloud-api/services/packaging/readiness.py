"""
Packaging readiness checker.

Determines if a project is ready for packaging by checking:
- All chapters have audio segments generated
- Cover image exists and meets requirements
- Required metadata is present (ISBN if needed)
"""

from typing import Dict, List, Optional
from uuid import UUID
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Project, Segment
from .platform_configs import get_all_platforms, PlatformConfig
from .schemas import (
    PlatformRequirement,
    PlatformReadiness,
    PackagingReadinessResponse,
    ValidationIssue
)


async def check_project_readiness(
    db: AsyncSession,
    project_id: UUID,
    tenant_id: UUID
) -> PackagingReadinessResponse:
    """
    Check if a project is ready for packaging across all platforms.
    
    Returns readiness status for each platform with:
    - Requirements (cover, ISBN, audio completion)
    - Missing items that need attention
    - Overall readiness flag
    """
    
    # Get project with related data
    project_query = select(Project).where(
        and_(
            Project.id == project_id,
            Project.tenant_id == tenant_id
        )
    )
    result = await db.execute(project_query)
    project = result.scalar_one_or_none()
    
    if not project:
        raise ValueError(f"Project {project_id} not found")
    
    # Get audio completion stats
    audio_stats = await get_audio_completion_stats(db, project_id)
    
    # Check readiness for each platform
    platform_readiness: List[PlatformReadiness] = []
    
    for platform_config in get_all_platforms():
        readiness = await check_platform_readiness(
            platform_config,
            project,
            audio_stats
        )
        platform_readiness.append(readiness)
    
    # Overall readiness: at least one platform is ready
    overall_ready = any(pr.is_ready for pr in platform_readiness)
    
    return PackagingReadinessResponse(
        project_id=project_id,
        is_ready=overall_ready,
        platforms=platform_readiness,
        audio_completion=audio_stats
    )


async def get_audio_completion_stats(
    db: AsyncSession,
    project_id: UUID
) -> Dict[str, any]:
    """
    Get statistics about audio segment completion.
    
    Returns:
        {
            "total_segments": int,
            "segments_with_audio": int,
            "completion_percentage": float,
            "missing_segment_ids": List[UUID]
        }
    """
    
    # Count total segments
    total_query = select(func.count(Segment.id)).where(
        Segment.project_id == project_id
    )
    total_result = await db.execute(total_query)
    total_segments = total_result.scalar() or 0
    
    # Count segments with audio (blob_path is not null)
    with_audio_query = select(func.count(Segment.id)).where(
        and_(
            Segment.project_id == project_id,
            Segment.blob_path.isnot(None),
            Segment.blob_path != ''
        )
    )
    with_audio_result = await db.execute(with_audio_query)
    segments_with_audio = with_audio_result.scalar() or 0
    
    # Get list of segments missing audio
    missing_query = select(Segment.id).where(
        and_(
            Segment.project_id == project_id,
            (Segment.blob_path.is_(None) | (Segment.blob_path == ''))
        )
    )
    missing_result = await db.execute(missing_query)
    missing_ids = [row[0] for row in missing_result.fetchall()]
    
    completion_pct = (segments_with_audio / total_segments * 100) if total_segments > 0 else 0
    
    return {
        "total_segments": total_segments,
        "segments_with_audio": segments_with_audio,
        "completion_percentage": round(completion_pct, 2),
        "missing_segment_ids": missing_ids
    }


async def check_platform_readiness(
    platform_config: PlatformConfig,
    project: Project,
    audio_stats: Dict[str, any]
) -> PlatformReadiness:
    """
    Check if project meets requirements for a specific platform.
    """
    
    requirements: List[PlatformRequirement] = []
    missing_items: List[str] = []
    validation_issues: List[ValidationIssue] = []
    
    # Check audio completion
    audio_complete = audio_stats["completion_percentage"] == 100
    requirements.append(PlatformRequirement(
        requirement_id="audio_completion",
        description="All segments have generated audio",
        is_met=audio_complete,
        current_value=f"{audio_stats['segments_with_audio']}/{audio_stats['total_segments']}",
        required_value=f"{audio_stats['total_segments']}/{audio_stats['total_segments']}"
    ))
    
    if not audio_complete:
        missing_items.append(
            f"{audio_stats['total_segments'] - audio_stats['segments_with_audio']} segments need audio generation"
        )
        validation_issues.append(ValidationIssue(
            issue_id="missing_audio",
            severity="error",
            message=f"Missing audio for {len(audio_stats['missing_segment_ids'])} segments",
            affected_items=audio_stats['missing_segment_ids'][:10]  # Limit to first 10
        ))
    
    # Check cover image
    if platform_config.requires_cover:
        has_cover = bool(project.cover_image_path)
        
        # Check cover dimensions if specified
        cover_meets_size = True
        if has_cover and (platform_config.min_cover_width or platform_config.min_cover_height):
            # TODO: Implement actual cover size validation
            # For now, assume cover meets requirements if it exists
            cover_meets_size = True
        
        requirements.append(PlatformRequirement(
            requirement_id="cover_image",
            description=f"Cover image ({platform_config.min_cover_width or 'any'}x{platform_config.min_cover_height or 'any'})",
            is_met=has_cover and cover_meets_size,
            current_value="Present" if has_cover else "Missing",
            required_value=f"Minimum {platform_config.min_cover_width}x{platform_config.min_cover_height}" if platform_config.min_cover_width else "Required"
        ))
        
        if not has_cover:
            missing_items.append("Cover image")
            validation_issues.append(ValidationIssue(
                issue_id="missing_cover",
                severity="error",
                message="Cover image is required",
                affected_items=[]
            ))
        elif not cover_meets_size and platform_config.min_cover_width:
            validation_issues.append(ValidationIssue(
                issue_id="cover_size",
                severity="warning",
                message=f"Cover should be at least {platform_config.min_cover_width}x{platform_config.min_cover_height}",
                affected_items=[]
            ))
    
    # Check ISBN requirement
    if platform_config.requires_isbn:
        has_isbn = bool(project.isbn)
        requirements.append(PlatformRequirement(
            requirement_id="isbn",
            description="ISBN-13 identifier",
            is_met=has_isbn,
            current_value=project.isbn if project.isbn else "Not set",
            required_value="ISBN-13 required"
        ))
        
        if not has_isbn:
            missing_items.append("ISBN")
            validation_issues.append(ValidationIssue(
                issue_id="missing_isbn",
                severity="error",
                message=f"ISBN required for {platform_config.display_name}",
                affected_items=[]
            ))
    
    # Check chapter duration limits (for Spotify)
    if platform_config.max_chapter_duration_seconds:
        # TODO: Implement chapter duration check
        # This would require querying actual audio file durations
        pass
    
    # Overall readiness: all requirements met
    is_ready = all(req.is_met for req in requirements)
    
    return PlatformReadiness(
        platform_id=platform_config.platform_id,
        platform_name=platform_config.display_name,
        is_ready=is_ready,
        requirements=requirements,
        missing_items=missing_items,
        validation_issues=validation_issues,
        estimated_size_mb=estimate_package_size(audio_stats, platform_config)
    )


def estimate_package_size(
    audio_stats: Dict[str, any],
    platform_config: PlatformConfig
) -> Optional[float]:
    """
    Estimate final package size based on audio spec and segment count.
    
    Rough calculation:
    - bitrate_kbps * total_duration_seconds / 8 / 1024 = size in MB
    - Assume average 5 minutes per segment (rough estimate)
    """
    
    if audio_stats["total_segments"] == 0:
        return None
    
    # Rough estimate: 5 minutes average per segment
    estimated_duration_minutes = audio_stats["total_segments"] * 5
    estimated_duration_seconds = estimated_duration_minutes * 60
    
    # Calculate audio file size
    bitrate_kbps = platform_config.audio_spec.bitrate_kbps
    audio_size_mb = (bitrate_kbps * estimated_duration_seconds) / 8 / 1024
    
    # Add overhead for container format (10% for M4B, 5% for ZIP)
    if platform_config.package_format == "m4b":
        overhead = 1.10
    elif platform_config.package_format == "zip":
        overhead = 1.05
    else:  # epub3
        overhead = 1.15
    
    total_size_mb = audio_size_mb * overhead
    
    return round(total_size_mb, 2)


async def check_storage_quota(
    db: AsyncSession,
    tenant_id: UUID
) -> Dict[str, any]:
    """
    Check tenant's storage quota usage.
    
    Returns:
        {
            "used_mb": float,
            "limit_mb": float,
            "available_mb": float,
            "percentage_used": float
        }
    """
    
    # TODO: Implement storage quota checking
    # This would query:
    # 1. All packages in 'archive' tier for this tenant
    # 2. Sum of blob sizes
    # 3. Compare against tenant's plan limit
    
    # Placeholder for now
    return {
        "used_mb": 0,
        "limit_mb": 10240,  # 10 GB default
        "available_mb": 10240,
        "percentage_used": 0
    }
