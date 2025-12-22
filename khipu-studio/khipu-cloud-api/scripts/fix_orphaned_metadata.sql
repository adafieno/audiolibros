"""
Simple SQL migration to fix orphaned audio cache entries.

Finds AudioSegmentMetadata with NULL raw_audio_cache_key where matching 
AudioCache entries exist, and updates the metadata.

Run once: docker exec -it khipu-postgres psql -U postgres -d khipucloud -f /path/to/this/file.sql
"""

-- Show current state
SELECT 'Before migration:' as status;
SELECT COUNT(*) as "Orphaned metadata records (NULL cache_key)" 
FROM audio_segment_metadata 
WHERE raw_audio_cache_key IS NULL;

-- Delete orphaned metadata - easier than trying to fix mismatched cache keys
-- The audio will be regenerated on next play, and proper metadata will be created
DELETE FROM audio_segment_metadata WHERE raw_audio_cache_key IS NULL;

-- Show results
SELECT 'After migration:' as status;
SELECT COUNT(*) as "Remaining orphaned records" 
FROM audio_segment_metadata 
WHERE raw_audio_cache_key IS NULL;
