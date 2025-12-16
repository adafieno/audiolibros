"""Planning/Orchestration API Router."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from shared.db.database import get_db
from shared.models import User, ChapterPlan, Chapter
from shared.auth import get_current_active_user
from .schemas import ChapterPlanResponse, PlanGenerateOptions, PlanUpdateRequest
from .segmentation import segment_text

router = APIRouter()


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


@router.get("/chapters/{chapter_id}/plan", response_model=ChapterPlanResponse)
async def get_plan(
    chapter_id: UUID,
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get the existing plan for a chapter.
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
    
    await db.commit()
    await db.refresh(plan)
    
    return plan
