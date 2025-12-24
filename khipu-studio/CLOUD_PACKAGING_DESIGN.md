# Cloud Packaging Implementation Design

**Last Updated**: December 23, 2025  
**Status**: Design Phase  

## Executive Summary

This document outlines the implementation plan for the **Packaging Module** in Khipu Cloud, adapting the Desktop application's packaging functionality for a cloud-native, multi-tenant architecture.

### Key Architectural Differences

| Aspect | Desktop | Cloud |
|--------|---------|-------|
| **Audio Source** | Chapter master files on disk | Individual segments cached in Blob Storage |
| **Assembly** | Pre-generated chapter audio | On-demand concatenation in temp directory |
| **Intermediate Files** | Chapter audio saved to disk | No intermediate files - temp only during packaging |
| **Final Package Storage** | Local filesystem | **Two-tier**: Temp (24h, primary) + Archive (optional, versioned) |
| **Package Retention** | Permanent local files | Temp: auto-delete after 24h; Archive: configurable (7-90 days) |
| **Workflow** | Sequential (blocking) | Flexible (non-blocking) |
| **Execution** | Python subprocess | FastAPI service with async jobs |
| **Missing Audio** | Blocks packaging | Generate on-the-fly during packaging |

---

## What Can Be Leveraged from Desktop

### ✅ **1. Platform Configuration Structure**

**Desktop Implementation**: `app/src/pages/Packaging.tsx` (lines 188-251)

```typescript
interface PlatformConfig {
  id: string;                    // ✅ Reuse
  name: string;                  // ✅ Reuse
  enabled: boolean;              // ✅ Reuse (from project.settings.export.platforms)
  requirements: string[];        // ✅ Reuse (title, author, narrator, cover, audio, chapters)
  packageFormat: string;         // ✅ Reuse (M4B, ZIP with MP3, EPUB)
  audioSpec: {                   // ✅ Reuse structure
    format: string;              // AAC, MP3
    bitrate?: string;            // 128k, 192k, 256k
    sampleRate: number;          // 44100
    channels: number;            // 1 (mono)
  };
}
```

**Cloud Adaptation**: Create FastAPI schemas matching this structure.

---

### ✅ **2. Platform-Specific Requirements**

**Leverage**: All platform specifications from Desktop:

```python
# Cloud: services/packaging/platform_configs.py
PLATFORM_SPECS = {
    "apple": {
        "format": "m4b",
        "audio": {"codec": "aac", "bitrate": "128k", "sample_rate": 44100, "channels": 1},
        "requires_chapter_markers": True,
        "cover_min_size": (1400, 1400),
        "max_file_size_mb": None
    },
    "google": {
        "format": "zip_mp3",
        "audio": {"codec": "mp3", "bitrate": "256k", "sample_rate": 44100, "channels": 1},
        "requires_chapter_markers": False,
        "cover_min_size": (3000, 3000),
        "max_file_size_mb": None
    },
    "spotify": {
        "format": "zip_mp3",
        "audio": {"codec": "mp3", "bitrate": "256k", "sample_rate": 44100, "channels": 1},
        "requires_chapter_markers": False,
        "max_file_duration_hours": 2,  # Split files > 2h
        "requires_digital_voice_disclosure": True,
        "cover_min_size": (3000, 3000)
    },
    "acx": {
        "format": "zip_mp3",
        "audio": {"codec": "mp3", "bitrate": "192k", "sample_rate": 44100, "channels": 1},
        "requires_rms_validation": True,  # -23dB to -18dB
        "requires_peak_validation": True,  # Max -3dB
        "requires_noise_floor_validation": True,  # Max -60dB
        "cover_min_size": (2400, 2400)
    },
    "kobo": {
        "format": "epub3",
        "audio": {"codec": "mp3", "bitrate": "192k", "sample_rate": 44100, "channels": 1},
        "max_file_size_mb": 200,
        "requires_media_overlay": True,
        "requires_manifest": True
    }
}
```

---

### ✅ **3. Python Packager Logic (Adapted)**

**Desktop Files**:
- `py/packaging/packagers/m4b_packager.py` - Apple Books M4B
- `py/packaging/zip_mp3_packager.py` - Google/Spotify/ACX
- `py/packaging/epub3_packager.py` - Kobo EPUB3
- `py/packaging/validator.py` - Quality validation

