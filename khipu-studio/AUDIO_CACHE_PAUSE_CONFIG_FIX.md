# Cache Invalidation Fix - Pause Configuration

## Overview

This update fixes a cache invalidation bug where changes to project pause configuration (sentence, paragraph, comma pauses, etc.) did not invalidate cached audio segments. The issue occurred because pause settings were not included in the cache key generation.

## Problem

**Before this fix:**
1. User generates audio with pause settings: `commaMs: 300`
2. Audio is cached with key: `hash(text + voice + prosody)`
3. User changes pause settings: `commaMs: 600`
4. System retrieves same cached audio (cache key unchanged)
5. **Result:** Audio played with old 300ms pauses instead of new 600ms pauses

## Solution

### 1. Updated Cache Key Generation

Modified `AudioCacheService.generate_cache_key()` to include `pause_config` parameter:

```python
@staticmethod
def generate_cache_key(
    text: str,
    voice_id: str,
    voice_settings: Optional[Dict[str, Any]] = None,
    pause_config: Optional[Dict[str, int]] = None,  # NEW
    tenant_id: Optional[UUID] = None,
    tts_provider: str = "azure"
) -> str:
```

The cache key now includes:
- `sentenceMs` - Pause after sentences
- `paragraphMs` - Pause after paragraphs  
- `chapterMs` - Pause after chapters
- `commaMs` - Pause after commas
- `colonMs` - Pause after colons
- `semicolonMs` - Pause after semicolons

**After this fix:**
```python
# Each pause configuration gets unique cache entry
cache_key_v1 = hash(text + voice + prosody + {commaMs: 300, ...})
cache_key_v2 = hash(text + voice + prosody + {commaMs: 600, ...})
# Different keys → cache miss → regenerate audio with new pauses
```

### 2. Updated Audio Generation Endpoints

Modified two endpoints to retrieve and pass pause configuration:

#### `/projects/{id}/chapters/{id}/segments/{id}/audio`
Extracts pause config from `project.settings.pauses` and passes to:
- `get_cached_audio()` - Cache lookup
- `store_cached_audio()` - Cache storage
- `generate_cache_key()` - Metadata updates

#### `/projects/{id}/chapters/{id}/audio-production`
Same pause config extraction and propagation for chapter-level audio production.

### 3. Orphaned Cache Cleanup Script

Created `scripts/cleanup_orphaned_audio_cache.py` to manage orphaned cache entries.

**What are orphaned entries?**
- Cache entries created before pause config was added to cache key
- Entries not accessed in X days (default: 30)
- Entries with `hit_count=0` older than threshold

**Features:**
- **Safe dry-run mode** (default): Shows what would be deleted
- **Execute mode**: Actually deletes entries
- Removes entries from both PostgreSQL and Azure Blob Storage
- Tenant filtering support
- Detailed storage impact reporting

**Usage:**

```bash
# Dry-run mode (safe, shows what would be deleted)
python scripts/cleanup_orphaned_audio_cache.py

# Execute mode (actually deletes)
python scripts/cleanup_orphaned_audio_cache.py --execute

# Custom threshold (45 days since last access)
python scripts/cleanup_orphaned_audio_cache.py --days 45 --execute

# Filter by tenant
python scripts/cleanup_orphaned_audio_cache.py --tenant-id <UUID> --execute
```

**Example output:**
```
================================================================================
🧹 Audio Cache Cleanup Script
================================================================================
Mode: DRY-RUN (safe, no changes)
Days threshold: 30
================================================================================
🔍 Finding cache entries not accessed since 2024-11-15T10:30:00+00:00
📊 Found 142 orphaned cache entries

📊 Storage Impact:
   Total entries: 142
   Total size: 2.456 GB (2456.12 MB)
   Tenants affected: 3
      - abc123...: 89 entries
      - def456...: 42 entries
      - ghi789...: 11 entries

================================================================================
🔍 DRY-RUN MODE - Showing entries that would be deleted:
================================================================================
[1/142] [DRY-RUN] Would delete cache entry: a3f2e1... (size: 18.5 MB)
...
================================================================================
📊 Cleanup Summary:
================================================================================
Total entries processed: 142
Successful: 142

ℹ️  This was a DRY-RUN. No changes were made.
   To actually delete these entries, run with --execute flag
================================================================================
```

## Files Modified

### Core Cache Service
- `khipu-cloud-api/shared/services/audio_cache.py`
  - `generate_cache_key()` - Added `pause_config` parameter
  - `get_cached_audio()` - Added `pause_config` parameter
  - `store_cached_audio()` - Added `pause_config` parameter

### Audio Production Endpoints
- `khipu-cloud-api/services/audio/router.py`
  - `generate_segment_audio()` - Extract and pass pause config
  - `get_chapter_audio_production_data()` - Extract and pass pause config

### Test Files
- `khipu-cloud-api/test_fallback.py` - Updated to pass `pause_config=None`

### New Files
- `khipu-cloud-api/scripts/cleanup_orphaned_audio_cache.py` - Cleanup script

## Impact on Existing Cache

**Behavior:**
- Old cache entries (without pause config in key) become inaccessible
- New cache entries are created with pause config in key
- Old entries remain in database/blob storage until cleaned up

**This is correct behavior:**
- Old cached audio has different pause durations (unknown/wrong)
- Must regenerate audio with correct pause configuration
- Cleanup script removes orphaned entries to free storage

## Deployment Steps

1. **Deploy code changes** - Update API with new cache key logic
2. **Monitor cache miss rate** - Expect temporary increase as entries regenerate
3. **Run cleanup script (dry-run)** - Review what will be deleted
   ```bash
   python scripts/cleanup_orphaned_audio_cache.py
   ```
4. **Run cleanup script (execute)** - Remove orphaned entries
   ```bash
   python scripts/cleanup_orphaned_audio_cache.py --execute
   ```
5. **Schedule regular cleanups** - Run weekly/monthly to prevent storage bloat

## Testing

### Test Cache Invalidation
1. Create project with default pause settings
2. Generate audio for a segment
3. Verify audio is cached (check logs for "Cache HIT")
4. Change pause configuration (e.g., `commaMs: 300 → 600`)
5. Regenerate same segment
6. Verify cache miss (logs show "Cache MISS")
7. Verify new audio has updated pause durations

### Test Cleanup Script
1. Run in dry-run mode: `python scripts/cleanup_orphaned_audio_cache.py`
2. Verify output shows correct entries
3. Run with `--execute` flag
4. Verify database entries deleted
5. Verify blob storage entries deleted
6. Verify correct entries still accessible

## Rollback Plan

If issues occur:
1. Revert code changes to previous version
2. Old cache entries will be accessible again
3. New entries (with pause config) will become orphaned
4. Run cleanup script to remove new entries if needed

## Performance Considerations

- **Cache miss rate:** Temporary increase after deployment (all entries regenerate)
- **Storage:** Orphaned entries consume storage until cleaned up
- **TTS costs:** Regenerating audio incurs TTS API costs
- **Cleanup impact:** Minimal - script processes entries sequentially

## Future Enhancements

1. **Automatic cleanup:** Schedule periodic cleanup job
2. **Metrics:** Track cache hit rate, orphaned entry count
3. **Versioned cache keys:** Add version prefix to cache keys for easier migrations
4. **Configuration presets:** Support named pause presets (e.g., "fast", "slow", "natural")
