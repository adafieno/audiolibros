"""
Characters service router
"""
import logging
import os
import uuid
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.db.database import get_db
from shared.models import Project
from shared.auth.dependencies import get_current_user
from services.actions.action_logger import log_action
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
    
    # Capture previous state
    previous_state = {}
    update_data = request.model_dump(exclude_unset=True)
    for field in update_data.keys():
        if field in character:
            previous_state[field] = character[field]
    
    # Update fields
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
    
    # Check what actually changed
    actually_changed = {}
    for field, new_value in update_data.items():
        old_value = previous_state.get(field)
        # Compare values (handle nested dicts for traits and voiceAssignment)
        if old_value != new_value:
            actually_changed[field] = new_value
    
    # Only log if something changed
    if actually_changed:
        from uuid import UUID
        action_desc = f"Updated character '{character['name']}': {list(actually_changed.keys())}"
        await log_action(
            db=db,
            user=current_user,
            project_id=UUID(project_id),
            action_type="character_update",
            action_description=action_desc,
            resource_type="character",
            resource_id=UUID(character_id),
            previous_state={k: previous_state[k] for k in actually_changed.keys()},
            new_state=actually_changed
        )
        logger.info(f"Action logged for undo/redo: {action_desc}")
    else:
        logger.info(f"No actual changes detected for character {character_id}, skipping action log")
    
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