**Cloud Adaptation Required**:
- **Change Input**: Accept segment audio files (from memory/temp) instead of chapter files
- **Change Pattern**: Make importable functions, not CLI scripts
- **Add**: Azure Blob Storage upload logic
- **Add**: Progress callbacks for async job tracking

**Example Refactoring**:

```python
# Desktop (CLI-based)
if __name__ == "__main__":
    args = parser.parse_args()
    create_m4b_package(args.project_root, args.output, args.bitrate)

# Cloud (importable + async)
async def create_m4b_package(
    project_id: UUID,
    segment_audio_files: List[Path],  # Temp files from segments
    chapter_data: List[Dict],         # Chapter metadata
    output_path: Path,
    audio_spec: AudioSpec,
    progress_callback: Callable[[float, str], None] = None
) -> PackageResult:
    """Create M4B package from segment audio files"""
    # 1. Concatenate segments per chapter
    # 2. Encode to AAC
    # 3. Add chapter markers
    # 4. Create M4B container
    # 5. Upload to blob storage
```

---

### ✅ **4. Validation Logic**

**Desktop**: `py/packaging/validator.py`

**Leverage**: Entire validation framework (audio specs, metadata, file integrity)

**Cloud Adaptation**: Import validation functions, add database tracking for validation results

---

### ✅ **5. UI Requirements Checking Pattern**

**Desktop**: `app/src/pages/Packaging.tsx` (lines 447-524)

```typescript
const checkPlatformRequirements = (platform: PlatformConfig) => {
  const hasTitle = !!(bookMeta?.title);
  const hasAuthor = !!(bookMeta?.authors?.length > 0);
  const hasNarrator = !!(bookMeta?.narrators?.length > 0);
  const hasCover = !!(bookMeta?.coverImage);
  const hasAudio = chaptersInfo.hasAudio > 0;
  const hasChapters = chaptersInfo.count > 0;
  
  // Check audio spec matches requirements
  const expectedBitrate = parseKbps(platform.audioSpec.bitrate);
  const actualBitrate = parseKbps(productionSettings?.packaging?.[platform.id]?.bitrate);
  // ... more checks
};
```

**Cloud Adaptation**: Create similar endpoint to check readiness:

```python
@router.get("/projects/{project_id}/packaging/readiness")
async def get_packaging_readiness(
    project_id: UUID,
    db: AsyncSession = Depends(get_async_db)
) -> PackagingReadinessResponse:
    """
    Check project readiness for packaging.
    Returns completion status per platform.
    """
    # Query project metadata
    # Query chapters + segments
    # Query audio_segment_metadata for completion
    # Calculate completion percentages
    # Check platform-specific requirements
```

---

## What CANNOT Be Leveraged (Desktop-Specific)

### ❌ **1. Electron IPC Handlers**

**Desktop**: `app/electron/main.cjs` (lines 859-1400)
- `ipcMain.handle("packaging:create", ...)`
- `ipcMain.handle("packaging:validate", ...)`
- `ipcMain.handle("packaging:generateManifest", ...)`
- `ipcMain.handle("packaging:checkExisting", ...)`

**Why Not**: Electron-specific, requires local filesystem.

**Cloud Alternative**: FastAPI endpoints with JWT auth.

---

### ❌ **2. Universal Manifest Generation**

**Desktop**: Generates `manifest.json` with chapter master file paths

**Why Not**: Cloud doesn't have chapter master files.

**Cloud Alternative**: Dynamic manifest generation from database (chapters + segments).

---

### ❌ **3. Subprocess Spawning**

**Desktop**:
```javascript
const proc = spawn(pythonExe, [m4bScriptPath, projectRoot, ...args]);
```

**Why Not**: Cloud needs async job queues for long-running tasks.

**Cloud Alternative**: Celery/FastAPI BackgroundTasks with progress tracking.

---

### ❌ **4. Local File System Operations & Intermediate Audio Files**

**Desktop**: 
- Reads chapter audio files from `audio/chapters/` directory
- Stores pre-generated chapter master files on disk
- Packages reference existing chapter files

**Why Not**: 
- Cloud doesn't store concatenated chapter audio or full book audio
- Only individual segment audio is cached (for TTS reuse)
- No intermediate audio files are persisted

**Cloud Alternative**: 
- Download individual segment audio to temp directory
- Concatenate on-degenerates packages on-demand from segments (no pre-existing files to copy).

