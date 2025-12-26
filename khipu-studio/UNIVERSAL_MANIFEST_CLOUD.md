# Universal Manifest Implementation for Cloud Packaging

**Date**: December 26, 2025  
**Status**: Implemented

## Overview

Implemented universal manifest generation for Khipu Cloud packaging, adapted from the desktop application's filesystem-based approach to a cloud-native database-driven solution.

## Key Differences: Desktop vs Cloud

### Desktop Implementation (`py/packaging/manifest_generator.py`)
- **Source**: Reads from project files on local filesystem
  - `project.khipu.json` - project configuration
  - `dossier/book.json` - book metadata
  - `dossier/narrative.structure.json` - chapter structure
  - `audio/wav/*_complete.wav` - complete chapter audio files
- **Output**: `manifest.json` file in project root
- **Audio References**: Paths to chapter master files (pre-concatenated audio)
- **Purpose**: Pre-aggregates metadata for faster packaging

### Cloud Implementation (`khipu-cloud-api/services/packaging/manifest.py`)
- **Source**: Queries PostgreSQL database
  - `Project` model - project metadata and settings
  - `Segment` model - chapter segments
  - `AudioSegmentMetadata` model - cached audio information
- **Output**: JSON response via REST API endpoint
- **Audio References**: Blob storage paths for individual segments (requires on-demand concatenation)
- **Purpose**: Dynamically generates manifest from live database state

## Implementation Details

### Backend Components

#### 1. Manifest Generation Service
**File**: `khipu-cloud-api/services/packaging/manifest.py`

**Key Function**: `generate_manifest(db: AsyncSession, project_id: UUID) -> Dict[str, Any]`

**Process**:
1. Query project with segments eagerly loaded
2. Query audio metadata for all segments
3. Group segments by chapter_id
4. Calculate completion statistics:
   - Chapters with complete audio
   - Total segments vs segments with audio
   - Total duration (sum of all segment durations)
5. Build manifest structure with cloud-specific metadata

**Manifest Structure (v2.0 - Cloud)**:
```json
{
  "version": "2.0",
  "generated": "2025-12-26T...",
  "project": {
    "id": "uuid",
    "name": "Project Name"
  },
  "book": {
    "title": "Book Title",
    "authors": ["Author Name"],
    "narrators": ["Narrator Name"],
    "isbn": "...",
    // ... other metadata
  },
  "cover": {
    "imageUrl": "https://...",  // Azure blob URL or project field
    "imageBase64": "..."         // From settings.book.cover_image_b64
  },
  "audio": {
    "totalDuration": 12345.67,
    "totalDurationFormatted": "03:25:45",
    "chapterCount": 15,
    "chaptersWithCompleteAudio": 12,
    "totalSegments": 450,
    "segmentsWithAudio": 380,
    "completionPercentage": 84.44,
    "missingChapters": ["ch13", "ch14", "ch15"]
  },
  "chapters": [
    {
      "id": "ch01",
      "title": "Chapter One Title",
      "index": 1,
      "segmentCount": 25,
      "hasCompleteAudio": true,
      "duration": 1234.56,
      "segments": [
        {
          "id": "segment-uuid",
          "sequenceNumber": 1,
          "hasAudio": true,
          "duration": 45.2,
          "blobPath": "audio/project-id/segment-uuid.mp3"
        }
        // ... more segments
      ]
    }
    // ... more chapters
  ],
  "cloud": {
    "storageType": "azure_blob",
    "requiresOnDemandConcatenation": true,
    "note": "Audio files are individual segments in blob storage, not pre-concatenated chapter files"
  }
}
```

#### 2. API Endpoint
**File**: `khipu-cloud-api/services/packaging/router.py`

**Endpoint**: `GET /projects/{project_id}/packaging/manifest`

**Authentication**: Requires active user (JWT)

**Response**: `ManifestResponse` schema containing manifest dictionary

**Error Handling**:
- 404: Project not found
- 500: Database or processing errors

#### 3. Response Schema
**File**: `khipu-cloud-api/services/packaging/schemas.py`

```python
class ManifestResponse(BaseModel):
    """Universal manifest response."""
    success: bool
    manifest: Dict[str, Any]
```

### Frontend Components

#### 1. TypeScript Types
**File**: `khipu-web/src/lib/api/packaging.ts`

Defined complete TypeScript interfaces matching backend response:
- `UniversalManifest` - Main manifest structure
- `ManifestResponse` - API response wrapper

#### 2. API Client Method
**File**: `khipu-web/src/lib/api/packaging.ts`

