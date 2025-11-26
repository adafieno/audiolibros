"""Chapters Service Router."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from shared.db.database import get_db
from shared.models import Chapter, Project, User
from shared.schemas.chapters import (
    ChapterCreate,
    ChapterUpdate,
    ChapterResponse,
    ChapterListResponse,
)
from shared.auth import get_current_active_user
from shared.auth.permissions import Permission, require_project_permission

router = APIRouter()


def count_words(text: str) -> int:
    """Count words in text."""
    return len(text.split())


def count_characters(text: str) -> int:
    """Count characters in text (excluding whitespace)."""
    return len(text.replace(" ", "").replace("\n", "").replace("\t", ""))


@router.post("/", response_model=ChapterResponse, status_code=status.HTTP_201_CREATED)
async def create_chapter(
    project_id: str,
    chapter_data: ChapterCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new chapter. Requires WRITE permission."""
    # Get project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == current_user.tenant_id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check permission
    await require_project_permission(current_user, project, Permission.WRITE, db)
    
    # Calculate word and character counts
    word_count = count_words(chapter_data.content)
    character_count = count_characters(chapter_data.content)
    
    # Create chapter
    chapter = Chapter(
        project_id=project_id,
        title=chapter_data.title,
        content=chapter_data.content,
        order=chapter_data.order,
        is_complete=chapter_data.is_complete,
        word_count=word_count,
        character_count=character_count
    )
    
    db.add(chapter)
    await db.commit()
    await db.refresh(chapter)
    
    return chapter


@router.get("/", response_model=ChapterListResponse)
async def list_chapters(
    project_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """List all chapters in a project. Requires READ permission."""
    # Get project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == current_user.tenant_id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check permission
    await require_project_permission(current_user, project, Permission.READ, db)
    
    # Get chapters ordered by order field
    result = await db.execute(
        select(Chapter).where(
            Chapter.project_id == project_id
        ).order_by(Chapter.order)
    )
    chapters = result.scalars().all()
    
    return ChapterListResponse(
        items=chapters,
        total=len(chapters)
    )


@router.get("/{chapter_id}", response_model=ChapterResponse)
async def get_chapter(
    project_id: str,
    chapter_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific chapter by ID. Requires READ permission."""
    # Get project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == current_user.tenant_id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check permission
    await require_project_permission(current_user, project, Permission.READ, db)
    
    # Get chapter
    result = await db.execute(
        select(Chapter).where(
            Chapter.id == chapter_id,
            Chapter.project_id == project_id
        )
    )
    chapter = result.scalar_one_or_none()
    
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chapter not found"
        )
    
    return chapter


@router.put("/{chapter_id}", response_model=ChapterResponse)
async def update_chapter(
    project_id: str,
    chapter_id: str,
    chapter_data: ChapterUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a chapter. Requires WRITE permission."""
    # Get project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == current_user.tenant_id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check permission
    await require_project_permission(current_user, project, Permission.WRITE, db)
    
    # Get chapter
    result = await db.execute(
        select(Chapter).where(
            Chapter.id == chapter_id,
            Chapter.project_id == project_id
        )
    )
    chapter = result.scalar_one_or_none()
    
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chapter not found"
        )
    
    # Update fields
    update_data = chapter_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "content" and value is not None:
            # Recalculate word and character counts when content changes
            chapter.word_count = count_words(value)
            chapter.character_count = count_characters(value)
        setattr(chapter, field, value)
    
    await db.commit()
    await db.refresh(chapter)
    
    return chapter


@router.delete("/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chapter(
    project_id: str,
    chapter_id: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a chapter. Requires WRITE permission."""
    # Get project
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.tenant_id == current_user.tenant_id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Check permission
    await require_project_permission(current_user, project, Permission.WRITE, db)
    
    # Get chapter
    result = await db.execute(
        select(Chapter).where(
            Chapter.id == chapter_id,
            Chapter.project_id == project_id
        )
    )
    chapter = result.scalar_one_or_none()
    
    if not chapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chapter not found"
        )
    
    await db.delete(chapter)
    await db.commit()
    
    return None
