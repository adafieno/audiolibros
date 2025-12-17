"""
Action Logging Utility
Provides helper functions to log actions for undo/redo functionality
"""
from uuid import UUID
from typing import Dict, Any
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import ActionHistory, User


async def log_action(
    db: AsyncSession,
    user: User,
    project_id: UUID,
    action_type: str,
    action_description: str,
    resource_type: str,
    resource_id: UUID,
    previous_state: Dict[str, Any],
    new_state: Dict[str, Any],
) -> ActionHistory:
    """
    Log an action for undo/redo functionality
    
    Args:
        db: Database session
        user: Current user
        project_id: Project ID
        action_type: Type of action (e.g., 'character_assignment', 'voice_assignment')
        action_description: Human-readable description
        resource_type: Type of resource affected (e.g., 'chapter_plan')
        resource_id: ID of the affected resource
        previous_state: State before the action (JSONB)
        new_state: State after the action (JSONB)
    
    Returns:
        The created ActionHistory record
    """
    # Get the next sequence number for this project
    result = await db.execute(
        select(func.max(ActionHistory.sequence_number)).where(
            ActionHistory.project_id == project_id
        )
    )
    max_sequence = result.scalar()
    next_sequence = (max_sequence or 0) + 1
    
    # Create action history record
    action = ActionHistory(
        tenant_id=user.tenant_id,
        user_id=user.id,
        project_id=project_id,
        action_type=action_type,
        action_description=action_description,
        resource_type=resource_type,
        resource_id=resource_id,
        previous_state=previous_state,
        new_state=new_state,
        sequence_number=next_sequence,
        is_undone=False,
        user_email=user.email
    )
    
    db.add(action)
    await db.flush()  # Flush to get the ID
    
    # Clean up old actions (keep only last 20)
    await cleanup_old_actions(db, project_id, keep_count=20)
    
    return action


async def cleanup_old_actions(
    db: AsyncSession,
    project_id: UUID,
    keep_count: int = 20
) -> int:
    """
    Clean up old actions for a project, keeping only the most recent N
    
    Args:
        db: Database session
        project_id: Project ID
        keep_count: Number of actions to keep (default 20)
    
    Returns:
        Number of actions deleted
    """
    # Get all actions for this project, ordered by sequence
    result = await db.execute(
        select(ActionHistory)
        .where(ActionHistory.project_id == project_id)
        .order_by(ActionHistory.sequence_number.desc())
    )
    all_actions = result.scalars().all()
    
    # Delete actions beyond the limit
    if len(all_actions) > keep_count:
        actions_to_delete = all_actions[keep_count:]
        for action in actions_to_delete:
            await db.delete(action)
        
        return len(actions_to_delete)
    
    return 0


async def log_chapter_plan_update(
    db: AsyncSession,
    user: User,
    project_id: UUID,
    chapter_id: UUID,
    plan_id: UUID,
    action_description: str,
    previous_segments: list,
    new_segments: list,
    previous_complete: bool = False,
    new_complete: bool = False,
) -> ActionHistory:
    """
    Convenience function to log a chapter plan update
    
    Args:
        db: Database session
        user: Current user
        project_id: Project ID
        chapter_id: Chapter ID
        plan_id: Chapter plan ID
        action_description: Human-readable description
        previous_segments: Previous segments state
        new_segments: New segments state
        previous_complete: Previous completion status
        new_complete: New completion status
    
    Returns:
        The created ActionHistory record
    """
    previous_state = {
        "segments": previous_segments,
        "is_complete": previous_complete,
        "chapter_id": str(chapter_id)
    }
    
    new_state = {
        "segments": new_segments,
        "is_complete": new_complete,
        "chapter_id": str(chapter_id)
    }
    
    return await log_action(
        db=db,
        user=user,
        project_id=project_id,
        action_type="plan_update",
        action_description=action_description,
        resource_type="chapter_plan",
        resource_id=plan_id,
        previous_state=previous_state,
        new_state=new_state
    )