**Cloud Alternative**: 
- Track package creation with `same_as_package_id` field to avoid regeneration
- If Google and Spotify use identical specs, second platform can reference first without re-processing
- Delete all temp files after packaging completes

---

### ❌ **5. Cache Hit Optimization (Cross-Platform Copy)**

**Desktop**: If Google and Spotify packages use same specs, copy instead of regenerating

**Why Not**: Cloud stores packages in blob storage (different download URLs per platform).

**Cloud Alternative**: Track package creation with `same_as_package_id` field, avoid regeneration.

---

## Cloud Data Model Extensions

### New Database Tables

#### 1. `packages` Table

```sql
CREATE TABLE packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Platform & Version
    platform_id VARCHAR(50) NOT NULL, -- 'apple', 'google', 'spotify', 'acx', 'kobo'
    version_number INTEGER NOT NULL DEFAULT 1, -- Incremental version per platform
    
    -- Package Info
    package_format VARCHAR(50) NOT NULL, -- 'm4b', 'zip_mp3', 'epub3'
    blob_path TEXT NOT NULL,             -- Path in Azure Blob Storage
    blob_container VARCHAR(50) NOT NULL, -- 'temp' or 'packages-archive'
    download_url TEXT,                   -- Pre-signed download URL (generated on-demand)
    file_size_bytes BIGINT NOT NULL,
    
    -- Storage Tier
    storage_tier VARCHAR(20) NOT NULL DEFAULT 'temp', -- 'temp' (24h TTL) or 'archive' (versioned)
    
    -- Audio Spec Used
    audio_spec JSONB NOT NULL,           -- Bitrate, sample rate, channels used
    
    -- Validation
    is_validated BOOLEAN DEFAULT FALSE,
    validation_results JSONB,            -- Results from validator.py
    
    -- Optimization (deduplication)
    same_as_package_id UUID REFERENCES packages(id), -- Points to identical package (e.g., Google = Spotify)
    
    -- Expiration
    expires_at TIMESTAMP,                -- Auto-delete after this time (for temp tier)
    archived_at TIMESTAMP,               -- When moved from temp to archive
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    INDEX idx_packages_project (project_id),
    INDEX idx_packages_platform_version (project_id, platform_id, version_number),
    INDEX idx_packages_tenant (tenant_id),
    INDEX idx_packages_expiration (expires_at) WHERE expires_at IS NOT NULL,
    
    UNIQUE(project_id, platform_id, version_number)  -- Versioned packages per platform
);

-- Auto-cleanup trigger for expired temp packages
CREATE INDEX idx_packages_expired ON packages(expires_at) 
    WHERE storage_tier = 'temp' AND expires_at < NOW();
```

#### 2. `packaging_jobs` Table (for async progress tracking)

```sql
CREATE TABLE packaging_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    platform_id VARCHAR(50) NOT NULL,
    
    -- Job Status
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    -- 'queued', 'downloading_audio', 'processing', 'uploading', 'completed', 'failed'
    
    progress_percent INTEGER DEFAULT 0,
    current_step TEXT,
    error_message TEXT,
    
    -- Result
    package_id UUID REFERENCES packages(id),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    INDEX idx_packaging_jobs_project (project_id),
    INDEX idx_packaging_jobs_status (status) WHERE status IN ('queued', 'downloading_audio', 'processing', 'uploading')
);
```

---

## Cloud API Design

### Endpoints

#### 1. **Check Packaging Readiness**

```http
GET /api/v1/projects/{project_id}/packaging/readiness
```

**Response**:
```json
{
  "success": true,
  "data": {
    "overallReady": false,
    "completionStats": {
      "totalChapters": 12,
      "chaptersWithCompleteAudio": 8,
      "totalSegments": 450,
      "segmentsWithAudio": 380,
      "percentComplete": 84.4
    },
    "platforms": [
      {
        "id": "apple",
        "name": "Apple Books",
        "enabled": true,
        "ready": false,
        "requirements": [
          {"id": "title", "met": true},
          {"id": "author", "met": true},
          {"id": "narrator", "met": true},
          {"id": "cover", "met": true},
          {"id": "audio", "met": false, "details": "4 chapters missing audio"},
          {"id": "chapters", "met": true},
          {"id": "audio_bitrate", "met": true, "expected": "128k", "actual": "128k"},
          {"id": "audio_samplerate", "met": true, "expected": 44100, "actual": 44100}
        ]
      },
      {
        "id": "google",
        "name": "Google Play Books",
        "enabled": true,
        "ready": false,
        "requirements": [...]
      }
    ],
    "missingAudio": {
      "chapterIds": ["uuid-1", "uuid-2", "uuid-3", "uuid-4"],
      "segmentIds": ["seg-uuid-1", "seg-uuid-2", ...]
    }
  }
}
```

