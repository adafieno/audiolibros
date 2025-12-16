-- PostgreSQL Migration Script
-- Migration: Add id and order fields to segments, separate identity from ordering
-- This script transforms segment_id (used for both identity and ordering) into:
--   - id: UUID for stable identity
--   - order: Sequential integer for ordering (0, 1, 2, 3...)
--   - segment_id: Kept temporarily for backward compatibility

-- Step 1: Update all chapter_plans to add id and order fields
UPDATE chapter_plans
SET segments = (
    SELECT jsonb_agg(
        segment || 
        jsonb_build_object(
            'id', gen_random_uuid()::text,
            'order', (ordinality - 1)::integer
        )
        ORDER BY ordinality
    )
    FROM jsonb_array_elements(segments) WITH ORDINALITY AS t(segment, ordinality)
)
WHERE segments IS NOT NULL;

-- Verify the migration
SELECT 
    id as plan_id,
    jsonb_array_length(segments) as segment_count,
    segments->0->>'id' as first_segment_id,
    segments->0->>'order' as first_segment_order,
    segments->0->>'segment_id' as first_segment_old_id
FROM chapter_plans
WHERE segments IS NOT NULL;
