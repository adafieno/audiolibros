"""Audio Production API Router."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from uuid import UUID
import logging
from typing import Optional

from shared.db.database import get_db
from shared.models import User, Project, AudioSegmentMetadata, SfxSegment, ChapterPlan
from shared.auth import get_current_active_user
from shared.config import get_settings, Settings
from .schemas import (
    SegmentAudioRequest,
    SegmentAudioResponse,
    ProcessingChainResponse,
    ProcessingChainUpdateRequest,
    RevisionMarkRequest,
    SfxUploadResponse,
    SfxPositionUpdateRequest,
    ChapterAudioProductionResponse,
    AudioSegmentData
)
from shared.services.audio_cache import get_audio_cache_service
from shared.services.blob_storage import BlobStorageService, get_blob_storage_service
from services.voices.azure_tts import generate_audio

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health")
async def health_check():
    """Health check endpoint for audio production service."""
    return {"status": "ok", "service": "audio_production"}


@router.post(
    "/projects/{project_id}/chapters/{chapter_id}/segments/{segment_id}/audio",
    response_model=SegmentAudioResponse
)
async def generate_segment_audio(
    project_id: UUID,
    chapter_id: str,
    segment_id: str,
    request: SegmentAudioRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    settings: Settings = Depends(get_settings),
):
    """
    Generate raw TTS audio for a segment.
    
    Returns the URL to cached raw audio (unprocessed). Processing chains
    are applied client-side during playback.
    """
    # Verify project exists and user has access
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == current_user.tenant_id
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get Azure credentials from project settings
    azure_key = project.settings.get("azure_tts_key") if project.settings else None
    azure_region = project.settings.get("azure_tts_region") if project.settings else None
    
    if not azure_key or not azure_region:
        raise HTTPException(
            status_code=400,
            detail="Azure TTS credentials not configured in project settings"
        )
    
    logger.info(f"🎤 Generating audio for segment {segment_id} in chapter {chapter_id}")
    
    try:
        # Setup blob storage
        storage_config = project.settings.get("creds", {}).get("storage", {}).get("azure", {})
        
        blob_service = None
        if storage_config.get("accountName") and storage_config.get("accessKey"):
            account_name = storage_config["accountName"]
            access_key = storage_config["accessKey"]
            container_name = storage_config.get("containerName", "audios")
            
            connection_string = f"DefaultEndpointsProtocol=https;AccountName={account_name};AccountKey={access_key};EndpointSuffix=core.windows.net"
            
            blob_service = BlobStorageService(settings, connection_string, container_name)
            logger.info(f"📦 Using project-specific blob storage: {account_name}/{container_name}")
        else:
            blob_service = BlobStorageService(settings)
            logger.info("📦 Using global blob storage settings")
        
        # Get audio cache service
        audio_cache_service = get_audio_cache_service(blob_service, settings)
        
        # Prepare voice settings
        voice_settings = request.prosody or {}
        
        # Check if audio is already cached
        logger.info(f"🔍 Checking cache for segment {segment_id}")
        
        cached_audio = await audio_cache_service.get_cached_audio(
            db=db,
            tenant_id=str(current_user.tenant_id),
            text=request.text,
            voice_id=request.voice,
            voice_settings=voice_settings
        )
        
        if cached_audio:
            logger.info(f"✅ Cache HIT for segment {segment_id}")
            
            # Get cache key for metadata
            cache_key = audio_cache_service.generate_cache_key(
                text=request.text,
                voice_id=request.voice,
                voice_settings=voice_settings
            )
            
            # Get audio URL from blob service
            audio_url = blob_service.get_blob_url(cached_audio["blob_path"])
            
            # Update or create segment metadata
            await _update_segment_metadata(
                db=db,
                project_id=project_id,
                chapter_id=chapter_id,
                segment_id=segment_id,
                cache_key=cache_key,
                duration=cached_audio.get("duration")
            )
            
            return SegmentAudioResponse(
                success=True,
                raw_audio_url=audio_url,
                cache_status="HIT",
                duration=cached_audio.get("duration")
            )
        
        # Cache miss - generate new audio
        logger.info(f"❌ Cache MISS for segment {segment_id} - generating...")
        
        # Generate TTS audio using Azure
        audio_bytes = await generate_audio(
            text=request.text,
            voice=request.voice,
            azure_key=azure_key,
            azure_region=azure_region,
            style=voice_settings.get("style"),
            styledegree=voice_settings.get("styledegree"),
            rate_pct=voice_settings.get("rate_pct"),
            pitch_pct=voice_settings.get("pitch_pct")
        )
        
        if not audio_bytes:
            raise HTTPException(
                status_code=500,
                detail="TTS generation failed"
            )
        
        # Store in cache
        cache_result = await audio_cache_service.store_audio(
            db=db,
            tenant_id=str(current_user.tenant_id),
            text=request.text,
            voice_id=request.voice,
            voice_settings=voice_settings,
            audio_data=audio_bytes,
            audio_duration=None,  # TODO: Calculate duration
            audio_size=len(audio_bytes)
        )
        
        logger.info(f"💾 Stored audio in cache for segment {segment_id}")
        
        # Get audio URL
        audio_url = blob_service.get_blob_url(cache_result["blob_path"])
        
        # Update or create segment metadata
        cache_key = audio_cache_service.generate_cache_key(
            text=request.text,
            voice_id=request.voice,
            voice_settings=voice_settings
        )
        
        await _update_segment_metadata(
            db=db,
            project_id=project_id,
            chapter_id=chapter_id,
            segment_id=segment_id,
            cache_key=cache_key,
            duration=None
        )
        
        return SegmentAudioResponse(
            success=True,
            raw_audio_url=audio_url,
            cache_status="MISS",
            duration=None
        )
        
    except Exception as e:
        logger.error(f"❌ Failed to generate segment audio: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/projects/{project_id}/chapters/{chapter_id}/segments/{segment_id}/processing-chain",
    response_model=ProcessingChainResponse
)
async def get_processing_chain(
    project_id: UUID,
    chapter_id: str,
    segment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get the processing chain configuration for a segment."""
    # Verify project access
    await _verify_project_access(db, project_id, current_user.tenant_id)
    
    # Get segment metadata
    result = await db.execute(
        select(AudioSegmentMetadata).where(
            and_(
                AudioSegmentMetadata.project_id == project_id,
                AudioSegmentMetadata.chapter_id == chapter_id,
                AudioSegmentMetadata.segment_id == segment_id
            )
        )
    )
    metadata = result.scalar_one_or_none()
    
    return ProcessingChainResponse(
        processing_chain=metadata.processing_chain if metadata else None,
        preset_id=metadata.preset_id if metadata else None
    )