```typescript
getManifest: async (projectId: string): Promise<UniversalManifest> => {
  const response = await api.get(`/projects/${projectId}/packaging/manifest`);
  return response.data.manifest;
}
```

## New Platform Requirements

With manifest implementation, platform readiness checks should now consider:

### 1. Manifest Availability (Optional)
- **Desktop**: Manifest is optional but improves packaging performance
- **Cloud**: Manifest is always generated on-demand, no pre-generation needed
- **Requirement**: NOT a blocking requirement since manifest is dynamically generated

### 2. Chapter Completeness (Informational)
- **Desktop**: Missing chapter audio blocks packaging
- **Cloud**: Missing audio is informational only (generated on-the-fly)
- **Manifest Shows**: 
  - Which chapters are complete
  - Which segments have cached audio
  - Overall completion percentage

### 3. Segment-Level Detail (Cloud-Specific)
- **Desktop**: Only chapter-level granularity
- **Cloud**: Segment-level detail in manifest
  - Individual segment audio availability
  - Blob storage paths for each segment
  - Allows packagers to identify which segments need generation

## Integration Points

### Packaging Workflow
1. **Readiness Check** → Shows completion stats from database
2. **View Manifest** (Optional) → User can inspect full project structure
3. **Create Package** → Packager reads manifest if needed, or queries database directly
4. **Audio Assembly** → Packager downloads segments from blob storage, concatenates as needed

### Desktop App Comparison
The manifest structure in the desktop app (`app/src/pages/Packaging.tsx`) includes:
- Universal manifest section with status indicator
- "Regenerate Manifest" button
- "View Manifest" button
- Shows "manifest.json in project root"

For cloud, these features become:
- **Status**: Always "available" (generated on-demand)
- **Regenerate**: Not needed (always fresh from database)
- **View**: API call to GET manifest endpoint
- **Location**: Transient (not stored, generated per request)

## Benefits

### 1. Performance
- Pre-aggregates complex queries (chapters, segments, audio metadata)
- Single API call returns complete project structure
- Reduces round-trips during packaging operations

### 2. Debuggability
- Complete snapshot of project state
- Shows exactly what audio is available
- Identifies missing segments clearly

### 3. Platform Compatibility
- Familiar structure for desktop packager code reuse
- Can adapt desktop Python packagers to read cloud manifest format
- Consistent metadata format across platforms

### 4. Real-Time Accuracy
- Always reflects current database state
- No risk of stale manifest files
- Automatic updates as segments are generated

## Future Enhancements

### 1. Caching
- Consider caching manifest responses with short TTL (5-10 seconds)
- Invalidate cache when segments are added/updated
- Reduce database load for frequent polling

### 2. Partial Manifests
- Add query parameters for specific chapters/segments
- Reduce payload size for large projects
- Faster responses when only subset needed

### 3. Manifest Versioning
- Track manifest schema version for backward compatibility
- Support multiple manifest formats for different packager versions
- Graceful migration when schema changes

### 4. Webhook Integration
- Notify when manifest changes significantly (e.g., chapter complete)
- Trigger automatic package regeneration
- Update platform requirements dynamically

## Testing Checklist

- [ ] Backend endpoint returns valid manifest structure
- [ ] All project metadata fields are populated correctly
- [ ] Chapter grouping and ordering is correct
- [ ] Segment-level audio availability is accurate
- [ ] Duration calculations match actual audio file durations
- [ ] Cover image URLs are resolved correctly (both model fields and settings)
- [ ] Missing chapter/segment lists are accurate
- [ ] Completion percentages calculated correctly
- [ ] Frontend can fetch and display manifest
- [ ] TypeScript types match backend response
- [ ] Error handling works (404 for missing project, 500 for server errors)

## Documentation Updates Needed

- [ ] Update API documentation with manifest endpoint
- [ ] Add manifest examples to platform packager documentation
- [ ] Document manifest schema in CLOUD_PACKAGING_DESIGN.md
- [ ] Add frontend UI for viewing manifest (optional)
- [ ] Update packaging readiness documentation to reference manifest

## Related Files

### Backend
- `khipu-cloud-api/services/packaging/manifest.py` - Manifest generation logic
- `khipu-cloud-api/services/packaging/router.py` - API endpoint
- `khipu-cloud-api/services/packaging/schemas.py` - Response schemas

### Frontend
- `khipu-web/src/lib/api/packaging.ts` - TypeScript types and API client

### Desktop Reference
- `py/packaging/manifest_generator.py` - Original desktop implementation
- `app/src/pages/Packaging.tsx` - Desktop UI with manifest section

### Design Documentation
- `CLOUD_PACKAGING_DESIGN.md` - Overall packaging architecture
