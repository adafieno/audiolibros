# Audio Cache Deployment Guide

## Quick Start

Follow these steps to deploy the audio cache system to your cloud environment.

## Prerequisites

- PostgreSQL database running
- Azure Storage Account created
- Azure TTS credentials configured

## Step 1: Configure Environment Variables

Add to your `.env` file or environment configuration:

```bash
# Azure Blob Storage
AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;AccountName=YOUR_ACCOUNT;AccountKey=YOUR_KEY;EndpointSuffix=core.windows.net"
AZURE_STORAGE_ACCOUNT_NAME="khipustudio"
AZURE_STORAGE_CONTAINER_NAME="audio-cache"
```

## Step 2: Create Azure Blob Container

Using Azure CLI:

```bash
# Login to Azure
az login

# Create storage container
az storage container create \
  --name audio-cache \
  --account-name YOUR_ACCOUNT_NAME \
  --public-access off
```

Or using Azure Portal:
1. Navigate to your Storage Account
2. Click "Containers" under "Data storage"
3. Click "+ Container"
4. Name: `audio-cache`
5. Public access level: Private
6. Click "Create"

## Step 3: Install Dependencies

Dependencies are already in `requirements.txt`. Ensure they're installed:

```bash
cd khipu-cloud-api
pip install -r requirements.txt
```

Key dependency: `azure-storage-blob==12.24.0`

## Step 4: Run Database Migration

Create the `audio_cache` table:

```bash
cd khipu-cloud-api

# Check current migration status
alembic current

# Run migration
alembic upgrade head

# Verify table was created
psql -d khipu_cloud -c "\d audio_cache"
```

Expected output:
```
                                         Table "public.audio_cache"
          Column          |           Type           | Collation | Nullable |      Default       
--------------------------+--------------------------+-----------+----------+--------------------
 id                       | uuid                     |           | not null | gen_random_uuid()
 tenant_id                | uuid                     |           | not null | 
 cache_key                | character varying(255)   |           | not null | 
 text                     | text                     |           | not null | 
 ssml                     | text                     |           |          | 
 voice_id                 | character varying(255)   |           | not null | 
 voice_settings           | jsonb                    |           |          | 
 audio_blob_path          | text                     |           | not null | 
 audio_url                | text                     |           |          | 
 audio_duration_seconds   | double precision         |           |          | 
 audio_file_size_bytes    | bigint                   |           |          | 
 hit_count                | integer                  |           | not null | 0
 last_accessed_at         | timestamp with time zone |           | not null | now()
 created_at               | timestamp with time zone |           | not null | now()
 expires_at               | timestamp with time zone |           |          | 
Indexes:
    "audio_cache_pkey" PRIMARY KEY, btree (id)
    "ix_audio_cache_cache_key" UNIQUE, btree (cache_key)
    "ix_audio_cache_expires_at" btree (expires_at)
    "ix_audio_cache_last_accessed_at" btree (last_accessed_at)
    "ix_audio_cache_tenant_id" btree (tenant_id)
```

## Step 5: Verify Backend Configuration

Check that Azure credentials are properly loaded:

```bash
cd khipu-cloud-api
python3 -c "
from shared.config import settings
print(f'Container: {settings.AZURE_STORAGE_CONTAINER_NAME}')
print(f'Connection: {settings.AZURE_STORAGE_CONNECTION_STRING[:50]}...')
"
```

## Step 6: Start API Server

Start the FastAPI server:

```bash
cd khipu-cloud-api

# Development
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Production (with Gunicorn)
gunicorn main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --timeout 120
```

Check logs for cleanup task startup:

```
INFO:     Starting Khipu Cloud API...
INFO:     ✅ Started audio cache cleanup background task
INFO:     Application startup complete.
```

## Step 7: Test the Cache

### Test 1: Generate First Audio (Cache Miss)

```bash
curl -X POST "http://localhost:8000/api/v1/projects/YOUR_PROJECT_ID/characters/audition" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "voice": "es-AR-ElenaNeural",
    "text": "Hola, este es un test del cache",
    "style": "cheerful",
    "rate_pct": 0,
    "pitch_pct": 0
  }' \
  --output test_audio.mp3 -v
```