@router.put(
    "/projects/{project_id}/chapters/{chapter_id}/segments/{segment_id}/processing-chain"
)
async def update_processing_chain(
    project_id: UUID,
    chapter_id: str,
    segment_id: str,
    request: ProcessingChainUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update the processing chain configuration for a segment."""
    # Verify project access
    await _verify_project_access(db, project_id, current_user.tenant_id)
    
    # Get or create segment metadata
    result = await db.execute(
        select(AudioSegmentMetadata).where(
            and_(
                AudioSegmentMetadata.project_id == project_id,
                AudioSegmentMetadata.chapter_id == chapter_id,
                AudioSegmentMetadata.segment_id == segment_id
            )
        )
    )
    metadata = result.scalar_one_or_none()
    
    if metadata:
        metadata.processing_chain = request.processing_chain
        metadata.preset_id = request.preset_id
    else:
        metadata = AudioSegmentMetadata(
            project_id=project_id,
            chapter_id=chapter_id,
            segment_id=segment_id,
            processing_chain=request.processing_chain,
            preset_id=request.preset_id
        )
        db.add(metadata)
    
    await db.commit()
    
    logger.info(f"💾 Updated processing chain for segment {segment_id}, preset: {request.preset_id}")
    
    return {"success": True}


@router.put(
    "/projects/{project_id}/chapters/{chapter_id}/segments/{segment_id}/revision"
)
async def update_revision_mark(
    project_id: UUID,
    chapter_id: str,
    segment_id: str,
    request: RevisionMarkRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Mark or unmark a segment for revision."""
    # Verify project access
    await _verify_project_access(db, project_id, current_user.tenant_id)
    
    # Import Chapter model here to avoid circular import
    from shared.models.chapter import Chapter
    
    # Resolve chapter_id - could be UUID or order number
    try:
        chapter_uuid = UUID(chapter_id)
    except ValueError:
        # chapter_id is an order number, look up the UUID
        chapter_result = await db.execute(
            select(Chapter).where(
                and_(
                    Chapter.project_id == project_id,
                    Chapter.order == int(chapter_id)
                )
            )
        )
        chapter = chapter_result.scalar_one_or_none()
        if not chapter:
            raise HTTPException(status_code=404, detail="Chapter not found")
        chapter_uuid = chapter.id
    
    # Get or create segment metadata
    result = await db.execute(
        select(AudioSegmentMetadata).where(
            and_(
                AudioSegmentMetadata.project_id == project_id,
                AudioSegmentMetadata.chapter_id == str(chapter_uuid),
                AudioSegmentMetadata.segment_id == segment_id
            )
        )
    )
    metadata = result.scalar_one_or_none()
    
    if metadata:
        metadata.needs_revision = request.needs_revision
        metadata.revision_notes = request.notes
    else:
        metadata = AudioSegmentMetadata(
            project_id=project_id,
            chapter_id=str(chapter_uuid),
            segment_id=segment_id,
            needs_revision=request.needs_revision,
            revision_notes=request.notes
        )
        db.add(metadata)
    
    await db.commit()
    
    logger.info(f"🚩 Updated revision mark for segment {segment_id}: {request.needs_revision}")
    
    return {"success": True}


@router.post(
    "/projects/{project_id}/chapters/{chapter_id}/sfx",
    response_model=SfxUploadResponse
)
async def upload_sfx(
    project_id: UUID,
    chapter_id: str,
    display_order: int = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Upload a sound effect (SFX) file.
    
    Validates, converts to WAV if needed, and stores in blob storage.
    """
    # Verify project access
    await _verify_project_access(db, project_id, current_user.tenant_id)
    
    # Validate file size (max 50 MB)
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
    file_content = await file.read()
    file_size = len(file_content)
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is 50 MB, got {file_size / 1024 / 1024:.2f} MB"
        )
    
    # Validate file format
    allowed_formats = [".mp3", ".wav", ".flac", ".ogg"]
    file_ext = file.filename.lower().split(".")[-1] if file.filename else ""
    if f".{file_ext}" not in allowed_formats:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format. Allowed: {', '.join(allowed_formats)}"
        )
    
    logger.info(f"🎵 Uploading SFX file: {file.filename} ({file_size} bytes)")
    
    try:
        # Get blob storage service
        blob_service = get_blob_storage_service()
        
        # Generate blob path
        blob_filename = f"{file.filename}"
        blob_path = f"sfx/{project_id}/{chapter_id}/{blob_filename}"
        
        # Upload to blob storage
        # TODO: Convert to WAV 44.1kHz stereo if needed
        blob_url = await blob_service.upload_audio(
            blob_path=blob_path,
            audio_data=file_content
        )
        
        # TODO: Extract audio duration using audio processing library
        # For now, use a placeholder
        duration_seconds = 0.0
        
        # Create SFX segment record
        sfx_segment = SfxSegment(
            project_id=project_id,
            chapter_id=chapter_id,
            filename=file.filename,
            blob_path=blob_path,
            file_size_bytes=file_size,
            duration_seconds=duration_seconds,
            display_order=display_order
        )
        db.add(sfx_segment)
        await db.commit()
        await db.refresh(sfx_segment)
        
        logger.info(f"✅ SFX file uploaded: {blob_path}")
        
        return SfxUploadResponse(
            id=sfx_segment.id,
            filename=sfx_segment.filename,
            blob_url=blob_url,
            duration=duration_seconds,
            file_size=file_size
        )
        
    except Exception as e:
        logger.error(f"❌ Failed to upload SFX file: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put(
    "/projects/{project_id}/chapters/{chapter_id}/sfx/{sfx_id}/position"
)
async def update_sfx_position(
    project_id: UUID,
    chapter_id: str,
    sfx_id: UUID,
    request: SfxPositionUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update the display order (position) of an SFX segment."""
    # Verify project access
    await _verify_project_access(db, project_id, current_user.tenant_id)
    
    # Get SFX segment
    result = await db.execute(
        select(SfxSegment).where(
            and_(
                SfxSegment.id == sfx_id,
                SfxSegment.project_id == project_id,
                SfxSegment.chapter_id == chapter_id
            )
        )
    )
    sfx_segment = result.scalar_one_or_none()
    
    if not sfx_segment:
        raise HTTPException(status_code=404, detail="SFX segment not found")
    
    sfx_segment.display_order = request.display_order
    await db.commit()
    
    logger.info(f"🔄 Updated SFX position: {sfx_id} -> order {request.display_order}")
    
    return {"success": True}


@router.delete(
    "/projects/{project_id}/chapters/{chapter_id}/sfx/{sfx_id}"
)
async def delete_sfx(
    project_id: UUID,
    chapter_id: str,
    sfx_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Delete an SFX segment and its associated file."""
    # Verify project access
    await _verify_project_access(db, project_id, current_user.tenant_id)
    
    # Get SFX segment
    result = await db.execute(
        select(SfxSegment).where(
            and_(
                SfxSegment.id == sfx_id,
                SfxSegment.project_id == project_id,
                SfxSegment.chapter_id == chapter_id
            )
        )
    )
    sfx_segment = result.scalar_one_or_none()
    
    if not sfx_segment:
        raise HTTPException(status_code=404, detail="SFX segment not found")
    
    # Delete from blob storage
    try:
        blob_service = get_blob_storage_service()
        await blob_service.delete_audio(sfx_segment.blob_path)
    except Exception as e:
        logger.warning(f"⚠️ Failed to delete blob: {e}")
    
    # Delete from database
    await db.delete(sfx_segment)
    await db.commit()
    
    logger.info(f"🗑️ Deleted SFX segment: {sfx_id}")
    
    return {"success": True}


@router.get(
    "/projects/{project_id}/chapters/{chapter_id}/sfx"
)
async def list_sfx_segments(
    project_id: UUID,
    chapter_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """List all SFX segments for a chapter."""
    # Verify project access
    await _verify_project_access(db, project_id, current_user.tenant_id)
    
    # Get all SFX segments for this chapter
    result = await db.execute(
        select(SfxSegment)
        .where(
            and_(
                SfxSegment.project_id == project_id,
                SfxSegment.chapter_id == chapter_id
            )
        )
        .order_by(SfxSegment.display_order)
    )
    sfx_segments = result.scalars().all()
    
    return {
        "sfx_segments": [
            {
                "id": str(seg.id),
                "filename": seg.filename,
                "blob_path": seg.blob_path,
                "file_size_bytes": seg.file_size_bytes,
                "duration_seconds": seg.duration_seconds,
                "display_order": seg.display_order
            }
            for seg in sfx_segments
        ]
    }


@router.get(
    "/projects/{project_id}/chapters/{chapter_id}/audio-production",
    response_model=ChapterAudioProductionResponse
)
async def get_chapter_audio_production_data(
    project_id: UUID,
    chapter_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get combined audio production data for a chapter.
    
    Returns all segments (plan + SFX) merged in display order with metadata.
    """
    # Verify project access
    await _verify_project_access(db, project_id, current_user.tenant_id)
    
    # First, get the chapter by order to get its UUID
    from shared.models.chapter import Chapter
    result = await db.execute(
        select(Chapter).where(
            and_(
                Chapter.project_id == project_id,
                Chapter.order == int(chapter_id)
            )
        )
    )
    chapter = result.scalar_one_or_none()
    
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    # Get chapter plan with segments
    result = await db.execute(
        select(ChapterPlan).where(
            and_(
                ChapterPlan.project_id == project_id,
                ChapterPlan.chapter_id == chapter.id
            )
        )
    )
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Chapter plan not found")
    
    # Get segment metadata (for audio cache status and processing chains)
    result = await db.execute(
        select(AudioSegmentMetadata).where(
            and_(
                AudioSegmentMetadata.project_id == project_id,
                AudioSegmentMetadata.chapter_id == chapter_id
            )
        )
    )
    metadata_list = result.scalars().all()
    metadata_dict = {m.segment_id: m for m in metadata_list}
    
    # Get SFX segments
    result = await db.execute(
        select(SfxSegment)
        .where(
            and_(
                SfxSegment.project_id == project_id,
                SfxSegment.chapter_id == chapter_id
            )
        )
        .order_by(SfxSegment.display_order)
    )
    sfx_segments = result.scalars().all()
    
    # Build response with real plan segments
    segments = []
    
    # Add plan segments from the orchestration
    # Handle both dict with 'segments' key and direct array
    if isinstance(plan.segments, dict):
        plan_segments = plan.segments.get('segments', [])
    elif isinstance(plan.segments, list):
        plan_segments = plan.segments
    else:
        plan_segments = []
    
    for idx, seg in enumerate(plan_segments):
        # Use the existing UUID from orchestration
        segment_id = seg.get('id')
        if not segment_id:
            # Fallback if no ID exists (shouldn't happen with orchestration data)
            segment_id = f"seg_{chapter.id}_{idx}"
        
        # Get metadata using the segment ID
        metadata = metadata_dict.get(str(segment_id))
        
        # Determine if audio exists for this segment
        has_audio = metadata is not None and metadata.cache_key is not None
        
        # Use orchestration order multiplied by 100 to leave room for SFX insertions
        # SFX can be inserted at positions like: 50, 150, 250 (between segments 0, 100, 200)
        base_order = seg.get('order', idx) * 100
        
        segments.append(AudioSegmentData(
            segment_id=str(segment_id),
            type="plan",
            display_order=base_order,
            text=seg.get('text', ''),
            voice=seg.get('voice', ''),
            character_name=seg.get('voice', ''),  # voice field contains character name from orchestration
            raw_audio_url=None,  # TODO: Generate URL from cache_key if exists
            has_audio=has_audio,
            processing_chain=metadata.processing_chain if metadata else None,
            preset_id=metadata.preset_id if metadata else None,
            needs_revision=metadata.needs_revision if metadata else seg.get('needsRevision', False),
            duration=metadata.duration_seconds if metadata else None
        ))
    
    # Add SFX segments
    for sfx in sfx_segments:
        blob_service = get_blob_storage_service()
        sfx_url = blob_service.get_blob_url(sfx.blob_path)
        
        segments.append(AudioSegmentData(
            segment_id=str(sfx.id),
            type="sfx",
            display_order=sfx.display_order,
            text=None,
            voice=None,
            character_name=None,
            raw_audio_url=sfx_url,
            has_audio=True,
            processing_chain=None,
            needs_revision=False,
            duration=sfx.duration_seconds
        ))
    
    # Sort by display order
    segments.sort(key=lambda x: x.display_order)
    
    return ChapterAudioProductionResponse(segments=segments)


# Helper functions

async def _verify_project_access(db: AsyncSession, project_id: UUID, tenant_id: UUID):
    """Verify user has access to project."""
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == tenant_id
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _update_segment_metadata(
    db: AsyncSession,
    project_id: UUID,
    chapter_id: str,
    segment_id: str,
    cache_key: str,
    duration: Optional[float]
):
    """Update or create segment metadata with cache reference."""
    result = await db.execute(
        select(AudioSegmentMetadata).where(
            and_(
                AudioSegmentMetadata.project_id == project_id,
                AudioSegmentMetadata.chapter_id == chapter_id,
                AudioSegmentMetadata.segment_id == segment_id
            )
        )
    )
    metadata = result.scalar_one_or_none()
    
    if metadata:
        metadata.raw_audio_cache_key = cache_key
        metadata.duration_seconds = duration
    else:
        metadata = AudioSegmentMetadata(
            project_id=project_id,
            chapter_id=chapter_id,
            segment_id=segment_id,
            raw_audio_cache_key=cache_key,
            duration_seconds=duration
        )
        db.add(metadata)
    
    await db.commit()