@router.post("/projects/{project_id}/characters/detect")
async def detect_characters(
    project_id: str,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    Detect characters from manuscript chapters using LLM analysis
    
    Args:
        project_id: Project ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Detection results with character count
    """
    logger.info(f"🔍 Starting LLM-based character detection for project {project_id}")
    
    # Get project
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get OpenAI API key from project settings (same structure as llm_client.py)
    api_key = None
    model = "gpt-4o-mini"  # Default model
    
    if project.settings:
        creds = project.settings.get("creds", {}).get("llm", {}).get("openai", {})
        api_key = creds.get("apiKey")
        llm_settings = project.settings.get("llm", {})
        llm_engine = llm_settings.get("engine", {})
        model = llm_engine.get("model", model)
    
    if not api_key:
        # Fall back to environment variable
        import os
        api_key = os.environ.get("OPENAI_API_KEY")
    
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="OpenAI API key not configured. Please add it to project settings at creds.llm.openai.apiKey"
        )
    
    # Get chapters
    from shared.models import Chapter
    chapters_result = await db.execute(
        select(Chapter)
        .where(Chapter.project_id == project_id)
        .order_by(Chapter.order)
    )
    chapters = chapters_result.scalars().all()
    
    if not chapters:
        raise HTTPException(
            status_code=400, 
            detail="No chapters found. Please upload manuscript first."
        )
    
    logger.info(f"Found {len(chapters)} chapters to analyze with LLM")
    
    # Convert chapters to dict format for detection
    chapters_data = [
        {
            "content": chapter.content,
            "title": chapter.title,
            "order": chapter.order
        }
        for chapter in chapters
    ]
    
    # Run LLM-based detection
    from services.characters.detection import detect_characters_from_chapters
    detected_characters = await detect_characters_from_chapters(chapters_data, api_key, model)
    
    logger.info(f"LLM detection complete: {len(detected_characters)} characters found")
    
    # Initialize settings if needed
    if project.settings is None:
        project.settings = {}
    
    # Store detected characters
    project.settings["characters"] = detected_characters
    
    # Mark as modified
    from sqlalchemy.orm import attributes
    attributes.flag_modified(project, "settings")
    
    # Save
    await db.commit()
    await db.refresh(project)
    
    logger.info(f"✅ Saved {len(detected_characters)} characters for project {project_id}")
    logger.info(f"   Verification: project.settings has {len(project.settings.get('characters', []))} characters after commit")
    
    return {
        "message": "LLM-based character detection complete",
        "count": len(detected_characters),
        "characters": detected_characters
    }


@router.post("/projects/{project_id}/characters/assign-voices")
async def assign_voices_to_characters(
    project_id: str,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> dict:
    """
    Use LLM to automatically assign voices to characters based on traits
    
    Args:
        project_id: Project ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Assignment results with updated characters
    """
    logger.info(f"🎤 Starting LLM-based voice assignment for project {project_id}")
    
    # Get project
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get OpenAI API key from project settings (same structure as llm_client.py)
    api_key = None
    model = "gpt-4o-mini"
    
    if project.settings:
        creds = project.settings.get("creds", {}).get("llm", {}).get("openai", {})
        api_key = creds.get("apiKey")
        llm_settings = project.settings.get("llm", {})
        llm_engine = llm_settings.get("engine", {})
        model = llm_engine.get("model", model)
    
    if not api_key:
        api_key = os.environ.get("OPENAI_API_KEY")
    
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="OpenAI API key not configured"
        )
    
    # Get current characters
    if not project.settings:
        logger.error("   Project settings is None or empty")
        raise HTTPException(
            status_code=400,
            detail="No project settings found. Please configure the project first."
        )
    
    characters = project.settings.get("characters", [])
    logger.info(f"   project.settings keys: {list(project.settings.keys())}")
    logger.info(f"   'characters' key exists: {'characters' in project.settings}")
    logger.info(f"   'characters' value type: {type(characters)}")
    logger.info(f"   Found {len(characters) if isinstance(characters, list) else 0} characters in project settings")
    
    if not characters or not isinstance(characters, list) or len(characters) == 0:
        logger.error(f"   No valid characters found. Value: {characters if not isinstance(characters, list) or len(str(characters)) < 200 else str(characters)[:200] + '...'}")
        raise HTTPException(
            status_code=400,
            detail="No characters found. Run character detection first."
        )
    
    # Get available voices from project settings or use defaults
    available_voices = []
    voice_inventory = {}  # Map of voice_id -> full metadata
    
    # Load comprehensive voice inventory from JSON file
    import json
    voice_json_path = os.path.join(os.path.dirname(__file__), '../../data/comprehensive-azure-voices.json')
    if os.path.exists(voice_json_path):
        try:
            with open(voice_json_path, 'r', encoding='utf-8') as f:
                voice_data = json.load(f)
                voice_inventory = {v['id']: v for v in voice_data.get('voices', [])}
                logger.info(f"   Loaded {len(voice_inventory)} voices from comprehensive inventory")
        except Exception as e:
            logger.warning(f"   Could not load voice inventory: {e}")
    
    if project.settings and "voices" in project.settings:
        voices_settings = project.settings["voices"]
        # Check if it's the new format with selectedVoiceIds
        if isinstance(voices_settings, dict) and "selectedVoiceIds" in voices_settings:
            selected_voice_ids = voices_settings.get("selectedVoiceIds", [])
            logger.info(f"   Found {len(selected_voice_ids)} selected voices in project settings")
            # Build voice objects with full metadata from inventory
            for vid in selected_voice_ids:
                if vid in voice_inventory:
                    # Use full metadata from inventory
                    available_voices.append(voice_inventory[vid])
                else:
                    # Fallback: extract basic info from voice ID
                    available_voices.append({
                        "id": vid,
                        "name": vid.split("-")[-1].replace("Neural", ""),
                        "gender": "N",
                        "age": "adult",
                        "style": "neutral"
                    })
    
    if not available_voices:
        # Use default voice inventory for Spanish
        logger.info("   No voices configured, using default Spanish voices")
        available_voices = [
            {"id": "es-ES-AlvaroNeural", "name": "Alvaro", "gender": "M", "age": "adult", "style": "neutral"},
            {"id": "es-ES-ElviraNeural", "name": "Elvira", "gender": "F", "age": "adult", "style": "neutral"},
            {"id": "es-MX-DaliaNeural", "name": "Dalia", "gender": "F", "age": "adult", "style": "friendly"},
            {"id": "es-MX-JorgeNeural", "name": "Jorge", "gender": "M", "age": "adult", "style": "friendly"},
        ]
    
    # Use LLM to assign voices
    from services.characters.voice_assignment import assign_voices_with_llm
    assigned_characters = await assign_voices_with_llm(
        characters, 
        available_voices, 
        api_key, 
        model
    )
    
    # Update project
    project.settings["characters"] = assigned_characters
    
    from sqlalchemy.orm import attributes
    attributes.flag_modified(project, "settings")
    await db.commit()
    
    logger.info(f"✅ Assigned voices to {len(assigned_characters)} characters")
    
    return {
        "message": "Voice assignment complete",
        "count": len(assigned_characters),
        "characters": assigned_characters
    }
