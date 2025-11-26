# API Specifications - Khipu Cloud

**Base URL**: `https://api.khipustudio.app`  
**API Version**: v1  
**Authentication**: JWT Bearer tokens (Azure AD B2C)

## API Conventions

### Request Headers
```http
Authorization: Bearer {jwt_token}
X-Tenant-ID: {tenant_id}  # Optional, extracted from JWT if not provided
Content-Type: application/json
Accept: application/json
```

### Response Format
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2025-11-25T19:00:00Z",
    "request_id": "uuid"
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Project with ID abc-123 not found",
    "details": {}
  },
  "meta": {
    "timestamp": "2025-11-25T19:00:00Z",
    "request_id": "uuid"
  }
}
```

### Pagination
```http
GET /api/v1/projects?page=1&limit=20&sort=-created_at

Response:
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "total_pages": 8
  }
}
```

## Authentication Service

### POST /api/v1/auth/login
Initiate Azure AD B2C login flow

**Response:**
```json
{
  "success": true,
  "data": {
    "authorization_url": "https://login.microsoftonline.com/...",
    "state": "random_state_token"
  }
}
```

### POST /api/v1/auth/callback
Handle OAuth callback from Azure AD

**Request:**
```json
{
  "code": "auth_code",
  "state": "random_state_token"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "jwt_token",
    "refresh_token": "refresh_token",
    "expires_in": 900,
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "John Doe",
      "role": "creator",
      "tenant": {
        "id": "uuid",
        "name": "Acme Corp",
        "subdomain": "acme"
      }
    }
  }
}
```

### POST /api/v1/auth/refresh
Refresh access token

**Request:**
```json
{
  "refresh_token": "refresh_token"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "new_jwt_token",
    "expires_in": 900
  }
}
```

### POST /api/v1/auth/logout
Logout user

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  }
}
```

## Projects API

### GET /api/v1/projects
List user's projects

**Query Parameters:**
- `page` (int): Page number (default: 1)
- `limit` (int): Items per page (default: 20, max: 100)
- `status` (string): Filter by status
- `sort` (string): Sort field (prefix with `-` for desc)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "The Great Adventure",
      "subtitle": "A Journey Begins",
      "authors": ["Jane Doe"],
      "language": "es-PE",
      "status": "audio_generated",
      "cover_image_url": "https://storage.../cover.jpg",
      "word_count": 45000,
      "created_at": "2025-11-20T10:00:00Z",
      "updated_at": "2025-11-25T15:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 5
  }
}
```

### POST /api/v1/projects
Create new project

**Request:**
```json
{
  "title": "My New Audiobook",
  "subtitle": "An Epic Tale",
  "authors": ["John Smith"],
  "language": "es-PE",
  "description": "A thrilling adventure..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "My New Audiobook",
    "status": "draft",
    "created_at": "2025-11-25T19:00:00Z"
  }
}
```

### GET /api/v1/projects/{project_id}
Get project details

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "The Great Adventure",
    "subtitle": "A Journey Begins",
    "authors": ["Jane Doe"],
    "narrators": ["Voice Actor 1"],
    "language": "es-PE",
    "status": "audio_generated",
    "workflow_completed": {
      "project": true,
      "manuscript": true,
      "characters": true,
      "casting": true,
      "planning": true,
      "voice": true,
      "packaging": false
    },
    "chapters_count": 15,
    "segments_count": 342,
    "total_duration_seconds": 18000,
    "cover_image_url": "https://...",
    "created_at": "2025-11-20T10:00:00Z",
    "updated_at": "2025-11-25T15:30:00Z"
  }
}
```

### PATCH /api/v1/projects/{project_id}
Update project

**Request:**
```json
{
  "title": "Updated Title",
  "description": "New description"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Updated Title",
    "updated_at": "2025-11-25T19:05:00Z"
  }
}
```

