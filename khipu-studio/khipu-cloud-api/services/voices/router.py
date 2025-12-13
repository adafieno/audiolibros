"""
Voice audition router
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
import logging
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth.dependencies import get_current_user
from shared.db.database import get_db
from shared.models import Project
from services.voices.azure_tts import generate_audio
from sqlalchemy import select

logger = logging.getLogger(__name__)

router = APIRouter()


# Default audition texts by language and locale
AUDITION_TEXTS = {
    # English variants
    "en-US": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
    "en-GB": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
    "en-AU": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
    "en-CA": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
    "en-IE": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
    "en-IN": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
    "en-NZ": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
    "en-ZA": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
    "en-SG": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
    "en-HK": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
    "en-PH": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
    "en-KE": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
    "en-NG": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
    "en-TZ": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
    "en": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
    
    # Spanish variants
    "es-AR": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-BO": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-CL": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-CO": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-CR": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-CU": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-DO": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-EC": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-ES": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-GQ": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-GT": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-HN": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-MX": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-NI": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-PA": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-PE": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-PR": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-PY": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-SV": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-US": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-UY": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es-VE": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    "es": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
    
    # French variants
    "fr-FR": "Bonjour, je suis une voix que vous pouvez utiliser pour votre livre audio. Ceci est un échantillon de la façon dont je sonne quand je lis votre contenu.",
    "fr-CA": "Bonjour, je suis une voix que vous pouvez utiliser pour votre livre audio. Ceci est un échantillon de la façon dont je sonne quand je lis votre contenu.",
    "fr-BE": "Bonjour, je suis une voix que vous pouvez utiliser pour votre livre audio. Ceci est un échantillon de la façon dont je sonne quand je lis votre contenu.",
    "fr-CH": "Bonjour, je suis une voix que vous pouvez utiliser pour votre livre audio. Ceci est un échantillon de la façon dont je sonne quand je lis votre contenu.",
    "fr": "Bonjour, je suis une voix que vous pouvez utiliser pour votre livre audio. Ceci est un échantillon de la façon dont je sonne quand je lis votre contenu.",
    
    # German variants
    "de-DE": "Hallo, ich bin eine Stimme, die Sie für Ihr Hörbuch verwenden können. Dies ist eine Probe davon, wie ich klinge, wenn ich Ihren Inhalt lese.",
    "de-AT": "Hallo, ich bin eine Stimme, die Sie für Ihr Hörbuch verwenden können. Dies ist eine Probe davon, wie ich klinge, wenn ich Ihren Inhalt lese.",
    "de-CH": "Hallo, ich bin eine Stimme, die Sie für Ihr Hörbuch verwenden können. Dies ist eine Probe davon, wie ich klinge, wenn ich Ihren Inhalt lese.",
    "de": "Hallo, ich bin eine Stimme, die Sie für Ihr Hörbuch verwenden können. Dies ist eine Probe davon, wie ich klinge, wenn ich Ihren Inhalt lese.",
    
    # Italian variants
    "it-IT": "Ciao, sono una voce che puoi usare per il tuo audiolibro. Questo è un esempio di come suono quando leggo il tuo contenuto.",
    "it": "Ciao, sono una voce che puoi usare per il tuo audiolibro. Questo è un esempio di come suono quando leggo il tuo contenuto.",
    
    # Portuguese variants
    "pt-BR": "Olá, sou uma voz que você pode usar para seu audiolivro. Esta é uma amostra de como eu soou quando leio seu conteúdo.",
    "pt-PT": "Olá, sou uma voz que pode usar para o seu audiolivro. Esta é uma amostra de como soou quando leio o seu conteúdo.",
    "pt": "Olá, sou uma voz que você pode usar para seu audiolivro. Esta é uma amostra de como eu soou quando leio seu conteúdo.",
    
    # Chinese variants
    "zh-CN": "你好，我是一个可以用于您的有声书的语音。这是我阅读您的内容时声音的样本。",
    "zh-HK": "你好，我是一個可以用於您的有聲書的語音。這是我閱讀您的內容時聲音的樣本。",
    "zh-TW": "你好，我是一個可以用於您的有聲書的語音。這是我閱讀您的內容時聲音的樣本。",
    "zh": "你好，我是一个可以用于您的有声书的语音。这是我阅读您的内容时声音的样本。",
    
    # Japanese
    "ja-JP": "こんにちは、私はあなたのオーディオブックに使用できる音声です。これは、私があなたのコンテンツを読むときの音のサンプルです。",
    "ja": "こんにちは、私はあなたのオーディオブックに使用できる音声です。これは、私があなたのコンテンツを読むときの音のサンプルです。",
    
    # Korean
    "ko-KR": "안녕하세요, 저는 오디오북에 사용할 수 있는 음성입니다. 이것은 제가 당신의 콘텐츠를 읽을 때 어떤 소리를 내는지에 대한 샘플입니다.",
    "ko": "안녕하세요, 저는 오디오북에 사용할 수 있는 음성입니다. 이것은 제가 당신의 콘텐츠를 읽을 때 어떤 소리를 내는지에 대한 샘플입니다.",
    
    # Hindi
    "hi-IN": "नमस्ते, मैं एक आवाज़ हूँ जिसका उपयोग आप अपनी ऑडियो बुक के लिए कर सकते हैं। यह इस बात का नमूना है कि जब मैं आपकी सामग्री पढ़ती हूँ तो मैं कैसी आवाज़ करती हूँ।",
    "hi": "नमस्ते, मैं एक आवाज़ हूँ जिसका उपयोग आप अपनी ऑडियो बुक के लिए कर सकते हैं। यह इस बात का नमूना है कि जब मैं आपकी सामग्री पढ़ती हूँ तो मैं कैसी आवाज़ करती हूँ।",
    
    # Arabic variants
    "ar-AE": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    "ar-BH": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    "ar-DZ": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    "ar-EG": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    "ar-IQ": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    "ar-JO": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    "ar-KW": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    "ar-LB": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    "ar-LY": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    "ar-MA": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    "ar-OM": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    "ar-QA": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    "ar-SA": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    "ar-SY": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    "ar-TN": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    "ar-YE": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    "ar": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
    
    # Russian
    "ru-RU": "Здравствуйте, я голос, который вы можете использовать для вашей аудиокниги. Это образец того, как я звучу, когда читаю ваш контент.",
    "ru": "Здравствуйте, я голос, который вы можете использовать для вашей аудиокниги. Это образец того, как я звучу, когда читаю ваш контент.",
    
    # Dutch
    "nl-NL": "Hallo, ik ben een stem die je kunt gebruiken voor je audioboek. Dit is een voorbeeld van hoe ik klink wanneer ik je inhoud lees.",
    "nl-BE": "Hallo, ik ben een stem die je kunt gebruiken voor je audioboek. Dit is een voorbeeld van hoe ik klink wanneer ik je inhoud lees.",
    "nl": "Hallo, ik ben een stem die je kunt gebruiken voor je audioboek. Dit is een voorbeeld van hoe ik klink wanneer ik je inhoud lees.",
    
    # Polish
    "pl-PL": "Cześć, jestem głosem, którego możesz użyć do swojego audiobooka. To jest próbka tego, jak brzmię, gdy czytam twoje treści.",
    "pl": "Cześć, jestem głosem, którego możesz użyć do swojego audiobooka. To jest próbka tego, jak brzmię, gdy czytam twoje treści.",
    
    # Turkish
    "tr-TR": "Merhaba, sesli kitabınız için kullanabileceğiniz bir sesim. Bu, içeriğinizi okurken nasıl ses çıkardığımın bir örneğidir.",
    "tr": "Merhaba, sesli kitabınız için kullanabileceğiniz bir sesim. Bu, içeriğinizi okurken nasıl ses çıkardığımın bir örneğidir.",
    
    # Swedish
    "sv-SE": "Hej, jag är en röst som du kan använda för din ljudbok. Detta är ett prov på hur jag låter när jag läser ditt innehåll.",
    "sv": "Hej, jag är en röst som du kan använda för din ljudbok. Detta är ett prov på hur jag låter när jag läser ditt innehåll.",
    
    # Norwegian
    "nb-NO": "Hei, jeg er en stemme du kan bruke til lydboken din. Dette er et eksempel på hvordan jeg høres ut når jeg leser innholdet ditt.",
    "nb": "Hei, jeg er en stemme du kan bruke til lydboken din. Dette er et eksempel på hvordan jeg høres ut når jeg leser innholdet ditt.",
    
    # Danish
    "da-DK": "Hej, jeg er en stemme, du kan bruge til din lydbog. Dette er et eksempel på, hvordan jeg lyder, når jeg læser dit indhold.",
    "da": "Hej, jeg er en stemme, du kan bruge til din lydbog. Dette er et eksempel på, hvordan jeg lyder, når jeg læser dit indhold.",
    
    # Finnish
    "fi-FI": "Hei, olen ääni, jota voit käyttää äänikirjaasi. Tämä on näyte siitä, miltä kuulostan lukiessani sisältöäsi.",
    "fi": "Hei, olen ääni, jota voit käyttää äänikirjaasi. Tämä on näyte siitä, miltä kuulostan lukiessani sisältöäsi.",
    
    # Czech
    "cs-CZ": "Ahoj, jsem hlas, který můžete použít pro svou audioknihu. Toto je ukázka toho, jak zním, když čtu váš obsah.",
    "cs": "Ahoj, jsem hlas, který můžete použít pro svou audioknihu. Toto je ukázka toho, jak zním, když čtu váš obsah.",
    
    # Thai
    "th-TH": "สวัสดี ฉันเป็นเสียงที่คุณสามารถใช้สำหรับหนังสือเสียงของคุณ นี่คือตัวอย่างของเสียงของฉันเมื่ออ่านเนื้อหาของคุณ",
    "th": "สวัสดี ฉันเป็นเสียงที่คุณสามารถใช้สำหรับหนังสือเสียงของคุณ นี่คือตัวอย่างของเสียงของฉันเมื่ออ่านเนื้อหาของคุณ",
    
    # Vietnamese
    "vi-VN": "Xin chào, tôi là giọng nói mà bạn có thể sử dụng cho sách nói của mình. Đây là mẫu về âm thanh của tôi khi đọc nội dung của bạn.",
    "vi": "Xin chào, tôi là giọng nói mà bạn có thể sử dụng cho sách nói của mình. Đây là mẫu về âm thanh của tôi khi đọc nội dung của bạn.",
    
    # Default fallback
    "default": "Hello, this is a voice audition sample for your audiobook project."
}


class AuditionRequest(BaseModel):
    """Request body for voice audition"""
    text: Optional[str] = None
    style: Optional[str] = None
    style_degree: Optional[float] = None
    rate_pct: Optional[int] = None
    pitch_pct: Optional[int] = None


class ProjectVoiceSettings(BaseModel):
    """Project voice settings"""
    selectedVoiceIds: list[str] = []
    selectedLanguages: list[str] = []


@router.get("/voices")
async def get_voice_inventory():
    """
    Get available voice inventory at /api/v1/voices
    
    Returns:
        Empty voice inventory (frontend will use local fallback)
    """
    # Return empty inventory - frontend has comprehensive local JSON
    # This endpoint exists to prevent 404 errors
    return {"voices": []}


@router.get("/projects/{project_id}/voices")
async def get_project_voice_settings(
    project_id: str,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get project voice settings (selected voices) at /api/v1/projects/{project_id}/voices
    
    Args:
        project_id: Project ID
        
    Returns:
        Project voice settings
    """
    try:
        result = await db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get voice settings from project.settings
        voice_settings = project.settings.get("voices", {})
        selected_voice_ids = voice_settings.get("selectedVoiceIds", [])
        selected_languages = voice_settings.get("selectedLanguages", [])
        
        logger.info(f"Loading voice settings for project {project_id}")
        logger.info(f"Returning: voiceIds count={len(selected_voice_ids)}, languages={selected_languages}")
        
        return {
            "selectedVoiceIds": selected_voice_ids,
            "selectedLanguages": selected_languages
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting project voice settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get voice settings: {str(e)}")


@router.put("/projects/{project_id}/voices")
async def update_project_voice_settings(
    project_id: str,
    settings: ProjectVoiceSettings,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Update project voice settings (selected voices) at /api/v1/projects/{project_id}/voices
    
    Args:
        project_id: Project ID
        settings: Voice settings to update
        
    Returns:
        Updated voice settings
    """
    try:
        logger.info(f"Updating voice settings for project {project_id}")
        logger.info(f"Received: voiceIds={settings.selectedVoiceIds}, languages={settings.selectedLanguages}")
        
        result = await db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Update voice settings in project.settings
        if not project.settings:
            project.settings = {}
        
        if "voices" not in project.settings:
            project.settings["voices"] = {}
        
        project.settings["voices"]["selectedVoiceIds"] = settings.selectedVoiceIds
        project.settings["voices"]["selectedLanguages"] = settings.selectedLanguages
        
        # Mark as modified for SQLAlchemy to detect the change
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(project, "settings")
        
        await db.commit()
        
        logger.info(f"Saved: voiceIds count={len(settings.selectedVoiceIds)}, languages={settings.selectedLanguages}")
        
        return {
            "selectedVoiceIds": settings.selectedVoiceIds,
            "selectedLanguages": settings.selectedLanguages
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating project voice settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to update voice settings: {str(e)}")


@router.post("/projects/{project_id}/voices/{voice_id}/audition")
async def audition_voice(
    project_id: str,
    voice_id: str,
    request: AuditionRequest,
    current_user = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate an audio preview for a voice at /api/v1/projects/{project_id}/voices/{voice_id}/audition
    
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
        
        # Get audition text with fallback logic
        text = request.text
        if not text:
            # Try exact locale match first (e.g., "es-AR")
            if locale in AUDITION_TEXTS:
                text = AUDITION_TEXTS[locale]
                logger.info(f"Using locale-specific text for {locale}")
            # Try language code fallback (e.g., "es")
            elif language in AUDITION_TEXTS:
                text = AUDITION_TEXTS[language]
                logger.info(f"Using language fallback text for {language}")
            # Final fallback
            else:
                text = AUDITION_TEXTS["default"]
                logger.info(f"Using default text (locale: {locale}, language: {language} not found)")
        
        logger.info(f"Audition request for voice {voice_id}, locale: {locale}, language: {language}, text preview: {text[:50]}...")
        
        # Get project and Azure credentials
        result = await db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Extract Azure credentials from project settings
        azure_key = project.settings.get("creds", {}).get("tts", {}).get("azure", {}).get("key")
        azure_region = project.settings.get("creds", {}).get("tts", {}).get("azure", {}).get("region")
        
        if not azure_key or not azure_region:
            raise HTTPException(
                status_code=400,
                detail="Azure TTS credentials not configured in project settings. Please add Azure key and region in Project Settings."
            )
        
        # Generate audio
        audio_data = await generate_audio(
            voice_id=voice_id,
            text=text,
            locale=locale,
            azure_key=azure_key,
            azure_region=azure_region,
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
