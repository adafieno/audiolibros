# Audio Cache Implementation Documentation

## Overview

This document describes the **two-tier audio caching system** implemented for Khipu Studio's web application. The system optimizes cost and performance by caching TTS-generated audio at two levels:

- **L1 Cache (Frontend)**: In-memory cache for same-session requests (100MB, 30min TTL)
- **L2 Cache (Backend)**: Database + Azure Blob Storage for persistent, cross-user caching (30 days TTL)

## Architecture

### Two-Tier Caching Flow

```
User Request
    ↓
Frontend L1 Cache (Memory)
    ↓ (miss)
API Call to Backend
    ↓
Backend L2 Cache (DB + Blob)
    ↓ (miss)
Azure TTS Generation
    ↓
Store in L2 Cache
    ↓
Return to Frontend
    ↓
Store in L1 Cache
```

### Benefits

1. **Cost Optimization**: Shared cache across all users
   - 100 users audition same text = 1 TTS call (not 100)
   - 99% cost reduction for repeated content
   
2. **Performance**: 
   - L1 provides instant playback for same-session repeats
   - L2 provides fast playback across sessions and users
   
3. **Scalability**: Cache hit rate increases with more users

4. **Persistence**: Survives page refreshes and benefits future users

## Implementation Details

### Database Schema

**Table: `audio_cache`**

```sql
CREATE TABLE audio_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    text TEXT NOT NULL,
    ssml TEXT,
    voice_id VARCHAR(255) NOT NULL,
    voice_settings JSONB,
    audio_blob_path TEXT NOT NULL,
    audio_url TEXT,
    audio_duration_seconds FLOAT,
    audio_file_size_bytes BIGINT,
    hit_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP
);

-- Indexes for efficient querying
CREATE UNIQUE INDEX ix_audio_cache_cache_key ON audio_cache(cache_key);
CREATE INDEX ix_audio_cache_tenant_id ON audio_cache(tenant_id);
CREATE INDEX ix_audio_cache_expires_at ON audio_cache(expires_at);
CREATE INDEX ix_audio_cache_last_accessed_at ON audio_cache(last_accessed_at);
```

### Cache Key Generation

Cache keys are deterministic SHA256 hashes ensuring identical requests reuse cached audio:

```python
cache_key = hashlib.sha256(
    json.dumps({
        "text": text,
        "voice_id": voice_id,
        "settings": voice_settings
    }, sort_keys=True).encode()
).hexdigest()
```

### Azure Blob Storage Structure

Audio files are stored in Azure Blob Storage with organized paths:

```
audio-cache/
  ├── {tenant_id}/
  │   ├── {cache_key_1}.mp3
  │   ├── {cache_key_2}.mp3
  │   └── ...
  └── {another_tenant_id}/
      ├── {cache_key_3}.mp3
      └── ...
```

### Backend Services

#### 1. BlobStorageService (`shared/services/blob_storage.py`)

Handles Azure Blob Storage operations:

- `upload_audio()`: Upload audio bytes to blob
- `download_audio()`: Download audio from blob
- `delete_audio()`: Delete blob
- `blob_exists()`: Check blob existence
- `generate_blob_path()`: Create standardized path

#### 2. AudioCacheService (`shared/services/audio_cache.py`)

Manages L2 cache logic:

- `generate_cache_key()`: Create deterministic cache key
- `get_cached_audio()`: Check DB → Verify expiration → Download from blob → Update hit count
- `store_cached_audio()`: Upload to blob → Create DB entry
- `cleanup_expired_cache()`: Delete entries where `expires_at < now`
- `cleanup_lru_cache()`: Keep only `max_entries` per tenant, delete oldest by `last_accessed_at`
- `get_cache_stats()`: Return cache metrics

#### 3. Audition Endpoint (`services/characters/router.py`)

API endpoint with integrated caching:

```python
POST /api/v1/projects/{project_id}/characters/audition

Request Body:
{
  "voice": "es-AR-ElenaNeural",
  "text": "Hola, soy Elena",
  "style": "cheerful",
  "styledegree": 1.0,
  "rate_pct": 0,
  "pitch_pct": 0
}

Response:
- 200 OK: Audio data (audio/mpeg)
- Headers:
  - X-Cache-Status: "HIT-L2" | "MISS"
  - Cache-Control: "public, max-age=1800"
```

