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
from shared.config import Settings, get_settings
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
    
    # Get LLM configuration
    api_key = None
    model = "gpt-4o-mini"  # Default model
    engine_name = "openai"  # Default engine
    
    if project.settings:
        llm_settings = project.settings.get("llm", {})
        llm_engine = llm_settings.get("engine", {})
        engine_name = llm_engine.get("name", "openai")
        model = llm_engine.get("model", model)
        
        creds = project.settings.get("creds", {}).get("llm", {})
        
        if engine_name == "azure-openai":
            azure_creds = creds.get("azure", {})
            api_key = azure_creds.get("apiKey")
            endpoint = azure_creds.get("endpoint")
            api_version = azure_creds.get("apiVersion", "2024-10-21")
            
            if not api_key or not endpoint:
                raise HTTPException(
                    status_code=400,
                    detail="Azure OpenAI credentials not configured. Please add apiKey and endpoint to project settings at creds.llm.azure"
                )
        else:
            openai_creds = creds.get("openai", {})
            api_key = openai_creds.get("apiKey")
    
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
    
    logger.info(f"Found {len(chapters)} chapters to analyze with LLM (engine: {engine_name})")
    
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
    
    # Prepare parameters for detection
    detection_kwargs = {
        "chapters": chapters_data,
        "api_key": api_key,
        "model": model,
        "engine_name": engine_name
    }
    
    # Add Azure-specific parameters if using Azure OpenAI
    if engine_name == "azure-openai":
        detection_kwargs["azure_endpoint"] = endpoint
        detection_kwargs["azure_api_version"] = api_version
    
    detected_characters = await detect_characters_from_chapters(**detection_kwargs)
    
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
    
    # Get LLM configuration
    api_key = None
    model = "gpt-4o-mini"
    engine_name = "openai"
    endpoint = None
    api_version = "2024-10-21"
    
    if project.settings:
        llm_settings = project.settings.get("llm", {})
        llm_engine = llm_settings.get("engine", {})
        engine_name = llm_engine.get("name", "openai")
        model = llm_engine.get("model", model)
        
        creds = project.settings.get("creds", {}).get("llm", {})
        
        if engine_name == "azure-openai":
            azure_creds = creds.get("azure", {})
            api_key = azure_creds.get("apiKey")
            endpoint = azure_creds.get("endpoint")
            api_version = azure_creds.get("apiVersion", "2024-10-21")
        else:
            openai_creds = creds.get("openai", {})
            api_key = openai_creds.get("apiKey")
    
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
    
    # Prepare parameters for voice assignment
    assignment_kwargs = {
        "characters": characters,
        "available_voices": available_voices,
        "api_key": api_key,
        "model": model,
        "engine_name": engine_name
    }
    
    # Add Azure-specific parameters if using Azure OpenAI
    if engine_name == "azure-openai":
        assignment_kwargs["azure_endpoint"] = endpoint
        assignment_kwargs["azure_api_version"] = api_version
    
    assigned_characters = await assign_voices_with_llm(**assignment_kwargs)
    
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


