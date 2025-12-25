"""
Migrate segments from chapter_plans.segments JSONB to segments table
"""
import asyncio
import json
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from shared.db.database import AsyncSessionLocal

async def migrate_segments():
    """Migrate all segments from JSONB to normalized table"""
    async with AsyncSessionLocal() as db:
        print("Starting segment migration...")
        
        # Get all chapter plans with their segments
        result = await db.execute(text("""
            SELECT id, segments 
            FROM chapter_plans 
            ORDER BY created_at
        """))
        plans = result.fetchall()
        
        print(f"Found {len(plans)} chapter plans to process")
        
        total_segments = 0
        migrated_segments = 0
        
        for plan in plans:
            plan_id = plan.id
            segments_json = plan.segments
            
            if not segments_json:
                print(f"  Plan {plan_id}: No segments")
                continue
            
            segment_count = len(segments_json)
            total_segments += segment_count
            print(f"  Plan {plan_id}: Processing {segment_count} segments...")
            
            # Insert each segment
            for segment in segments_json:
                try:
                    # Extract metadata (other fields not in main columns)
                    metadata_dict = {k: v for k, v in segment.items() 
                                   if k not in ["id", "order", "text", "voice", "needsRevision"]}
                    
                    await db.execute(text("""
                        INSERT INTO segments (
                            id,
                            chapter_plan_id,
                            order_index,
                            text,
                            voice,
                            needs_revision,
                            metadata,
                            created_at,
                            updated_at
                        ) VALUES (
                            :id,
                            :chapter_plan_id,
                            :order_index,
                            :text,
                            :voice,
                            :needs_revision,
                            :metadata,
                            now(),
                            now()
                        )
                        ON CONFLICT (id) DO UPDATE SET
                            order_index = EXCLUDED.order_index,
                            text = EXCLUDED.text,
                            voice = EXCLUDED.voice,
                            needs_revision = EXCLUDED.needs_revision,
                            metadata = EXCLUDED.metadata,
                            updated_at = now()
                    """), {
                        "id": segment.get("id"),
                        "chapter_plan_id": str(plan_id),
                        "order_index": segment.get("order", 0),
                        "text": segment.get("text", ""),
                        "voice": segment.get("voice"),
                        "needs_revision": segment.get("needsRevision", False),
                        "metadata": json.dumps(metadata_dict) if metadata_dict else "{}"
                    })
                    migrated_segments += 1
                except Exception as e:
                    print(f"    ERROR migrating segment {segment.get('id')}: {e}")
                    continue
            
            await db.commit()
            print(f"    ✓ Migrated {segment_count} segments from this plan")
        
        # Verification
        result = await db.execute(text("SELECT COUNT(*) FROM segments"))
        final_count = result.scalar()
        
        print(f"\n{'='*60}")
        print("Migration complete!")
        print(f"  Total segments in JSONB: {total_segments}")
        print(f"  Segments migrated: {migrated_segments}")
        print(f"  Segments in table: {final_count}")
        print(f"{'='*60}")
        
        if final_count != total_segments:
            print(f"WARNING: Count mismatch! Expected {total_segments}, got {final_count}")
        else:
            print("✓ All segments migrated successfully")

if __name__ == "__main__":
    asyncio.run(migrate_segments())
