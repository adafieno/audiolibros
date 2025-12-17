"""Planning/Orchestration API Router."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import attributes
from uuid import UUID
import logging
import json
import asyncio

from shared.db.database import get_db
from shared.models import User, ChapterPlan, Chapter, Project
from shared.auth import get_current_active_user
from .schemas import ChapterPlanResponse, PlanGenerateOptions, PlanUpdateRequest
from .segmentation import segment_text
from .character_assignment import assign_characters_with_llm

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health")
async def health_check():
    """Health check endpoint for planning service."""
    return {"status": "ok", "service": "planning"}


@router.post("/chapters/{chapter_id}/generate", response_model=ChapterPlanResponse)
async def generate_plan(
    chapter_id: UUID,
    project_id: UUID,
    options: PlanGenerateOptions,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Generate a new plan for a chapter by segmenting its text.
    """
    # Get chapter and verify it exists
    result = await db.execute(
        select(Chapter).where(Chapter.id == chapter_id, Chapter.project_id == project_id)
    )
    chapter = result.scalar_one_or_none()
    
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    
    if not chapter.content:
        raise HTTPException(status_code=400, detail="Chapter has no content to segment")
    
    # Check if plan already exists
    result = await db.execute(
        select(ChapterPlan).where(ChapterPlan.chapter_id == chapter_id)
    )
    existing_plan = result.scalar_one_or_none()
    
    # Segment the text
    max_kb = options.maxKB if options.maxKB else 100
    segments = segment_text(chapter.content, max_kb=max_kb)
    
    if existing_plan:
        # Update existing plan
        existing_plan.segments = segments
        existing_plan.is_complete = False
        existing_plan.completed_at = None
        
        # Mark the JSONB field as modified so SQLAlchemy detects the change
        attributes.flag_modified(existing_plan, 'segments')
        
        await db.commit()
        await db.refresh(existing_plan)
        return existing_plan
    else:
        # Create new plan
        new_plan = ChapterPlan(
            project_id=project_id,
            chapter_id=chapter_id,
            segments=segments,
            is_complete=False
        )
        db.add(new_plan)
        await db.commit()
        await db.refresh(new_plan)
        return new_plan