**Flow:**
1. Check L2 cache (database + blob)
2. If hit: Return cached audio
3. If miss: Generate via Azure TTS → Store in L2 → Return audio

### Frontend Implementation

Frontend maintains L1 in-memory cache (`khipu-web/src/lib/audio-cache.ts`):

- **Max Size**: 100MB
- **TTL**: 30 minutes
- **Eviction**: LRU when over limit
- **Storage**: Map<cacheKey, {audioBlob, timestamp}>

The frontend calls the backend API for any L1 cache miss.

### Background Cleanup

Automated cleanup task runs hourly (`main.py`):

```python
async def cleanup_audio_cache_task():
    while True:
        await asyncio.sleep(3600)  # 1 hour
        
        # Delete expired entries (expires_at < now)
        deleted_expired = await audio_cache_service.cleanup_expired_cache(db)
        
        # Delete old entries via LRU (keep 10,000 most recent per tenant)
        deleted_lru = await audio_cache_service.cleanup_lru_cache(db, max_entries=10000)
        
        # Log cache statistics
        stats = await audio_cache_service.get_cache_stats(db)
```

## Configuration

### Environment Variables

Add to `.env`:

```bash
# Azure Blob Storage for audio cache
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
AZURE_STORAGE_ACCOUNT_NAME=khipustudio
AZURE_STORAGE_CONTAINER_NAME=audio-cache
```

### Project Settings

Each project must have Azure TTS credentials in `settings`:

```json
{
  "azure_tts_key": "YOUR_AZURE_KEY",
  "azure_tts_region": "eastus"
}
```

## Deployment

### 1. Database Migration

Run Alembic migration to create `audio_cache` table:

```bash
cd khipu-cloud-api
alembic upgrade head
```

### 2. Azure Blob Container

Create Azure Storage container:

```bash
az storage container create \
  --name audio-cache \
  --account-name khipustudio \
  --public-access off
```

### 3. Install Dependencies

Ensure `azure-storage-blob` is installed:

```bash
pip install azure-storage-blob==12.24.0
```

### 4. Start API Server

The cleanup task starts automatically on app startup:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Monitoring

### Cache Statistics

Query cache stats programmatically:

```python
stats = await audio_cache_service.get_cache_stats(db)
# Returns:
# {
#   "total_entries": 1234,
#   "total_size_mb": 45.67,
#   "total_hits": 5678,
#   "average_hits_per_entry": 4.6
# }
```

### Logs

Monitor application logs for cache activity:

```
🔍 Checking L2 cache for voice es-AR-ElenaNeural
✅ L2 cache hit! Returning cached audio
💾 Storing audio in L2 cache
🧹 Running audio cache cleanup...
🗑️ Deleted 15 expired cache entries
📊 Cache stats: 1234 entries, 45.67 MB, 5678 total hits, 4.60 avg hits/entry
```

### Database Queries

Check cache size per tenant:

```sql
SELECT 
    tenant_id,
    COUNT(*) as entry_count,
    SUM(audio_file_size_bytes) / (1024 * 1024) as size_mb,
    SUM(hit_count) as total_hits,
    AVG(hit_count) as avg_hits_per_entry
FROM audio_cache
GROUP BY tenant_id
ORDER BY size_mb DESC;
```

Find most popular cached entries:

```sql
SELECT 
    voice_id,
    LEFT(text, 50) as text_preview,
    hit_count,
    audio_file_size_bytes / 1024 as size_kb,
    last_accessed_at
FROM audio_cache
ORDER BY hit_count DESC
LIMIT 20;
```

## Cost Analysis

### Example Scenario

**Setup:**
- 10 users in a tenant
- Each user auditions 50 different character voices
- Each character has 3 test sentences
- Total unique auditions: 150 text variations

**Without Cache:**
- Total TTS calls: 10 users × 50 characters × 3 sentences = 1,500 calls
- Cost: 1,500 calls × $0.016/request = $24.00

