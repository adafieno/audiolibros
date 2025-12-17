"""
Action logging for project updates
"""
from uuid import UUID
from typing import Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import User
from services.actions.action_logger import log_action


async def log_project_update(
    db: AsyncSession,
    user: User,
    project_id: UUID,
    action_description: str,
    previous_data: Dict[str, Any],
    new_data: Dict[str, Any],
) -> None:
    """
    Log a project property update for undo/redo
    
    Args:
        db: Database session
        user: Current user
        project_id: Project ID
        action_description: Human-readable description
        previous_data: Previous project properties
        new_data: New project properties
    """
    await log_action(
        db=db,
        user=user,
        project_id=project_id,
        action_type="project_update",
        action_description=action_description,
        resource_type="project",
        resource_id=project_id,
        previous_state=previous_data,
        new_state=new_data
    )