### DELETE /api/v1/projects/{project_id}
Delete project

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Project deleted successfully"
  }
}
```

## Manuscript API

### POST /api/v1/projects/{project_id}/manuscript/upload
Upload manuscript file

**Request:** Multipart form data
```
file: <manuscript.txt|.docx|.pdf>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "blob_path": "tenants/{tenant_id}/projects/{project_id}/manuscripts/manuscript.txt",
    "url": "https://storage.../manuscript.txt",
    "word_count": 45000,
    "character_count": 250000,
    "uploaded_at": "2025-11-25T19:00:00Z"
  }
}
```

### GET /api/v1/projects/{project_id}/manuscript
Get manuscript content

**Response:**
```json
{
  "success": true,
  "data": {
    "content": "Chapter 1\n\nOnce upon a time...",
    "word_count": 45000,
    "character_count": 250000,
    "url": "https://storage.../manuscript.txt"
  }
}
```

### POST /api/v1/projects/{project_id}/manuscript/parse
Parse manuscript into chapters

**Request:**
```json
{
  "chapter_regex": "^(Chapter|CHAPTER|Capítulo)\\s+\\d+",
  "heading_levels": [1, 2]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "chapters_detected": 15,
    "chapters": [
      {
        "number": 1,
        "title": "The Beginning",
        "word_count": 3000,
        "start_position": 0,
        "end_position": 15000
      }
    ]
  }
}
```

## Characters API

### GET /api/v1/projects/{project_id}/characters
List project characters

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Narrator",
      "role": "narrator",
      "gender": "neutral",
      "assigned_voice_id": "es-PE-CamilaNeural",
      "assigned_voice_name": "Camila",
      "voice_settings": {
        "provider": "azure",
        "style": "friendly",
        "speaking_rate": 1.0
      }
    }
  ]
}
```

### POST /api/v1/projects/{project_id}/characters/detect
Detect characters using AI

**Request:**
```json
{
  "use_manuscript": true,
  "azure_openai_deployment": "gpt-4o",  // Optional: override default deployment
  "use_function_calling": true,          // Use structured outputs (recommended)
  "temperature": 0.0                     // Control creativity (0.0 = deterministic)
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "characters_detected": 5,
    "characters": [
      {
        "name": "Alice",
        "role": "protagonist",
        "description": "A curious young woman",
        "gender": "female",
        "age_range": "young_adult",
        "confidence_score": 0.95
      }
    ],
    "usage": {
      "azure_openai_deployment": "gpt-4o",
      "prompt_tokens": 2500,
      "completion_tokens": 350,
      "total_tokens": 2850
    },
    "cost_usd": 0.0175
  }
}
```

### POST /api/v1/projects/{project_id}/characters
Create character manually

**Request:**
```json
{
  "name": "Narrator",
  "role": "narrator",
  "gender": "neutral"
}
```

### PATCH /api/v1/projects/{project_id}/characters/{character_id}
Update character

**Request:**
```json
{
  "assigned_voice_id": "es-PE-AlexNeural",
  "voice_settings": {
    "speaking_rate": 1.1,
    "pitch": 0
  }
}
```

### POST /api/v1/projects/{project_id}/characters/{character_id}/audition
Generate voice audition sample

**Request:**
```json
{
  "text": "Hello, this is a voice audition sample.",
  "voice_id": "es-PE-CamilaNeural"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "audio_url": "https://storage.../audition.mp3",
    "duration_seconds": 3.5,
    "cost_usd": 0.001
  }
}
```

## Chapters API

### GET /api/v1/projects/{project_id}/chapters
List chapters

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "chapter_number": 1,
      "title": "The Beginning",
      "word_count": 3000,
      "status": "audio_complete",
      "audio_url": "https://storage.../chapter-1.mp3",
      "audio_duration_seconds": 900,
      "segments_count": 25
    }
  ]
}
```

### GET /api/v1/projects/{project_id}/chapters/{chapter_id}
Get chapter details

### GET /api/v1/projects/{project_id}/chapters/{chapter_id}/segments
List chapter segments

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "segment_number": 1,
      "text": "Once upon a time, in a land far away...",
      "character_name": "Narrator",
      "voice_id": "es-PE-CamilaNeural",
      "status": "complete",
      "audio_url": "https://storage.../segment-1.mp3",
      "duration_seconds": 5.2,
      "needs_revision": false
    }
  ]
}
```

## Audio Generation API