Check response headers:
```
< X-Cache-Status: MISS
< Cache-Control: public, max-age=1800
< Content-Type: audio/mpeg
```

### Test 2: Request Same Audio (Cache Hit)

Run the same curl command again:

```bash
curl -X POST "http://localhost:8000/api/v1/projects/YOUR_PROJECT_ID/characters/audition" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "voice": "es-AR-ElenaNeural",
    "text": "Hola, este es un test del cache",
    "style": "cheerful",
    "rate_pct": 0,
    "pitch_pct": 0
  }' \
  --output test_audio2.mp3 -v
```

Check response headers:
```
< X-Cache-Status: HIT-L2
< Cache-Control: public, max-age=1800
< Content-Type: audio/mpeg
```

Response should be instant (< 100ms instead of 2-3 seconds).

### Test 3: Verify Database Entry

```sql
SELECT 
    cache_key,
    voice_id,
    LEFT(text, 30) as text_preview,
    hit_count,
    audio_file_size_bytes / 1024 as size_kb,
    last_accessed_at,
    created_at
FROM audio_cache
ORDER BY created_at DESC
LIMIT 5;
```

Expected result:
```
      cache_key       |     voice_id      | text_preview | hit_count | size_kb |   last_accessed_at    |      created_at       
----------------------+-------------------+--------------+-----------+---------+-----------------------+-----------------------
 a3f5d...            | es-AR-ElenaNeural | Hola, este   |         2 |      45 | 2025-01-10 15:23:45   | 2025-01-10 15:20:12
```

### Test 4: Verify Blob Storage

Using Azure CLI:

```bash
az storage blob list \
  --container-name audio-cache \
  --account-name YOUR_ACCOUNT_NAME \
  --query "[].{Name:name, Size:properties.contentLength, LastModified:properties.lastModified}" \
  --output table
```

Expected output:
```
Name                                                Size    LastModified
--------------------------------------------------  ------  -----------------------
audio-cache/TENANT_ID/a3f5d...                      46234   2025-01-10T15:20:12+00:00
```

Or check in Azure Portal:
1. Navigate to Storage Account
2. Click "Containers"
3. Click "audio-cache"
4. Verify files are being created with path pattern: `audio-cache/{tenant_id}/{cache_key}.mp3`

## Step 8: Monitor Cache Activity

### Watch Cleanup Logs

```bash
# Tail API logs
tail -f /var/log/khipu-api/app.log | grep "cache"
```

Expected output every hour:
```
2025-01-10 16:00:00 - 🧹 Running audio cache cleanup...
2025-01-10 16:00:01 - 🗑️ Deleted 3 expired cache entries
2025-01-10 16:00:02 - 🗑️ Deleted 0 old cache entries via LRU
2025-01-10 16:00:03 - 📊 Cache stats: 127 entries, 5.82 MB, 453 total hits, 3.57 avg hits/entry
```

### Check Cache Statistics

```sql
-- Overall cache stats
SELECT 
    COUNT(*) as total_entries,
    SUM(audio_file_size_bytes) / (1024 * 1024) as total_mb,
    SUM(hit_count) as total_hits,
    AVG(hit_count) as avg_hits_per_entry,
    MIN(created_at) as oldest_entry,
    MAX(created_at) as newest_entry
FROM audio_cache;

-- Per-tenant breakdown
SELECT 
    tenant_id,
    COUNT(*) as entries,
    SUM(audio_file_size_bytes) / (1024 * 1024) as size_mb,
    SUM(hit_count) as hits,
    AVG(hit_count) as avg_hits
FROM audio_cache
GROUP BY tenant_id
ORDER BY size_mb DESC;

-- Most popular cache entries
SELECT 
    voice_id,
    LEFT(text, 40) as text,
    hit_count,
    audio_file_size_bytes / 1024 as size_kb,
    created_at
FROM audio_cache
ORDER BY hit_count DESC
LIMIT 10;
```

## Step 9: Configure Frontend (Optional)

The frontend already has L1 cache implemented. Verify it's calling the correct endpoint:

Check `khipu-web/src/lib/audio-cache.ts`:

```typescript
const response = await api.post(
  `/projects/${params.config.id}/characters/audition`,  // ✅ Correct endpoint
  {
    voice: params.voice,
    text: params.text,
    // ... other parameters
  },
  { responseType: 'blob' }
);
```