---

#### 2. **Create Packages (All Enabled Platforms)**

```http
POST /api/v1/projects/{project_id}/packaging/create-all
```

**Request**:
```json
{
  "generateMissingAudio": true,  // Generate missing segment audio on-the-fly
  "validateAfterCreation": true
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "jobIds": {
      "apple": "job-uuid-1",
      "google": "job-uuid-2",
      "spotify": "job-uuid-3"
    },
    "message": "Packaging jobs created for 3 platforms"
  }
}
```

---

#### 3. **Get Packaging Job Status**

```http
GET /api/v1/projects/{project_id}/packaging/jobs/{job_id}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "job-uuid-1",
    "platformId": "apple",
    "status": "processing",
    "progressPercent": 45,
    "currentStep": "Encoding chapter 5 of 12 to AAC",
    "createdAt": "2025-12-23T10:30:00Z",
    "startedAt": "2025-12-23T10:30:05Z",
    "estimatedCompletionAt": "2025-12-23T10:35:00Z"
  }
}
```

---

#### 4. **List Packages**

```httpversion": 1,
        "storageTier": "archive",
        "fileSizeBytes": 156789012,
        "downloadUrl": "https://blob.windows.net/...?sas=...",
        "isValidated": true,
        "validationPassed": true,
        "createdAt": "2025-12-23T10:35:00Z",
        "expiresAt": "2026-01-22T10:35:00Z"
      },
      {
        "id": "pkg-uuid-2",
        "platformId": "google",
        "format": "zip_mp3",
        "version": 2,
        "storageTier": "temp",
        "fileSizeBytes": 189234567,
        "downloadUrl": "https://blob.windows.net/...?sas=...",
        "isValidated": false,
        "createdAt": "2025-12-23T10:40:00Z",
        "expiresAt": "2025-12-24T10:40:00Z",
        "sameAsPackageId": "pkg-uuid-3"
      }
    ],
    "storageQuota": {
      "used": 345.6,
      "limit": 1000,
      "unit": "MB"
    }
  }
}
```

---

#### 5. **Archive Package (Move from Temp to Persistent)**

```http
POST /api/v1/projects/{project_id}/packages/{package_id}/archive
```

**Request**:
```json
{
  "retentionDays": 30  // Optional, defaults to tenant plan
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "packageId": "pkg-uuid-1",
    "storageTier": "archive",
    "expiresAt": "2026-01-22T10:35:00Z",
    "message": "Package archived. Will be deleted after 30 days."
  }
}
```

---

