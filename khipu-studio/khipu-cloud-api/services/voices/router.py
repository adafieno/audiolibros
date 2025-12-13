"""
Voice audition router
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
import logging

from shared.auth.dependencies import get_current_user
from services.voices.azure_tts import generate_audio

logger = logging.getLogger(__name__)

router = APIRouter()


# Default audition texts by language
AUDITION_TEXTS = {
    "es": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "en": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
    "fr": "Bonjour, je suis une voix que vous pouvez utiliser pour votre livre audio. Ceci est un échantillon de la façon dont je sonne quand je lis votre contenu.",
    "de": "Hallo, ich bin eine Stimme, die Sie für Ihr Hörbuch verwenden können. Dies ist eine Probe davon, wie ich klinge, wenn ich Ihren Inhalt lese.",
    "it": "Ciao, sono una voce che puoi usare per il tuo audiolibro. Questo è un esempio di come suono quando leggo il tuo contenuto.",
    "pt": "Olá, sou uma voz que você pode usar para seu audiolivro. Esta é uma amostra de como eu soou quando leio seu conteúdo.",
}


class AuditionRequest(BaseModel):
    """Request body for voice audition"""
    text: Optional[str] = None
    style: Optional[str] = None
    style_degree: Optional[float] = None
    rate_pct: Optional[int] = None
    pitch_pct: Optional[int] = None


@router.post("/{project_id}/voices/{voice_id}/audition")
async def audition_voice(
    project_id: str,
    voice_id: str,
    request: AuditionRequest,
    current_user = Depends(get_current_user)
):
    """
    Generate an audio preview for a voice
    
    Args:
        project_id: Project ID (for authorization)
        voice_id: Voice ID in format "locale-Name" (e.g., "es-AR-ElenaNeural")
        request: Optional parameters for audition
        
    Returns:
        Audio file in WAV format
    """
    try:
        # Extract locale from voice_id (e.g., "es-AR-ElenaNeural" -> "es-AR")
        parts = voice_id.split('-')
        if len(parts) < 2:
            raise HTTPException(status_code=400, detail="Invalid voice ID format")
        
        locale = f"{parts[0]}-{parts[1]}"
        language = parts[0]
        
        # Get audition text
        text = request.text
        if not text:
            # Use default text for the language
            text = AUDITION_TEXTS.get(language, AUDITION_TEXTS["en"])
        
        logger.info(f"Audition request for voice {voice_id}, project {project_id}")
        
        # Generate audio
        audio_data = await generate_audio(
            voice_id=voice_id,
            text=text,
            locale=locale,
            style=request.style,
            style_degree=request.style_degree,
            rate_pct=request.rate_pct,
            pitch_pct=request.pitch_pct
        )
        
        # Return audio as response
        return Response(
            content=audio_data,
            media_type="audio/wav",
            headers={
                "Content-Disposition": f'inline; filename="{voice_id}-audition.wav"'
            }
        )
        
    except ValueError as e:
        logger.error(f"Configuration error: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error generating audition: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate audio preview: {str(e)}"
        )