## Troubleshooting

### Issue: Migration fails with "relation already exists"

**Solution**: Table may already exist. Check and mark migration as complete:

```bash
# Check if table exists
psql -d khipu_cloud -c "SELECT * FROM audio_cache LIMIT 1"

# If table exists, mark migration as complete
alembic stamp head
```

### Issue: "Failed to get Azure token" error

**Cause**: Invalid Azure TTS credentials in project settings.

**Solution**: Update project settings:

```sql
UPDATE projects 
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{azure_tts_key}',
  '"YOUR_AZURE_KEY"'
)
WHERE id = 'YOUR_PROJECT_ID';

UPDATE projects 
SET settings = jsonb_set(
  settings,
  '{azure_tts_region}',
  '"eastus"'
)
WHERE id = 'YOUR_PROJECT_ID';
```

### Issue: "Blob container not found" error

**Cause**: Azure Blob container doesn't exist or wrong name.

**Solution**: Create container or fix environment variable:

```bash
# Create container
az storage container create \
  --name audio-cache \
  --account-name YOUR_ACCOUNT_NAME

# Or check .env file
grep AZURE_STORAGE_CONTAINER_NAME .env
```

### Issue: Cache cleanup task not running

**Cause**: API startup failed or task crashed.

**Solution**: Check logs and restart:

```bash
# Check logs for errors
tail -n 100 /var/log/khipu-api/app.log | grep -i error

# Restart API
sudo systemctl restart khipu-api
```

### Issue: High storage costs

**Solution 1**: Reduce max entries per tenant (in `main.py`):
```python
deleted_lru = await audio_cache_service.cleanup_lru_cache(db, max_entries=5000)
```

**Solution 2**: Reduce TTL (in `shared/models/audio_cache.py`):
```python
@classmethod
def default_expiration(cls) -> datetime:
    return datetime.utcnow() + timedelta(days=7)  # Changed from 30 to 7
```

**Solution 3**: Manual cleanup:
```sql
-- Delete entries not accessed in last 7 days
DELETE FROM audio_cache 
WHERE last_accessed_at < NOW() - INTERVAL '7 days';
```

## Production Checklist

- [ ] Azure Blob Storage container created
- [ ] Environment variables configured
- [ ] Database migration applied
- [ ] Indexes created on `audio_cache` table
- [ ] API server started with cleanup task
- [ ] Cache hit/miss verified in logs
- [ ] Monitoring alerts configured for cache size
- [ ] Backup strategy for database (audio blobs can be regenerated)
- [ ] Cost monitoring dashboard configured
- [ ] Documentation shared with team

## Cost Estimation

### Storage Costs (Azure Blob)

- Average audio file: ~50 KB
- 10,000 cached entries: ~500 MB
- Azure Blob Storage (Hot tier): $0.02 per GB/month
- **Monthly cost: 0.5 GB × $0.02 = $0.01**

### Database Costs (PostgreSQL)

- Average row: ~500 bytes (metadata only, audio in blob)
- 10,000 rows: ~5 MB
- **Negligible cost** (within normal DB usage)

### TTS Cost Savings

- Without cache: 10,000 auditions × $0.016 = **$160/month**
- With 90% cache hit rate: 1,000 auditions × $0.016 = **$16/month**
- **Savings: $144/month** (90% reduction)

**Total Savings: $144/month - $0.01 storage = $143.99/month**

## Next Steps

After successful deployment:

1. **Monitor cache hit rate** for first week
2. **Adjust TTL and max entries** based on usage patterns
3. **Set up alerts** for cache size exceeding thresholds
4. **Review cost savings** in Azure billing dashboard
5. **Consider CDN integration** for multi-region deployment
6. **Document team workflows** that benefit most from caching

## Support

For issues or questions:
- Check logs: `/var/log/khipu-api/app.log`
- Review documentation: `AUDIO_CACHE_IMPLEMENTATION.md`
- Database queries in monitoring section above
- Azure Portal for blob storage insights

---

**Deployment Date**: _____________  
**Deployed By**: _____________  
**Environment**: Production / Staging / Development  
**Notes**: _______________________________________________