#### 6. **Validate Package**
```

---

#### 5. **Validate Package**

```http
POST /api/v1/projects/{project_id}/packages/{package_id}/validate
```

**Response**:
```json
{
  "success": true,
  "data": {
    "valid": false,
    "issues": [
      {
        "severity": "error",
        "category": "audio_quality",
        "message": "RMS level too low for ACX requirements",
        "details": "Average RMS: -25.3dB, Required: -23dB to -18dB",
        "affectedChapters": [1, 3, 7]
      },
      {
        "severity": "warning",
        "category": "metadata",
        "message": "ISBN not provided",
        "details": "ACX recommends providing ISBN for wider distribution"
      }
    ],
    "specs": {
      "fileSizeMB": 189.2,
      "totalDurationSeconds": 14523,
      "audioCodec": "mp3",
      "bitrate": "192k",
      "sampleRate": 44100,
      "channels": 1,
      "peakLevel": -3.2,
      "averageRMS": -25.3,
      "noiseFloor": -62.1
    }
  }
}
```

---

## Cloud Packaging Workflow

### High-Level Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                     User Triggers Packaging                       │
│          (Clicks "Create Packages" for enabled platforms)         │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              Backend: Query Project + Segments Data              │
│  - Get project metadata (title, authors, cover, etc.)            │
│  - Get all chapters for project                                  │
│  - Get all segments with audio_segment_metadata                  │
│  - Identify missing audio (segments without audio cache)         │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│          Generate Missing Audio (if requested & needed)          │
│  - For each segment without audio cache                          │
│  - Call TTS service (Azure TTS / OpenAI TTS)                     │
│  - Store in audio_cache and audio_segment_metadata               │
│  - Upload to Azure Blob Storage                                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│         Create Packaging Jobs (one per enabled platform)         │
│  - Insert rows into packaging_jobs table                         │
│  - Queue jobs with FastAPI BackgroundTasks or Celery             │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                 ┌───────────┴───────────┐
                 │                       │
                 ▼                       ▼
    ┌─────────────────────┐   ┌─────────────────────┐
    │   Apple M4B Job     │   │  Google ZIP+MP3 Job │
    └──────────┬──────────┘   └──────────┬──────────┘
               │                         │
               ▼                         ▼
   ┌──────────────────────────────────────────────┐
   │    PCreate temp directory for this job       │
   │  2. Download segment audio from blob storage │
   │  3. Concatenate segments → temp chapter files│
   │  4. Apply platform-specific encoding:        │
   │     - Apple: AAC 128k + chapter markers      │
   │     - Google/Spotify/ACX: MP3 192k/256k      │
   │     - Kobo: MP3 + EPUB3 structure            │
   │  5. Create package file (M4B/ZIP/EPUB)       │
   │  6. Upload ONLY final package to blob storage│
   │  7. Delete ALL temp files (segments+chapters)│
   │  8. Generate pre-signed download URL         │
   │  9. Insert row into packages table           │
   │ 10. Update packaging_job status: completed   │
   │                                              │
   │ Note: NO intermediate audio is saved         │
   │       Only segment cache + final packages    │
   │  7. Insert row into packages table           │
   │  8. Update packaging_job status: completed   │
   └──────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              Frontend: Poll Job Status & Display                 │
│  - Poll GET /packaging/jobs/{job_id} every 2 seconds             │
│  - Show progress bar with current step                           │
│  - When completed, show download link                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## Frontend Implementation (React + Remix)

### File: `khipu-web/src/routes/projects.$projectId.packaging.tsx`

**Key Features**:
1. **Platform Cards** - Same visual structure as Desktop
2. **Completion Status** - Segment-level progress (not chapter files)
3. **On-Demand Generation** - UI shows missing audio but allows packaging
4. **Job Progress Tracking** - Real-time updates via polling
5. **Download Links** - When packages complete

**Data Loading**:
```typescript
export async function loader({ request, params }: LoaderFunctionArgs) {
  const projectId = params.projectId!;
  
  // Load project
  const projectRes = await authenticatedFetch(
    request,
    `/api/v1/projects/${projectId}`
  );
  
  // Load packaging readiness
  const readinessRes = await authenticatedFetch(
    request,
    `/api/v1/projects/${projectId}/packaging/readiness`
  );
  
  // Load existing packages
  const packagesRes = await authenticatedFetch(
    request,
    `/api/v1/projects/${projectId}/packages`
  );
  
  return json({
    project: projectRes.data,
    readiness: readinessRes.data,
    packages: packagesRes.data.packages
  });
}
```

**Action Handler**:
```typescript
export async function action({ request, params }: ActionFunctionArgs) {
  const projectId = params.projectId!;
  const formData = await request.formData();
  const intent = formData.get('intent');
  
  if (intent === 'create-all') {
    const res = await authenticatedFetch(
      request,
      `/api/v1/projects/${projectId}/packaging/create-all`,
      {
        method: 'POST',
        body: JSON.stringify({
          generateMissingAudio: true,
          validateAfterCreation: true
        })
      }
    );
    return json(res.data);
  }
  
  if (intent === 'validate') {
    const packageId = formData.get('packageId');
    const res = await authenticatedFetch(
      request,
      `/api/v1/projects/${projectId}/packages/${packageId}/validate`,
      { method: 'POST' }
    );
    return json(res.data);
  }
  
  return json({ error: 'Unknown intent' }, { status: 400 });
}
```

**Component Structure** (similar to Desktop):
```tsx
export default function PackagingPage() {
  const { project, readiness, packages } = useLoaderData<typeof loader>();
  const [pollingJobIds, setPollingJobIds] = useState<string[]>([]);
  const [jobStatuses, setJobStatuses] = useState<Record<string, JobStatus>>({});
  
  // Poll job statuses every 2 seconds
  useEffect(() => {
    if (pollingJobIds.length === 0) return;
    
    const interval = setInterval(async () => {
      for (const jobId of pollingJobIds) {
        const res = await fetch(`/api/v1/packaging/jobs/${jobId}`);
        const data = await res.json();
        
        setJobStatuses(prev => ({ ...prev, [jobId]: data.data }));
        
        if (data.data.status === 'completed' || data.data.status === 'failed') {
          setPollingJobIds(prev => prev.filter(id => id !== jobId));
        }
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, [pollingJobIds]);
  
  return (
    <div>
      {/* Similar structure to Desktop Packaging.tsx */}
      
      {/* Completion Status Section */}
      <PackagingReadinessCard readiness={readiness} />
      
      {/* Platform Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {readiness.platforms
          .filter(p => p.enabled)
          .map(platform => (
            <PlatformCard
              key={platform.id}
              platform={platform}
              package={packages.find(pkg => pkg.platformId === platform.id)}
              jobStatus={jobStatuses[platform.id]}
              onCreatePackage={handleCreatePackage}
              onValidate={handleValidate}
            />
          ))}
      </div>
    </div>
  );
}
```

---

## Implementation Checklist

### Phase 1: Database & Models
- [ ] Create `packages` table migration (with versioning + storage_tier)
- [ ] Create `packaging_jobs` table migration
- [ ] Create SQLAlchemy models
- [ ] Create Pydantic schemas
- [ ] Implement version limit enforcement logic
- [ ] Create background job for expired package cleanup

### Phase 2: Backend API
- [ ] Create `services/packaging/` directory structure to temp, cleanup)
- [ ] Implement `temp_file_manager.py` (temp directory lifecycle management
- [ ] Implement `platform_configs.py` (platform specs)
- [ ] Implement `router.py` (API endpoints)
- [ ] Implement `readiness.py` (check project completion)
- [ ] Implement `job_manager.py` (async job creation & tracking)
- [ ] Implement `audio_assembler.py` (download segments, concatenate)

### Phase 3: Python Packagers (Refactored)
- [ ] Refactor `m4b_packager.py` → importable function
- [ ] Refactor `zip_mp3_packager.py` → importable function
- [ ] Refactor `epub3_packager.py` → importable function
- [ ] Add Azure Blob Storage upload logic
- [ ] Add progress callback support
- [ ] Test with sample segment audio

### Phase 4: Frontend UI
- [ ] Create `projects.$projectId.packaging.tsx` route
- [ ] Implement platform cards component
- [ ] Implement readiness status display
- [ ] Implement job progress polling
- [ ] Implement download links (with "Archive" button)
- [ ] Add validation UI
- [ ] Add version history view (archived packages)
- [ ] Show storage quota usage
- [ ] Add "Archive Package" confirmation dialog with retention info

### Phase 5: Integration & Testing
- [ ] Test end-to-end packaging flow
- [ ] Test missing audio generation
- [ ] Test validation for all platforms
- [ ] Test large projects (performance)
- [ ] Test error handling & recovery

---

## Security Considerations

1. **Package Download URLs**: Use pre-signed SAS tokens with 1-hour expiration
2. **Job Authorization**: Verify user has access to project before creating job
3. **Blob Storage Access**: Use tenant-scoped containers
5. **Temp File Isolation**: Use tenant-scoped temp directories, cleanup on job completion or failure
6. **Storage Quota**: Only final packages count toward tenant storage limits (no intermediate files)
4. **Rate Limiting**: Limit packaging jobs per tenant per hour

--- (avoid regeneration)
3. **Streaming Upload**: Upload packages to blob storage while encoding (chunked transfer)
4. **Segment Caching**: During job execution, keep downloaded segments in temp for reuse across platforms
5. **Immediate Cleanup**: Delete temp files as soon as package upload completes to minimize disk usage
6. **No Intermediate Storage**: Never persist concatenated chapter audio - only segment cache and final packages

1. **Parallel Processing**: Process multiple platforms concurrently
2. **Smart Caching**: If Google and Spotify use same specs, reference same package
3. **Streaming Upload**: Upload packages to blob storage while encoding (chunked)
4. **Segment Caching**: Don't re-download segments if already in temp directory

---

## Next Steps

1. Review this design with stakeholders
2. Create database migrations
3. Start with backend API (readiness endpoint first)
4. Build frontend UI iteratively
5. Integrate Python packagers last