@router.post("/projects/{project_id}/characters/audition")
async def audition_character_voice(
    project_id: str,
    request: dict,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings)
):
    """
    Generate audio for character voice audition
    
    This endpoint uses a two-tier caching system:
    - L2 (Backend): Database + Azure Blob Storage with 30-day TTL
    - L1 (Frontend): In-memory cache for same-session requests
    
    Args:
        project_id: Project ID
        request: Audition request containing voice settings and text
        db: Database session
        
    Returns:
        Audio data (audio/mpeg)
    """
    from fastapi.responses import Response
    from shared.services.audio_cache import get_audio_cache_service
    from services.voices.azure_tts import generate_audio
    
    logger.info(f"🎤 Audition request for project {project_id}")
    
    # Get project
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Extract request parameters
    voice_id = request.get("voice")
    text = request.get("text")
    style = request.get("style")
    styledegree = request.get("styledegree")
    rate_pct = request.get("rate_pct")
    pitch_pct = request.get("pitch_pct")
    
    if not voice_id or not text:
        raise HTTPException(status_code=400, detail="voice and text are required")
    
    # Get Azure credentials from project settings
    azure_key = project.settings.get("azure_tts_key") if project.settings else None
    azure_region = project.settings.get("azure_tts_region") if project.settings else None
    
    if not azure_key or not azure_region:
        raise HTTPException(
            status_code=400,
            detail="Azure TTS credentials not configured in project settings"
        )
    
    # Prepare voice settings for cache key
    voice_settings = {
        "style": style,
        "styledegree": styledegree,
        "rate_pct": rate_pct,
        "pitch_pct": pitch_pct
    }
    
    # Get audio cache service
    from shared.services.blob_storage import BlobStorageService
    
    cached_audio = None
    use_cache = False
    
    try:
        # Try to get blob storage credentials from project settings
        storage_config = project.settings.get("creds", {}).get("storage", {}).get("azure", {})
        
        blob_service = None
        if storage_config.get("accountName") and storage_config.get("accessKey"):
            # Build connection string from project settings
            account_name = storage_config["accountName"]
            access_key = storage_config["accessKey"]
            container_name = storage_config.get("containerName", "audios")
            
            connection_string = f"DefaultEndpointsProtocol=https;AccountName={account_name};AccountKey={access_key};EndpointSuffix=core.windows.net"
            
            blob_service = BlobStorageService(settings, connection_string, container_name)
            logger.info(f"📦 Using project-specific blob storage: {account_name}/{container_name}")
        else:
            # Fall back to global settings
            blob_service = BlobStorageService(settings)
            logger.info("📦 Using global blob storage settings")
        
        audio_cache_service = await get_audio_cache_service(current_user.tenant_id, blob_service, settings)
        use_cache = blob_service.is_configured
        
        if use_cache:
            # Check L2 cache (Database + Blob Storage)
            logger.info(f"🔍 Checking L2 cache for voice {voice_id}")
            cached_audio = await audio_cache_service.get_cached_audio(
                db=db,
                tenant_id=str(project.tenant_id),
                text=text,
                voice_id=voice_id,
                voice_settings=voice_settings
            )
    except Exception as e:
        logger.warning(f"⚠️ Cache check failed, proceeding without cache: {e}")
        use_cache = False
    
    if cached_audio:
        logger.info(f"✅ L2 cache hit! Returning cached audio")
        return Response(
            content=cached_audio,
            media_type="audio/mpeg",
            headers={
                "X-Cache-Status": "HIT-L2",
                "Cache-Control": "public, max-age=1800"  # 30 minutes for frontend L1 cache
            }
        )
    
    # L2 cache miss - generate audio via Azure TTS
    logger.info(f"❌ L2 cache miss, generating audio via Azure TTS")
    
    try:
        # Extract locale from voice ID (e.g., "es-AR-ElenaNeural" -> "es-AR")
        locale = "-".join(voice_id.split("-")[:2]) if "-" in voice_id else "en-US"
        
        # Generate audio
        audio_data = await generate_audio(
            voice_id=voice_id,
            text=text,
            locale=locale,
            azure_key=azure_key,
            azure_region=azure_region,
            style=style,
            style_degree=styledegree,
            rate_pct=rate_pct,
            pitch_pct=pitch_pct
        )
        
        # Store in L2 cache for future use (if cache is available)
        if use_cache:
            try:
                logger.info(f"💾 Storing audio in L2 cache")
                await audio_cache_service.store_cached_audio(
                    db=db,
                    tenant_id=str(project.tenant_id),
                    text=text,
                    voice_id=voice_id,
                    voice_settings=voice_settings,
                    audio_data=audio_data
                )
                logger.info(f"✅ Audio generated and cached successfully")
            except Exception as e:
                logger.warning(f"⚠️ Failed to cache audio: {e}")
        else:
            logger.info(f"✅ Audio generated successfully (cache not available)")
            
        return Response(
            content=audio_data,
            media_type="audio/mpeg",
            headers={
                "X-Cache-Status": "MISS",
                "Cache-Control": "public, max-age=1800"  # 30 minutes for frontend L1 cache
            }
        )
        
    except ValueError as e:
        logger.error(f"❌ Configuration error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"❌ TTS generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate audio: {str(e)}"
        )
