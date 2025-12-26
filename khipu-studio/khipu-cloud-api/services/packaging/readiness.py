"""
Packaging readiness checker.

Determines if a project is ready for packaging by checking:
- All chapters have audio segments generated
- Cover image exists and meets requirements
- Required metadata is present (ISBN if needed)
"""

from typing import Any, Dict, List, Optional
from uuid import UUID
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Project, Segment, ChapterPlan, AudioSegmentMetadata
from .platform_configs import get_all_platforms, PlatformConfig
from .schemas import (
    PlatformRequirement,
    PlatformReadiness,
    PackagingReadinessResponse
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
    overall_ready = any(pr.ready for pr in platform_readiness)
    
    # Build completion stats
    completion_stats = {
        "total_chapters": 1,  # TODO: Get actual chapter count
        "chapters_with_complete_audio": 1 if audio_stats["completion_percentage"] == 100 else 0,
        "total_segments": audio_stats["total_segments"],
        "segments_with_audio": audio_stats["segments_with_audio"],
        "percent_complete": audio_stats["completion_percentage"]
    }
    
    return PackagingReadinessResponse(
        overall_ready=overall_ready,
        completion_stats=completion_stats,
        platforms=platform_readiness,
        missing_audio={
            "chapterIds": [],
            "segmentIds": audio_stats["missing_segment_ids"]
        }
    )


async def get_audio_completion_stats(
    db: AsyncSession,
    project_id: UUID
) -> Dict[str, Any]:
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
    
    # Count total segments for this project (join through ChapterPlan)
    total_query = select(func.count(Segment.id)).join(
        ChapterPlan, Segment.chapter_plan_id == ChapterPlan.id
    ).where(
        ChapterPlan.project_id == project_id
    )
    total_result = await db.execute(total_query)
    total_segments = total_result.scalar() or 0
    
    # Count segments with audio metadata (raw_audio_cache_key is not null)
    with_audio_query = select(func.count(AudioSegmentMetadata.segment_id.distinct())).where(
        and_(
            AudioSegmentMetadata.project_id == project_id,
            AudioSegmentMetadata.raw_audio_cache_key.isnot(None),
            AudioSegmentMetadata.raw_audio_cache_key != ''
        )
    )
    with_audio_result = await db.execute(with_audio_query)
    segments_with_audio = with_audio_result.scalar() or 0
    
    # Get list of segments missing audio (segments without metadata records or null cache keys)
    missing_query = select(Segment.id).join(
        ChapterPlan, Segment.chapter_plan_id == ChapterPlan.id
    ).outerjoin(
        AudioSegmentMetadata, Segment.id == AudioSegmentMetadata.segment_id
    ).where(
        and_(
            ChapterPlan.project_id == project_id,
            (AudioSegmentMetadata.raw_audio_cache_key.is_(None) | 
             (AudioSegmentMetadata.raw_audio_cache_key == ''))
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
    audio_stats: Dict[str, Any]
) -> PlatformReadiness:
    """
    Check if project meets requirements for a specific platform.
    """
    
    requirements: List[PlatformRequirement] = []
    
    # Check audio completion (INFO ONLY - does not block packaging in cloud)
    # Missing audio will be generated on-the-fly during packaging if requested
    audio_complete = audio_stats["completion_percentage"] == 100
    missing_count = audio_stats['total_segments'] - audio_stats['segments_with_audio']
    
    requirements.append(PlatformRequirement(
        id="audio_completion",
        met=True,  # Always true - missing audio doesn't block cloud packaging
        details="All segments have audio" if audio_complete else f"{missing_count} segment(s) will be generated during packaging",
        expected=audio_stats['total_segments'],
        actual=audio_stats['segments_with_audio']
    ))
    
    # Check cover image
    if platform_config.requires_cover:
        # Check both Project model fields AND settings.book fields
        has_cover_direct = bool(project.cover_image_url or project.cover_image_blob_path)
        has_cover_settings = False
        
        if project.settings and isinstance(project.settings, dict):
            book_settings = project.settings.get('book', {})
            has_cover_settings = bool(
                book_settings.get('cover_image_b64') or 
                book_settings.get('cover_image_url')
            )
        
        has_cover = has_cover_direct or has_cover_settings
        
        requirements.append(PlatformRequirement(
            id="cover_image",
            met=has_cover,
            details="Cover image present" if has_cover else "Cover image required",
            expected=f"{platform_config.min_cover_width}x{platform_config.min_cover_height}" if platform_config.min_cover_width else "Any size",
            actual="Present" if has_cover else "Missing"
        ))
    
    # Check ISBN requirement
    if platform_config.requires_isbn:
        has_isbn = bool(project.isbn)
        requirements.append(PlatformRequirement(
            id="isbn",
            met=has_isbn,
            details="ISBN present" if has_isbn else "ISBN required",
            expected="ISBN-13",
            actual=project.isbn if project.isbn else "Not set"
        ))
    
    # Overall readiness: all requirements met
    is_ready = all(req.met for req in requirements)
    
    return PlatformReadiness(
        id=platform_config.platform_id,
        name=platform_config.display_name,
        enabled=True,
        ready=is_ready,
        requirements=requirements
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
) -> Dict[str, Any]:
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
