"""
Universal Manifest Generation for Cloud Packaging

Generates a standardized manifest aggregating all metadata needed
for platform-specific packaging operations from database models.

Unlike desktop version which reads from filesystem, this queries
the database for project, segments, and audio metadata.
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Dict, List, Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import Project
from shared.models.plan import ChapterPlan
from shared.models.segment import Segment
from shared.models.chapter import Chapter
from shared.models.audio_segment_metadata import AudioSegmentMetadata


async def generate_manifest(
    db: AsyncSession,
    project_id: UUID
) -> Dict[str, Any]:
    """
    Generate universal packaging manifest from database.
    
    Args:
        db: Database session
        project_id: Project UUID
        
    Returns:
        Dictionary containing the universal manifest
        
    Raises:
        ValueError: If project not found
    """
    # Load project
    stmt = select(Project).where(Project.id == project_id)
    result = await db.execute(stmt)
    project = result.scalar_one_or_none()
    
    if not project:
        raise ValueError(f"Project not found: {project_id}")
    
    # Load chapters for this project with their titles
    chapters_stmt = (
        select(Chapter)
        .join(ChapterPlan)
        .where(ChapterPlan.project_id == project_id)
        .order_by(Chapter.order)
    )
    chapters_result = await db.execute(chapters_stmt)
    chapters_list = chapters_result.scalars().all()
    
    # Build lookup: chapter_id -> chapter
    chapter_lookup = {str(chapter.id): chapter for chapter in chapters_list}
    
    # Load all segments for the project through chapter_plans, ordered by chapter order
    segments_stmt = (
        select(Segment, ChapterPlan.chapter_id)
        .join(ChapterPlan, Segment.chapter_plan_id == ChapterPlan.id)
        .join(Chapter, ChapterPlan.chapter_id == Chapter.id)
        .where(ChapterPlan.project_id == project_id)
        .order_by(Chapter.order, Segment.order_index)
    )
    segments_result = await db.execute(segments_stmt)
    segments_with_chapter = segments_result.all()
    
    # Get audio metadata for all segments
    audio_stmt = select(AudioSegmentMetadata).where(
        AudioSegmentMetadata.project_id == project_id
    )
    audio_result = await db.execute(audio_stmt)
    audio_metadata_list = audio_result.scalars().all()
    
    # Build lookup: segment_id -> audio metadata
    audio_lookup = {
        audio.segment_id: audio 
        for audio in audio_metadata_list
    }
    
    # Group segments by chapter_id
    chapters_data: Dict[str, List[Segment]] = {}
    for segment, chapter_id in segments_with_chapter:
        chapter_id_str = str(chapter_id)
        if chapter_id_str not in chapters_data:
            chapters_data[chapter_id_str] = []
        chapters_data[chapter_id_str].append(segment)
    
    # Build chapter list with audio information
    chapters = []
    total_duration = 0.0
    chapters_with_audio = 0
    segments_with_audio = 0
    total_segments = len(segments_with_chapter)
    missing_chapters = []
    
    # Sort chapter IDs
    sorted_chapter_ids = sorted(chapters_data.keys())
    
    for idx, chapter_id in enumerate(sorted_chapter_ids, start=1):
        chapter_segments = chapters_data[chapter_id]
        
        # Sort segments by order_index
        chapter_segments.sort(key=lambda s: s.order_index)
        
        # Calculate chapter audio stats
        chapter_duration = 0.0
        chapter_has_all_audio = True
        chapter_segment_count = len(chapter_segments)
        chapter_audio_segment_count = 0
        
        for segment in chapter_segments:
            audio = audio_lookup.get(segment.id)
            
            if audio and audio.raw_audio_cache_key:
                segments_with_audio += 1
                chapter_audio_segment_count += 1
                if audio.duration_seconds:
                    chapter_duration += audio.duration_seconds
            else:
                chapter_has_all_audio = False
        
        if chapter_has_all_audio:
            chapters_with_audio += 1
            total_duration += chapter_duration
        else:
            missing_chapters.append(idx)  # Use chapter index instead of internal ID
        
        # Get chapter title from Chapter model
        chapter = chapter_lookup.get(chapter_id)
        chapter_title = chapter.title if chapter and chapter.title else f"Chapter {idx}"
        
        chapters.append({
            'index': idx,
            'title': chapter_title,
            'duration': chapter_duration if chapter_has_all_audio else None,
            'isComplete': chapter_has_all_audio,
            'segmentCount': chapter_segment_count,
            'audioSegmentCount': chapter_audio_segment_count,
        })
    
    # Build manifest
    manifest = {
        'version': '2.0',  # Cloud version
        'generated': datetime.now(timezone.utc).isoformat(),
        'project': {
            'id': str(project.id),
            'title': project.title,
        },
        'book': {
            'title': project.title or 'Untitled',
            'subtitle': project.subtitle,
            'authors': project.authors or [],
            'narrators': project.narrators or [],
            'description': project.description,
            'language': project.language,
            'publisher': project.publisher,
            'publicationDate': project.publish_date.isoformat() if project.publish_date else None,
            'isbn': project.isbn,
        },
        'cover': _extract_cover_data(project),
        'audio': {
            'totalDuration': total_duration if total_duration > 0 else None,
            'totalDurationFormatted': _format_duration(total_duration) if total_duration > 0 else None,
            'chapterCount': len(chapters),
            'chaptersWithCompleteAudio': chapters_with_audio,
            'totalSegments': total_segments,
            'segmentsWithAudio': segments_with_audio,
            'completionPercentage': round((segments_with_audio / total_segments * 100), 2) if total_segments > 0 else 0,
            'missingChapters': missing_chapters,
            'isFullyReady': chapters_with_audio == len(chapters),
        },
        'chapters': chapters,
        'packaging': {
            'canPackage': True,  # Cloud allows packaging even if incomplete
            'requiresOnDemandGeneration': chapters_with_audio < len(chapters),
            'missingAudioWillBeGenerated': True,
            'chapterAudioConcatenationNeeded': True,  # Segments need to be concatenated into chapter files
        },
        'cloud': {
            'storageType': 'azure_blob',
            'segmentStorage': 'individual_blobs',
            'chapterFilesPreBuilt': False,  # Chapter audio files don't exist yet, must be built during packaging
        }
    }
    
    return manifest


def _format_duration(seconds: float) -> str:
    """Format duration in seconds to HH:MM:SS format."""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def _extract_cover_data(project: Project) -> Dict[str, Any]:
    """
    Extract cover image metadata from project.
    
    Note: Does not include the actual base64 image data in the manifest
    to keep it lightweight. Packaging tools should fetch the image separately.
    
    Args:
        project: Project model instance
        
    Returns:
        Dictionary with cover metadata indicating storage location
    """
    cover_data = {}
    
    # Add URL if present
    if project.cover_image_url:
        cover_data['imageUrl'] = project.cover_image_url
        cover_data['storageLocation'] = 'url'
    
    # Add blob path if present
    if project.cover_image_blob_path:
        cover_data['blobPath'] = project.cover_image_blob_path
        cover_data['storageLocation'] = 'blob_storage'
    
    # Check settings for embedded cover image
    if project.settings and isinstance(project.settings, dict):
        book_settings = project.settings.get('book', {})
        if isinstance(book_settings, dict) and 'cover_image_b64' in book_settings:
            cover_b64 = book_settings.get('cover_image_b64')
            if cover_b64:
                # Don't include the actual base64 data (too large for manifest)
                # Just indicate it's stored in the database
                cover_data['storageLocation'] = 'database'
                cover_data['storedInSettings'] = True
                cover_data['sizeBytes'] = len(cover_b64)  # Approximate size info
    
    return cover_data
