-- Migration: Normalize segments from JSONB to proper table with UUID FKs
-- Author: Database Schema Refactor
-- Date: 2025-12-22

-- Step 1: Create new segments table with proper UUID relationships
CREATE TABLE IF NOT EXISTS segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_plan_id UUID NOT NULL,
    order_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    voice CHARACTER VARYING(255),
    needs_revision BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB,  -- For any additional segment-specific data
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Foreign key to chapter_plans
    CONSTRAINT fk_segments_chapter_plan 
        FOREIGN KEY (chapter_plan_id) 
        REFERENCES chapter_plans(id) 
        ON DELETE CASCADE,
    
    -- Ensure unique ordering within a chapter plan
    CONSTRAINT uq_segments_chapter_order 
        UNIQUE(chapter_plan_id, order_index)
);

-- Create indexes for performance
CREATE INDEX idx_segments_chapter_plan ON segments(chapter_plan_id);
CREATE INDEX idx_segments_order ON segments(chapter_plan_id, order_index);
CREATE INDEX idx_segments_voice ON segments(voice);
CREATE INDEX idx_segments_needs_revision ON segments(needs_revision);

-- Step 2: Migrate data from chapter_plans.segments JSONB to new table
DO $$
DECLARE
    plan_record RECORD;
    segment_record JSONB;
    segment_order INTEGER;
BEGIN
    -- Loop through all chapter plans
    FOR plan_record IN SELECT id, segments FROM chapter_plans
    LOOP
        -- Loop through each segment in the JSONB array
        FOR segment_order IN 0..(jsonb_array_length(plan_record.segments) - 1)
        LOOP
            segment_record := plan_record.segments->segment_order;
            
            -- Insert segment with original UUID from JSONB
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
                (segment_record->>'id')::UUID,
                plan_record.id,
                (segment_record->>'order')::INTEGER,
                segment_record->>'text',
                segment_record->>'voice',
                COALESCE((segment_record->>'needsRevision')::BOOLEAN, false),
                segment_record - 'id' - 'order' - 'text' - 'voice' - 'needsRevision',  -- Store remaining fields in metadata
                now(),
                now()
            ) ON CONFLICT (id) DO NOTHING;  -- Skip if already exists
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Migrated % segments from JSONB to segments table', 
        (SELECT COUNT(*) FROM segments);
END $$;

-- Step 3: Fix audio_segment_metadata table
-- First, fix chapter_id to be proper UUID
ALTER TABLE audio_segment_metadata 
    ALTER COLUMN chapter_id TYPE uuid USING chapter_id::uuid;

-- Add foreign key for chapter_id
ALTER TABLE audio_segment_metadata
    DROP CONSTRAINT IF EXISTS fk_metadata_chapter;

ALTER TABLE audio_segment_metadata
    ADD CONSTRAINT fk_metadata_chapter 
        FOREIGN KEY (chapter_id) 
        REFERENCES chapters(id) 
        ON DELETE CASCADE;

-- Fix segment_id to be proper UUID and add FK
ALTER TABLE audio_segment_metadata
    ALTER COLUMN segment_id TYPE uuid USING segment_id::uuid;

ALTER TABLE audio_segment_metadata
    DROP CONSTRAINT IF EXISTS fk_metadata_segment;

ALTER TABLE audio_segment_metadata
    ADD CONSTRAINT fk_metadata_segment
        FOREIGN KEY (segment_id)
        REFERENCES segments(id)
        ON DELETE CASCADE;

-- Add FK from raw_audio_cache_key to audio_cache
ALTER TABLE audio_segment_metadata
    DROP CONSTRAINT IF EXISTS fk_metadata_cache_key;

ALTER TABLE audio_segment_metadata
    ADD CONSTRAINT fk_metadata_cache_key
        FOREIGN KEY (raw_audio_cache_key)
        REFERENCES audio_cache(cache_key)
        ON DELETE SET NULL;

-- Create better indexes on audio_segment_metadata
CREATE INDEX IF NOT EXISTS idx_metadata_segment ON audio_segment_metadata(segment_id);
CREATE INDEX IF NOT EXISTS idx_metadata_cache_key ON audio_segment_metadata(raw_audio_cache_key);

-- Step 4: Verification queries
DO $$
DECLARE
    segment_count INTEGER;
    jsonb_count INTEGER;
    orphaned_metadata INTEGER;
BEGIN
    SELECT COUNT(*) INTO segment_count FROM segments;
    SELECT SUM(jsonb_array_length(segments)) INTO jsonb_count FROM chapter_plans;
    SELECT COUNT(*) INTO orphaned_metadata 
        FROM audio_segment_metadata asm
        WHERE NOT EXISTS (SELECT 1 FROM segments s WHERE s.id = asm.segment_id);
    
    RAISE NOTICE 'Migration verification:';
    RAISE NOTICE '  - Segments in new table: %', segment_count;
    RAISE NOTICE '  - Segments in JSONB: %', jsonb_count;
    RAISE NOTICE '  - Orphaned metadata records: %', orphaned_metadata;
    
    IF segment_count != jsonb_count THEN
        RAISE WARNING 'Segment count mismatch! Expected %, got %', jsonb_count, segment_count;
    END IF;
    
    IF orphaned_metadata > 0 THEN
        RAISE WARNING 'Found % orphaned metadata records', orphaned_metadata;
    END IF;
END $$;

-- Output summary
SELECT 
    'Migration complete' as status,
    (SELECT COUNT(*) FROM segments) as segments_migrated,
    (SELECT COUNT(*) FROM chapter_plans) as chapter_plans_processed,
    (SELECT COUNT(DISTINCT chapter_plan_id) FROM segments) as chapters_with_segments;