@router.get("/chapters/{chapter_id}/plan", response_model=ChapterPlanResponse | None)
async def get_plan(
    chapter_id: UUID,
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get the existing plan for a chapter.
    Returns null if plan doesn't exist yet (not an error, just empty state).
    """
    result = await db.execute(
        select(ChapterPlan).where(
            ChapterPlan.chapter_id == chapter_id,
            ChapterPlan.project_id == project_id
        )
    )
    plan = result.scalar_one_or_none()
    
    # Return null instead of 404 - plan not existing yet is an expected state
    return plan


@router.put("/chapters/{chapter_id}/plan", response_model=ChapterPlanResponse)
async def update_plan(
    chapter_id: UUID,
    project_id: UUID,
    update_data: PlanUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Update an existing plan's segments.
    """
    result = await db.execute(
        select(ChapterPlan).where(
            ChapterPlan.chapter_id == chapter_id,
            ChapterPlan.project_id == project_id
        )
    )
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    # Update segments
    plan.segments = update_data.segments
    
    # Mark the JSONB field as modified so SQLAlchemy detects the change
    attributes.flag_modified(plan, 'segments')
    
    await db.commit()
    await db.refresh(plan)
    
    return plan



@router.get("/chapters/{chapter_id}/assign-characters/stream")
async def assign_characters_stream(
    chapter_id: UUID,
    project_id: UUID,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Stream progress updates while assigning characters to segments using SSE.
    Note: Token is passed as query parameter because EventSource doesn't support custom headers.
    """
    # Manually verify the token and get user
    from shared.auth.jwt import verify_token
    from shared.models import User
    
    try:
        payload = verify_token(token, token_type="access")
        if payload is None:
            async def error_response():
                yield f"data: {json.dumps({'error': 'Invalid token'})}\n\n"
            return StreamingResponse(
                error_response(),
                media_type="text/event-stream",
                status_code=403
            )
        
        user_id: str = payload.get("sub")
        if user_id is None:
            async def error_response():
                yield f"data: {json.dumps({'error': 'Invalid token payload'})}\n\n"
            return StreamingResponse(
                error_response(),
                media_type="text/event-stream",
                status_code=403
            )
        
        # Get user from database
        result = await db.execute(select(User).where(User.id == user_id))
        current_user = result.scalar_one_or_none()
        
        if current_user is None or not current_user.is_active:
            async def error_response():
                yield f"data: {json.dumps({'error': 'User not found or inactive'})}\n\n"
            return StreamingResponse(
                error_response(),
                media_type="text/event-stream",
                status_code=403
            )
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        async def error_response():
            yield f"data: {json.dumps({'error': 'Authentication failed'})}\n\n"
        return StreamingResponse(
            error_response(),
            media_type="text/event-stream",
            status_code=403
        )
    
    async def generate():
        try:
            # Get the plan
            result = await db.execute(
                select(ChapterPlan).where(
                    ChapterPlan.chapter_id == chapter_id,
                    ChapterPlan.project_id == project_id
                )
            )
            plan = result.scalar_one_or_none()
            
            if not plan:
                yield f"data: {json.dumps({'error': 'Plan not found'})}\n\n"
                return
            
            # Get chapter and project
            result = await db.execute(select(Chapter).where(Chapter.id == chapter_id))
            chapter = result.scalar_one_or_none()
            
            result = await db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one_or_none()
            
            if not chapter or not chapter.content or not project:
                yield f"data: {json.dumps({'error': 'Chapter or project not found'})}\n\n"
                return
            
            # Extract characters
            characters_data = project.settings.get("characters", []) if project.settings else []
            available_characters = [char["name"] for char in characters_data if "name" in char]
            
            if not available_characters:
                yield f"data: {json.dumps({'error': 'No characters found'})}\n\n"
                return
            
            total_segments = len(plan.segments)
            
            # Send initial progress
            logger.info(f"SSE: Starting character assignment for {total_segments} segments")
            yield f"data: {json.dumps({'current': 0, 'total': total_segments, 'message': 'Starting character assignment...'})}\n\n"
            
            # Import the streaming function
            from services.planning.character_assignment_streaming import assign_characters_streaming
            
            # Process segments with streaming progress
            updated_segments = None
            async for progress in assign_characters_streaming(
                chapter_text=chapter.content,
                segments=plan.segments,
                available_characters=available_characters,
                project_settings=project.settings or {}
            ):
                # Forward progress to client
                current = progress.get('current', 0)
                message = progress.get('message', 'Processing...')
                
                if progress.get('complete'):
                    updated_segments = progress.get('segments')
                    logger.info("SSE: Processing complete")
                else:
                    logger.debug(f"SSE: Progress {current}/{total_segments}")
                
                yield f"data: {json.dumps({'current': current, 'total': total_segments, 'message': message})}\n\n"
            
            if not updated_segments:
                raise Exception("No segments returned from streaming function")
            
            logger.info(f"SSE: Updating database with {len(updated_segments)} segments...")
            
            # Store previous state for undo
            previous_segments = plan.segments.copy() if plan.segments else []
            
            # Check if segments actually changed
            segments_changed = previous_segments != updated_segments
            
            # Update plan
            plan.segments = updated_segments
            attributes.flag_modified(plan, 'segments')
            await db.commit()
            await db.refresh(plan)
            
            # Log the action for undo/redo ONLY if segments actually changed
            if segments_changed:
                from services.actions.action_logger import log_chapter_plan_update
                try:
                    await log_chapter_plan_update(
                        db=db,
                        user=current_user,
                        project_id=project_id,
                        chapter_id=chapter_id,
                        plan_id=plan.id,
                        action_description=f"Assigned characters to {len(updated_segments)} segments",
                        previous_segments=previous_segments,
                        new_segments=updated_segments,
                        previous_complete=plan.is_complete,
                        new_complete=plan.is_complete
                    )
                    await db.commit()
                    logger.info("SSE: Action logged for undo/redo")
                except Exception as log_error:
                    logger.warning(f"Failed to log action: {log_error}")
                    # Don't fail the operation if logging fails
            else:
                logger.info("SSE: No changes detected, skipping action log")
            
            # Send completion
            logger.info("SSE: Sending completion message")
            yield f"data: {json.dumps({'current': total_segments, 'total': total_segments, 'message': f'Complete! Assigned characters to {total_segments} segments', 'complete': True})}\n\n"
            logger.info("SSE: Stream complete")
            
        except Exception as e:
            logger.error(f"Error in character assignment stream: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/chapters/{chapter_id}/assign-characters", response_model=ChapterPlanResponse)
async def assign_characters_to_segments(
    chapter_id: UUID,
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Automatically assign characters to plan segments using LLM analysis.
    """
    # Get the plan
    result = await db.execute(
        select(ChapterPlan).where(
            ChapterPlan.chapter_id == chapter_id,
            ChapterPlan.project_id == project_id
        )
    )
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    # Get the chapter for context
    result = await db.execute(
        select(Chapter).where(Chapter.id == chapter_id)
    )
    chapter = result.scalar_one_or_none()
    
    if not chapter or not chapter.content:
        raise HTTPException(status_code=400, detail="Chapter content not found")
    
    # Get project for settings (characters and LLM config)
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Extract character names from project settings
    characters_data = project.settings.get("characters", []) if project.settings else []
    available_characters = [char["name"] for char in characters_data if "name" in char]
    
    if not available_characters:
        raise HTTPException(
            status_code=400,
            detail="No characters found in project. Please add characters first."
        )
    
    logger.info(f"🎭 Assigning characters to {len(plan.segments)} segments")
    logger.info(f"👥 Available characters: {available_characters}")
    
    try:
        # Use LLM to assign characters to segments
        updated_segments = await assign_characters_with_llm(
            chapter_text=chapter.content,
            segments=plan.segments,
            available_characters=available_characters,
            project_settings=project.settings or {}
        )
        
        # Update the plan with new assignments
        plan.segments = updated_segments
        
        # Mark the JSONB field as modified so SQLAlchemy detects the change
        attributes.flag_modified(plan, 'segments')
        
        await db.commit()
        await db.refresh(plan)
        
        logger.info(f"✅ Successfully assigned characters to plan {plan.id}")
        return plan
        
    except Exception as e:
        logger.error(f"Failed to assign characters: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to assign characters: {str(e)}"
        )
