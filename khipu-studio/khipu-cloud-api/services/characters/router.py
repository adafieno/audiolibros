"""
Characters service router
"""
import logging
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.database import get_db
from shared.models import Project
from shared.auth.dependencies import get_current_user
from .schemas import CharacterCreateRequest, CharacterUpdateRequest, CharacterResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/projects/{project_id}/characters")
async def get_characters(
    project_id: str,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> list[CharacterResponse]:
    """
    Get all characters for a project
    
    Args:
        project_id: Project ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        List of characters
    """
    logger.info(f"📚 Getting characters for project {project_id}")
    
    # Get project
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get characters from settings
    characters_data = project.settings.get("characters", []) if project.settings else []
    
    logger.info(f"✅ Found {len(characters_data)} characters for project {project_id}")
    
    return [CharacterResponse(**char) for char in characters_data]


@router.post("/projects/{project_id}/characters")
async def create_character(
    project_id: str,
    request: CharacterCreateRequest,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> CharacterResponse:
    """
    Create a new character
    
    Args:
        project_id: Project ID
        request: Character creation request
        db: Database session
        
    Returns:
        Created character
    """
    logger.info(f"➕ Creating character for project {project_id}: {request.name}")
    
    # Get project
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Initialize settings if needed
    if project.settings is None:
        project.settings = {}
    
    # Get existing characters
    characters = project.settings.get("characters", [])
    
    # Create new character
    new_character = {
        "id": str(uuid.uuid4()),
        "name": request.name,
        "description": request.description,
        "frequency": 0.0,
        "traits": request.traits.model_dump() if request.traits else None,
        "quotes": None,
        "isNarrator": False,
        "isMainCharacter": False,
        "voiceAssignment": None
    }
    
    # Add to list
    characters.append(new_character)
    project.settings["characters"] = characters
    
    # Mark as modified for SQLAlchemy
    from sqlalchemy.orm import attributes
    attributes.flag_modified(project, "settings")
    
    # Save
    await db.commit()
    
    logger.info(f"✅ Created character {new_character['id']} for project {project_id}")
    
    return CharacterResponse(**new_character)


@router.put("/projects/{project_id}/characters/{character_id}")
async def update_character(
    project_id: str,
    character_id: str,
    request: CharacterUpdateRequest,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> CharacterResponse:
    """
    Update a character
    
    Args:
        project_id: Project ID
        character_id: Character ID
        request: Character update request
        
    Returns:
        Updated character
    """
    logger.info(f"✏️ Updating character {character_id} for project {project_id}")
    
    # Get project
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get characters
    characters = project.settings.get("characters", []) if project.settings else []
    
    # Find character
    character = None
    character_index = None
    for i, char in enumerate(characters):
        if char["id"] == character_id:
            character = char
            character_index = i
            break
    
    if character is None:
        raise HTTPException(status_code=404, detail="Character not found")
    
    # Update fields
    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "traits" and value is not None:
            character[field] = value.model_dump() if hasattr(value, "model_dump") else value
        elif field == "voiceAssignment" and value is not None:
            character[field] = value.model_dump() if hasattr(value, "model_dump") else value
        else:
            character[field] = value
    
    # Update in list
    characters[character_index] = character
    project.settings["characters"] = characters
    
    # Mark as modified
    from sqlalchemy.orm import attributes
    attributes.flag_modified(project, "settings")
    
    # Save
    await db.commit()
    
    logger.info(f"✅ Updated character {character_id} for project {project_id}")
    
    return CharacterResponse(**character)


@router.delete("/projects/{project_id}/characters/{character_id}")
async def delete_character(
    project_id: str,
    character_id: str,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    Delete a character
    
    Args:
        project_id: Project ID
        character_id: Character ID
        
    Returns:
        Success message
    """
    logger.info(f"🗑️ Deleting character {character_id} for project {project_id}")
    
    # Get project
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get characters
    characters = project.settings.get("characters", []) if project.settings else []
    
    # Find and remove character
    initial_count = len(characters)
    characters = [char for char in characters if char["id"] != character_id]
    
    if len(characters) == initial_count:
        raise HTTPException(status_code=404, detail="Character not found")
    
    # Update
    project.settings["characters"] = characters
    
    # Mark as modified
    from sqlalchemy.orm import attributes
    attributes.flag_modified(project, "settings")
    
    # Save
    await db.commit()
    
    logger.info(f"✅ Deleted character {character_id} for project {project_id}")
    
    return {"message": "Character deleted successfully"}
