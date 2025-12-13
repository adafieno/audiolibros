"""
Azure TTS service for voice audition
"""
import logging
from typing import Optional
import aiohttp

logger = logging.getLogger(__name__)


async def get_azure_token(region: str, api_key: str) -> str:
    """Get Azure TTS authentication token"""
    url = f"https://{region}.api.cognitive.microsoft.com/sts/v1.0/issuetoken"
    headers = {
        "Ocp-Apim-Subscription-Key": api_key
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers) as response:
            if response.status == 200:
                return await response.text()
            else:
                error_text = await response.text()
                raise Exception(f"Failed to get Azure token: {response.status} - {error_text}")


async def generate_audio(
    voice_id: str,
    text: str,
    locale: str,
    azure_key: str,
    azure_region: str,
    style: Optional[str] = None,
    style_degree: Optional[float] = None,
    rate_pct: Optional[int] = None,
    pitch_pct: Optional[int] = None
) -> bytes:
    """
    Generate audio using Azure TTS
    
    Args:
        voice_id: Azure voice ID (e.g., "es-AR-ElenaNeural")
        text: Text to synthesize
        locale: Voice locale (e.g., "es-AR")
        azure_key: Azure TTS subscription key
        azure_region: Azure region (e.g., "eastus")
        style: Optional speaking style
        style_degree: Optional style intensity (0.01-2.0)
        rate_pct: Optional speech rate percentage (-100 to 200)
        pitch_pct: Optional pitch percentage (-50 to 50)
    
    Returns:
        Audio data as bytes (WAV format)
    """
    if not azure_key or not azure_region:
        raise ValueError("Azure TTS credentials not configured in project settings. Please add Azure key and region in Project Settings.")
    
    logger.info(f"Generating audio for voice {voice_id}")
    
    # Get authentication token
    token = await get_azure_token(azure_region, azure_key)
    
    # Build prosody attributes
    prosody_attrs = []
    if rate_pct is not None:
        sign = '+' if rate_pct > 0 else ''
        prosody_attrs.append(f'rate="{sign}{rate_pct}%"')
    if pitch_pct is not None:
        sign = '+' if pitch_pct > 0 else ''
        prosody_attrs.append(f'pitch="{sign}{pitch_pct}%"')
    
    # Build SSML
    inner_content = text
    
    # Wrap in prosody if we have prosody attributes
    if prosody_attrs:
        prosody_str = ' '.join(prosody_attrs)
        inner_content = f'<prosody {prosody_str}>{inner_content}</prosody>'
    
    # Wrap in express-as if we have style
    if style and style != "none":
        style_degree_attr = f' styledegree="{style_degree}"' if style_degree else ''
        inner_content = f'<mstts:express-as style="{style}"{style_degree_attr}>{inner_content}</mstts:express-as>'
    
    ssml = f'''<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="{locale}">
      <voice name="{voice_id}">
        {inner_content}
      </voice>
    </speak>'''
    
    # Call Azure TTS API
    url = f"https://{azure_region}.tts.speech.microsoft.com/cognitiveservices/v1"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/ssml+xml; charset=utf-8",
        "X-Microsoft-OutputFormat": "riff-16khz-16bit-mono-pcm",  # WAV format
        "User-Agent": "KhipuCloudAPI/1.0"
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, data=ssml.encode('utf-8')) as response:
            if response.status == 200:
                audio_data = await response.read()
                logger.info(f"Successfully generated {len(audio_data)} bytes of audio")
                return audio_data
            else:
                error_text = await response.text()
                logger.error(f"Azure TTS error: {response.status} - {error_text}")
                raise Exception(f"Azure TTS request failed: {response.status} - {error_text}")
