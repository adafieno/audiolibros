import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from shared.models import ChapterPlan, AudioCache, Project
from shared.services.audio_cache import AudioCacheService

async def test():
    engine = create_async_engine('postgresql+asyncpg://khipu:local_dev_password@postgres:5432/khipu_dev')
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        # Get PUNTAJADA chapter plan
        result = await db.execute(
            select(ChapterPlan).where(ChapterPlan.id == '595e5389-484b-4597-8327-214a41b7aa99')
        )
        plan = result.scalar_one_or_none()
        
        # Get project
        proj_result = await db.execute(
            select(Project).where(Project.id == 'bb476fec-2c2d-4bc5-b3b5-25ae502a81f7')
        )
        project = proj_result.scalar_one_or_none()
        
        if plan and project:
            print(f'Chapter has {len(plan.segments)} segments')
            first_seg = plan.segments[0] if plan.segments else None
            if first_seg:
                print(f'First segment: {first_seg.get("text", "")[:60]}...')
                character_name = first_seg.get('voice')
                print(f'Character name: {character_name}')
                
                # Look up Azure voice ID
                azure_voice_id = None
                if isinstance(project.settings.get("characters"), list):
                    for char_data in project.settings["characters"]:
                        if char_data.get("name") == character_name:
                            azure_voice_id = char_data.get("voiceAssignment", {}).get("voiceId")
                            print(f'Found Azure voice ID: {azure_voice_id}')
                            break
                
                if not azure_voice_id:
                    print(f'ERROR: No Azure voice ID found for character "{character_name}"')
                    return
                
                # Compute cache key with Azure voice ID
                text = first_seg.get('text')
                cache_key = AudioCacheService.generate_cache_key(
                    text=text,
                    voice_id=azure_voice_id,
                    voice_settings={'style': None, 'style_degree': None, 'rate_pct': None, 'pitch_pct': None},
                    pause_config=None  # Use None for test - will use cache key without pause config
                )
                
                print(f'Computed cache_key: {cache_key}')
                
                # Check if exists in cache
                cache_result = await db.execute(
                    select(AudioCache).where(AudioCache.cache_key == cache_key)
                )
                cache_entry = cache_result.scalar_one_or_none()
                print(f'Cache entry found: {cache_entry is not None}')
                if cache_entry:
                    print(f'Duration: {cache_entry.audio_duration_seconds}s')
        else:
            print('Chapter plan or project not found')

if __name__ == '__main__':
    asyncio.run(test())