**With Two-Tier Cache:**
- Unique TTS calls: 150 (one per unique text+voice combination)
- Cached calls: 1,350 (90% cache hit rate)
- Cost: 150 calls × $0.016/request = $2.40
- **Savings: $21.60 (90%)**

### Real-World Benefits

1. **Character Assignment**: Multiple users assigning same characters → high cache hits
2. **Voice Testing**: Users comparing voices on same text → 100% cache hits after first
3. **Orchestration**: Previewing same segments repeatedly → instant playback
4. **Training**: New users trying tutorial examples → instant results from cache

## Troubleshooting

### Cache Not Working

**Check 1: Azure credentials**
```python
# Verify in logs or add debug endpoint
from shared.config import settings
print(settings.AZURE_STORAGE_CONNECTION_STRING)
```

**Check 2: Database table exists**
```sql
SELECT * FROM audio_cache LIMIT 1;
```

**Check 3: Blob container exists**
```bash
az storage container show \
  --name audio-cache \
  --account-name khipustudio
```

### High Storage Usage

**Solution 1: Reduce TTL**

Modify `AudioCache.default_expiration()`:
```python
@classmethod
def default_expiration(cls) -> datetime:
    return datetime.utcnow() + timedelta(days=7)  # Changed from 30 to 7
```

**Solution 2: Reduce max entries per tenant**

Modify cleanup task in `main.py`:
```python
deleted_lru = await audio_cache_service.cleanup_lru_cache(
    db, 
    max_entries=5000  # Changed from 10000 to 5000
)
```

**Solution 3: Manual cleanup**
```python
# Delete all entries older than 7 days
from datetime import datetime, timedelta
cutoff = datetime.utcnow() - timedelta(days=7)
await db.execute(
    delete(AudioCache).where(AudioCache.last_accessed_at < cutoff)
)
await db.commit()
```

### Slow Cache Lookups

**Check indexes:**
```sql
-- Verify indexes exist
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'audio_cache';
```

**Optimize queries:**
```python
# Use .filter() instead of .where() for better query planning
cache_entry = await db.execute(
    select(AudioCache)
    .filter(AudioCache.cache_key == cache_key)
    .filter(AudioCache.tenant_id == tenant_id)
    .limit(1)
)
```

## Future Enhancements

1. **Redis L1.5 Cache**: Add Redis between frontend and database for ultra-fast lookups
2. **CDN Integration**: Serve cached audio through CDN for global distribution
3. **Pre-warming**: Generate cache entries for common phrases during off-peak hours
4. **Analytics Dashboard**: Web UI showing cache stats, hit rates, cost savings
5. **Smart Expiration**: Adjust TTL based on entry popularity (hot = longer TTL)
6. **Compression**: Store audio in compressed format to reduce storage costs
7. **Multi-region**: Replicate cache across regions for lower latency

## Files Modified/Created

### Created Files

1. `shared/models/audio_cache.py` - SQLAlchemy model
2. `shared/services/blob_storage.py` - Azure Blob Storage service
3. `shared/services/audio_cache.py` - L2 cache service
4. `alembic/versions/c3f89bde72a1_add_audio_cache_table.py` - Database migration
5. `AUDIO_CACHE_IMPLEMENTATION.md` - This documentation

### Modified Files

1. `shared/models/__init__.py` - Added AudioCache import
2. `khipu-cloud-api/services/characters/router.py` - Added audition endpoint
3. `khipu-cloud-api/main.py` - Added cleanup background task

### Frontend Files (already implemented)

1. `khipu-web/src/lib/audio-cache.ts` - L1 in-memory cache
2. `khipu-web/src/hooks/useAudioCache.ts` - React hook for audio playback

## Summary

The two-tier audio caching system provides:

✅ **90% cost reduction** through intelligent caching  
✅ **Instant playback** for repeated content  
✅ **Cross-user benefits** via shared L2 cache  
✅ **Automatic maintenance** via background cleanup  
✅ **Tenant isolation** for multi-tenant security  
✅ **Production-ready** with monitoring and troubleshooting

This implementation is designed for cloud deployment and scales efficiently as the user base grows.