### POST /api/v1/projects/{project_id}/chapters/{chapter_id}/generate-audio
Generate audio for entire chapter

**Request:**
```json
{
  "force_regenerate": false,
  "use_cache": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "job_id": "uuid",
    "status": "processing",
    "total_segments": 25,
    "estimated_duration_seconds": 120
  }
}
```

### GET /api/v1/jobs/{job_id}
Check job status

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "audio_generation",
    "status": "completed",
    "progress": 100,
    "segments_completed": 25,
    "segments_total": 25,
    "result": {
      "audio_url": "https://storage.../chapter-1.mp3",
      "duration_seconds": 900,
      "cost_usd": 0.45
    },
    "created_at": "2025-11-25T19:00:00Z",
    "completed_at": "2025-11-25T19:02:00Z"
  }
}
```

### POST /api/v1/projects/{project_id}/segments/{segment_id}/regenerate
Regenerate single segment

**Request:**
```json
{
  "text": "Updated segment text",
  "voice_id": "es-PE-CamilaNeural",
  "force_regenerate": true
}
```

## Packaging API

### POST /api/v1/projects/{project_id}/packages
Create package (export)

**Request:**
```json
{
  "format": "m4b",
  "platform": "audible",
  "include_chapters": [1, 2, 3],
  "options": {
    "bitrate": "128k",
    "embed_metadata": true,
    "embed_cover": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "job_id": "uuid",
    "status": "processing"
  }
}
```

### GET /api/v1/projects/{project_id}/packages
List packages

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "format": "m4b",
      "platform": "audible",
      "file_size_bytes": 450000000,
      "download_url": "https://storage.../package.m4b",
      "created_at": "2025-11-25T19:00:00Z",
      "expires_at": "2025-12-02T19:00:00Z"
    }
  ]
}
```

## Cost Tracking API

### GET /api/v1/projects/{project_id}/costs
Get project costs

**Query Parameters:**
- `start_date` (ISO date)
- `end_date` (ISO date)
- `group_by` (string): 'service' | 'operation' | 'day'

**Response:**
```json
{
  "success": true,
  "data": {
    "total_cost_usd": 12.45,
    "breakdown": {
      "openai": 8.50,
      "azure_tts": 3.95
    },
    "entries": [
      {
        "service": "openai",
        "operation": "gpt4o_completion",
        "units": 15000,
        "unit_type": "tokens",
        "cost_usd": 0.15,
        "created_at": "2025-11-25T19:00:00Z"
      }
    ]
  }
}
```

## Admin API (Admin role only)

### GET /api/v1/admin/users
List all users in tenant

### POST /api/v1/admin/users
Invite new user

**Request:**
```json
{
  "email": "newuser@example.com",
  "role": "creator",
  "full_name": "New User"
}
```

### PATCH /api/v1/admin/users/{user_id}
Update user role

**Request:**
```json
{
  "role": "validator",
  "is_active": true
}
```

### GET /api/v1/admin/audit-logs
Get audit logs

### GET /api/v1/admin/analytics
Get tenant analytics

## WebSocket API (Real-time updates)

### Connection
```javascript
const ws = new WebSocket('wss://api.khipustudio.app/ws');
ws.send(JSON.stringify({
  type: 'auth',
  token: 'jwt_token'
}));
```

### Events
```javascript
// Audio generation progress
{
  "type": "audio.progress",
  "data": {
    "job_id": "uuid",
    "segment_number": 5,
    "total_segments": 25,
    "progress": 20
  }
}

// Job completed
{
  "type": "job.completed",
  "data": {
    "job_id": "uuid",
    "result": { ... }
  }
}
```

## Rate Limits

| Tier | Requests/minute | Burst |
|------|-----------------|-------|
| Single | 100 | 120 |
| Team | 500 | 600 |
| Enterprise | 2000 | 2500 |

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| UNAUTHORIZED | 401 | Invalid or missing authentication |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 422 | Request validation failed |
| RATE_LIMIT_EXCEEDED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |

## Next Steps
1. Implement OpenAPI spec (auto-generated from FastAPI)
2. Set up API documentation with Swagger UI
3. Create Postman collection for testing
4. Build SDK clients (TypeScript, Python)
