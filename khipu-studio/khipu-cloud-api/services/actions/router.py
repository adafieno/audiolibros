"""
Action History Router - Undo/Redo functionality
Provides endpoints to get action history and perform undo/redo operations
"""
from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from datetime import datetime

from shared.db.database import get_db
from shared.auth.dependencies import get_current_user
from shared.models import ActionHistory, User, ChapterPlan, Project, Chapter

router = APIRouter(prefix="/actions", tags=["actions"])


class ActionHistoryResponse(BaseModel):
    """Response model for action history"""
    id: UUID
    action_type: str
    action_description: str
    resource_type: str
    resource_id: UUID
    is_undone: bool
    sequence_number: int
    created_at: datetime
    user_email: str | None
    
    class Config:
        from_attributes = True


class UndoRedoResponse(BaseModel):
    """Response for undo/redo operations"""
    success: bool
    message: str
    action_id: UUID
    action_type: str


@router.get("/history/{project_id}", response_model=List[ActionHistoryResponse])
async def get_action_history(
    project_id: UUID,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get the action history for a project (last N undoable actions)
    Returns most recent first, limited to 20 actions
    """
    # Query for actions in this project, ordered by sequence number descending
    query = select(ActionHistory).where(
        and_(
            ActionHistory.project_id == project_id,
            ActionHistory.tenant_id == current_user.tenant_id
        )
    ).order_by(ActionHistory.sequence_number.desc()).limit(limit)
    
    result = await db.execute(query)
    actions = result.scalars().all()
    
    return actions


@router.post("/undo/{action_id}", response_model=UndoRedoResponse)
async def undo_action(
    action_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Undo a specific action by restoring the previous state
    """
    # Get the action
    result = await db.execute(
        select(ActionHistory).where(
            and_(
                ActionHistory.id == action_id,
                ActionHistory.tenant_id == current_user.tenant_id
            )
        )
    )
    action = result.scalar_one_or_none()
    
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    if action.is_undone:
        raise HTTPException(status_code=400, detail="Action already undone")
    
    # Restore previous state based on resource type
    if action.resource_type == "chapter_plan":
        # Get the chapter plan
        result = await db.execute(
            select(ChapterPlan).where(ChapterPlan.id == action.resource_id)
        )
        plan = result.scalar_one_or_none()
        
        if not plan:
            raise HTTPException(status_code=404, detail="Resource not found")
        
        # Restore previous state
        if "segments" in action.previous_state:
            plan.segments = action.previous_state["segments"]
        if "is_complete" in action.previous_state:
            plan.is_complete = action.previous_state["is_complete"]
        
        await db.commit()
    
    elif action.resource_type == "project":
        # Get the project
        result = await db.execute(
            select(Project).where(Project.id == action.resource_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Resource not found")
        
        # Restore previous project properties
        for key, value in action.previous_state.items():
            if hasattr(project, key):
                setattr(project, key, value)
        
        await db.commit()
    
    elif action.resource_type == "character":
        # Get the project (characters are stored in project settings)
        result = await db.execute(
            select(Project).where(Project.id == action.project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Find and update the character
        characters = project.settings.get("characters", []) if project.settings else []
        for i, char in enumerate(characters):
            if char["id"] == str(action.resource_id):
                # Restore previous state fields
                for key, value in action.previous_state.items():
                    char[key] = value
                characters[i] = char
                break
        
        project.settings["characters"] = characters
        
        # Mark as modified for SQLAlchemy
        from sqlalchemy.orm import attributes
        attributes.flag_modified(project, "settings")
        
        await db.commit()
    
    elif action.resource_type == "chapter":
        # Get the chapter
        result = await db.execute(
            select(Chapter).where(Chapter.id == action.resource_id)
        )
        chapter = result.scalar_one_or_none()
        
        if not chapter:
            raise HTTPException(status_code=404, detail="Chapter not found")
        
        # Restore previous chapter properties
        for key, value in action.previous_state.items():
            if hasattr(chapter, key):
                setattr(chapter, key, value)
        
        await db.commit()
    
    # Mark action as undone
    action.is_undone = True
    action.undone_at = func.now()
    await db.commit()
    
    return UndoRedoResponse(
        success=True,
        message=f"Undid action: {action.action_description}",
        action_id=action.id,
        action_type=action.action_type
    )


@router.post("/redo/{action_id}", response_model=UndoRedoResponse)
async def redo_action(
    action_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Redo a previously undone action by restoring the new state
    """
    # Get the action
    result = await db.execute(
        select(ActionHistory).where(
            and_(
                ActionHistory.id == action_id,
                ActionHistory.tenant_id == current_user.tenant_id
            )
        )
    )
    action = result.scalar_one_or_none()
    
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")
    
    if not action.is_undone:
        raise HTTPException(status_code=400, detail="Action is not undone")
    
    # Restore new state based on resource type
    if action.resource_type == "chapter_plan":
        # Get the chapter plan
        result = await db.execute(
            select(ChapterPlan).where(ChapterPlan.id == action.resource_id)
        )
        plan = result.scalar_one_or_none()
        
        if not plan:
            raise HTTPException(status_code=404, detail="Resource not found")
        
        # Restore new state
        if "segments" in action.new_state:
            plan.segments = action.new_state["segments"]
        if "is_complete" in action.new_state:
            plan.is_complete = action.new_state["is_complete"]
        
        await db.commit()
    
    elif action.resource_type == "project":
        # Get the project
        result = await db.execute(
            select(Project).where(Project.id == action.resource_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Resource not found")
        
        # Restore new project properties
        for key, value in action.new_state.items():
            if hasattr(project, key):
                setattr(project, key, value)
        
        await db.commit()
    
    elif action.resource_type == "character":
        # Get the project (characters are stored in project settings)
        result = await db.execute(
            select(Project).where(Project.id == action.project_id)
        )
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Find and update the character
        characters = project.settings.get("characters", []) if project.settings else []
        for i, char in enumerate(characters):
            if char["id"] == str(action.resource_id):
                # Restore new state fields
                for key, value in action.new_state.items():
                    char[key] = value
                characters[i] = char
                break
        
        project.settings["characters"] = characters
        
        # Mark as modified for SQLAlchemy
        from sqlalchemy.orm import attributes
        attributes.flag_modified(project, "settings")
        
        await db.commit()
    
    elif action.resource_type == "chapter":
        # Get the chapter
        result = await db.execute(
            select(Chapter).where(Chapter.id == action.resource_id)
        )
        chapter = result.scalar_one_or_none()
        
        if not chapter:
            raise HTTPException(status_code=404, detail="Chapter not found")
        
        # Restore new chapter properties
        for key, value in action.new_state.items():
            if hasattr(chapter, key):
                setattr(chapter, key, value)
        
        await db.commit()
    
    # Mark action as not undone
    action.is_undone = False
    action.undone_at = None
    await db.commit()
    
    return UndoRedoResponse(
        success=True,
        message=f"Redid action: {action.action_description}",
        action_id=action.id,
        action_type=action.action_type
    )


@router.delete("/history/{project_id}/cleanup")
async def cleanup_old_actions(
    project_id: UUID,
    keep_count: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Clean up old actions, keeping only the most recent N actions
    This maintains the 20 action limit
    """
    # Get all actions for this project, ordered by sequence
    query = select(ActionHistory).where(
        and_(
            ActionHistory.project_id == project_id,
            ActionHistory.tenant_id == current_user.tenant_id
        )
    ).order_by(ActionHistory.sequence_number.desc())
    
    result = await db.execute(query)
    all_actions = result.scalars().all()
    
    # Delete actions beyond the limit
    if len(all_actions) > keep_count:
        actions_to_delete = all_actions[keep_count:]
        for action in actions_to_delete:
            await db.delete(action)
        
        await db.commit()
        return {"deleted": len(actions_to_delete), "remaining": keep_count}
    
    return {"deleted": 0, "remaining": len(all_actions)}
