# Database Schema Design

**Database**: PostgreSQL 14+ on Azure  
**Multi-Tenancy**: Row-Level Security (RLS)

## Core Tables

### Tenants
```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'acme' for acme.khipustudio.app
    plan VARCHAR(50) NOT NULL DEFAULT 'single', -- 'single', 'team', 'enterprise'
    
    -- Billing & Limits
    max_projects INTEGER DEFAULT 10,
    max_storage_gb INTEGER DEFAULT 100,
    max_users INTEGER DEFAULT 5,
    
    -- Settings (JSON)
    settings JSONB DEFAULT '{}'::jsonb,
    -- {
    --   "default_language": "es-PE",
    --   "allowed_tts_providers": ["azure", "openai"],
    --   "cost_tracking_enabled": true
    -- }
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    suspended_at TIMESTAMP,
    suspended_reason TEXT,
    
    -- Billing info
    stripe_customer_id VARCHAR(255),
    subscription_status VARCHAR(50) -- 'trial', 'active', 'past_due', 'cancelled'
);

CREATE INDEX idx_tenants_subdomain ON tenants(subdomain);
CREATE INDEX idx_tenants_active ON tenants(is_active) WHERE is_active = TRUE;
```

### Users
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Identity
    email VARCHAR(255) NOT NULL,
    azure_ad_id VARCHAR(255), -- Azure AD B2C user ID
    full_name VARCHAR(255),
    avatar_url TEXT,
    
    -- Role & Permissions
    role VARCHAR(50) NOT NULL, -- 'admin', 'creator', 'validator'
    permissions JSONB DEFAULT '[]'::jsonb, -- Additional granular permissions
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    UNIQUE(tenant_id, email),
    CHECK (role IN ('admin', 'creator', 'validator'))
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(tenant_id, email);
CREATE INDEX idx_users_azure_ad ON users(azure_ad_id);

-- Row-level security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON users
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

### Projects
```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Ownership
    owner_id UUID NOT NULL REFERENCES users(id),
    
    -- Project Info (from BookMeta)
    title VARCHAR(500) NOT NULL,
    subtitle VARCHAR(500),
    authors TEXT[], -- Array of author names
    narrators TEXT[], -- Array of narrator names
    translators TEXT[],
    adaptors TEXT[],
    language VARCHAR(10) NOT NULL DEFAULT 'es-PE',
    
    -- Description
    description TEXT,
    publisher VARCHAR(255),
    publish_date DATE,
    isbn VARCHAR(20),
    
    -- Cover Image
    cover_image_url TEXT, -- Blob storage URL
    cover_image_blob_path TEXT, -- Path in blob storage
    
    -- Manuscript
    manuscript_blob_path TEXT, -- Path to uploaded manuscript in blob storage
    manuscript_word_count INTEGER,
    manuscript_character_count INTEGER,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'draft', 
    -- 'draft', 'manuscript_uploaded', 'characters_detected', 
    -- 'voices_assigned', 'audio_generated', 'packaged', 'completed'
    
    -- Workflow Progress
    workflow_completed JSONB DEFAULT '{}'::jsonb,
    -- {
    --   "project": true,
    --   "manuscript": true,
    --   "characters": false,
    --   "casting": false,
    --   "planning": false,
    --   "voice": false,
    --   "packaging": false
    -- }
    
    -- Settings
    settings JSONB DEFAULT '{}'::jsonb,
    -- {
    --   "tts_provider": "azure",
    --   "processing_chain": "audiobook_standard",
    --   "target_platform": "audible"
    -- }
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    archived_at TIMESTAMP,
    
    CHECK (status IN ('draft', 'manuscript_uploaded', 'characters_detected', 
                      'voices_assigned', 'audio_generated', 'packaged', 'completed'))
);

CREATE INDEX idx_projects_tenant ON projects(tenant_id);
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_status ON projects(tenant_id, status);
CREATE INDEX idx_projects_created ON projects(tenant_id, created_at DESC);

-- Row-level security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON projects
    USING (tenant_id = current_setting('app.current_tenant')::UUID);

-- Additional policy: Users can only see projects they own or are shared with
CREATE POLICY user_access_policy ON projects
    USING (
        owner_id = current_setting('app.current_user')::UUID 
        OR 
        id IN (
            SELECT project_id FROM project_shares 
            WHERE user_id = current_setting('app.current_user')::UUID
        )
    );
```

### Project Shares (for Validator role)
```sql
CREATE TABLE project_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Permissions for this share
    can_view BOOLEAN DEFAULT TRUE,
    can_comment BOOLEAN DEFAULT FALSE,
    can_edit BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    shared_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    revoked_at TIMESTAMP,
    
    UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_shares_project ON project_shares(project_id);
CREATE INDEX idx_project_shares_user ON project_shares(user_id);

ALTER TABLE project_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON project_shares
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

### Characters
```sql
CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Character Info
    name VARCHAR(255) NOT NULL,
    role VARCHAR(100), -- 'protagonist', 'antagonist', 'supporting', 'narrator'
    description TEXT,
    gender VARCHAR(50), -- 'male', 'female', 'neutral', 'other'
    age_range VARCHAR(50), -- 'child', 'teen', 'young_adult', 'adult', 'elderly'
    
    -- Voice Assignment
    assigned_voice_id VARCHAR(255), -- Azure/OpenAI voice ID
    assigned_voice_name VARCHAR(255),
    voice_settings JSONB DEFAULT '{}'::jsonb,
    -- {
    --   "provider": "azure",
    --   "voice_id": "es-PE-CamilaNeural",
    --   "style": "friendly",
    --   "speaking_rate": 1.0,
    --   "pitch": 0
    -- }
    
    -- Detection metadata
    detected_by VARCHAR(50), -- 'manual', 'openai', 'azure'
    confidence_score FLOAT,
    first_appearance_segment INTEGER,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_characters_project ON characters(project_id);
CREATE INDEX idx_characters_tenant ON characters(tenant_id);

ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON characters
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

### Chapters
```sql
CREATE TABLE chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Chapter Info
    chapter_number INTEGER NOT NULL,
    title VARCHAR(500),
    
    -- Content
    word_count INTEGER,
    character_count INTEGER,
    estimated_duration_seconds INTEGER,
    
    -- Audio
    audio_blob_path TEXT, -- Path to generated chapter audio in blob storage
    audio_url TEXT, -- Public or SAS URL for playback
    audio_duration_seconds FLOAT,
    audio_file_size_bytes BIGINT,
    
    -- Status
    status VARCHAR(50) DEFAULT 'draft',
    -- 'draft', 'segmented', 'audio_generating', 'audio_complete', 'error'
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    audio_generated_at TIMESTAMP,
    
    UNIQUE(project_id, chapter_number),
    CHECK (status IN ('draft', 'segmented', 'audio_generating', 'audio_complete', 'error'))
);

CREATE INDEX idx_chapters_project ON chapters(project_id, chapter_number);
CREATE INDEX idx_chapters_tenant ON chapters(tenant_id);

ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON chapters
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

### Segments
```sql
CREATE TABLE segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    
    -- Segment Info
    segment_number INTEGER NOT NULL, -- Within chapter
    global_segment_number INTEGER, -- Across entire project
    
    -- Content
    text TEXT NOT NULL,
    ssml TEXT, -- Generated SSML
    word_count INTEGER,
    character_count INTEGER,
    
    -- Character Assignment
    character_id UUID REFERENCES characters(id),
    character_name VARCHAR(255), -- Denormalized for performance
    voice_id VARCHAR(255), -- Assigned voice
    
    -- Audio
    audio_blob_path TEXT,
    audio_url TEXT,
    audio_duration_seconds FLOAT,
    audio_file_size_bytes BIGINT,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',
    -- 'pending', 'generating', 'complete', 'error', 'needs_revision'
    needs_revision BOOLEAN DEFAULT FALSE,
    revision_notes TEXT,
    
    -- Cache info
    cache_key VARCHAR(255), -- For TTS caching
    is_cached BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    audio_generated_at TIMESTAMP,
    
    UNIQUE(chapter_id, segment_number),
    CHECK (status IN ('pending', 'generating', 'complete', 'error', 'needs_revision'))
);

CREATE INDEX idx_segments_chapter ON segments(chapter_id, segment_number);
CREATE INDEX idx_segments_project ON segments(project_id);
CREATE INDEX idx_segments_character ON segments(character_id);
CREATE INDEX idx_segments_status ON segments(status) WHERE status != 'complete';
CREATE INDEX idx_segments_cache ON segments(cache_key) WHERE cache_key IS NOT NULL;

ALTER TABLE segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON segments
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

### Audio Cache
```sql
CREATE TABLE audio_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Cache Key (hash of text + voice + settings)
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    
    -- Input
    text TEXT NOT NULL,
    ssml TEXT,
    voice_id VARCHAR(255) NOT NULL,
    voice_settings JSONB,
    
    -- Output
    audio_blob_path TEXT NOT NULL,
    audio_url TEXT,
    audio_duration_seconds FLOAT,
    audio_file_size_bytes BIGINT,
    
    -- Usage tracking
    hit_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP DEFAULT NOW(),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP -- Optional expiration for cache cleanup
);

CREATE INDEX idx_audio_cache_key ON audio_cache(cache_key);
CREATE INDEX idx_audio_cache_tenant ON audio_cache(tenant_id);
CREATE INDEX idx_audio_cache_expires ON audio_cache(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE audio_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON audio_cache
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

### Packages (Export artifacts)
```sql
CREATE TABLE packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Package Info
    format VARCHAR(50) NOT NULL, -- 'm4b', 'audible', 'acx', 'mp3_zip'
    platform VARCHAR(50), -- 'audible', 'findaway', 'acx', 'generic'
    
    -- Files
    package_blob_path TEXT,
    package_url TEXT, -- SAS URL for download
    package_file_size_bytes BIGINT,
    
    -- Metadata
    manifest JSONB, -- Package manifest/metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP, -- Auto-delete after X days
    downloaded_at TIMESTAMP,
    download_count INTEGER DEFAULT 0
);

CREATE INDEX idx_packages_project ON packages(project_id);
CREATE INDEX idx_packages_tenant ON packages(tenant_id);
CREATE INDEX idx_packages_expires ON packages(expires_at) WHERE expires_at IS NOT NULL;

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON packages
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

### Cost Tracking
```sql
CREATE TABLE cost_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Service Info
    service VARCHAR(50) NOT NULL, -- 'azure_openai', 'azure_tts', 'azure_storage'
    operation VARCHAR(100) NOT NULL, -- 'gpt4o_completion', 'tts_synthesis', 'blob_storage'
    
    -- Azure OpenAI specific fields
    azure_openai_deployment VARCHAR(100), -- 'gpt-4o', 'gpt-4o-mini'
    azure_openai_model_version VARCHAR(50), -- '2024-08-06'
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    
    -- Azure Speech specific fields
    characters_processed INTEGER DEFAULT 0,
    audio_duration_seconds DECIMAL(10, 2),
    
    -- Generic usage (for other services)
    units INTEGER, -- bytes for storage, etc.
    unit_type VARCHAR(50), -- 'tokens', 'characters', 'bytes'
    
    -- Cost
    cost_usd DECIMAL(10, 4) NOT NULL,
    
    -- Context
    metadata JSONB DEFAULT '{}'::jsonb,
    -- {
    --   "voice_id": "es-PE-CamilaNeural",
    --   "cache_hit": false,
    --   "request_id": "uuid"
    -- }
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cost_tenant ON cost_entries(tenant_id);
CREATE INDEX idx_cost_project ON cost_entries(project_id);
CREATE INDEX idx_cost_service ON cost_entries(service);
CREATE INDEX idx_cost_created ON cost_entries(created_at DESC);

ALTER TABLE cost_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON cost_entries
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

### Audit Log
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Actor
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    
    -- Action
    action VARCHAR(100) NOT NULL, -- 'project.created', 'audio.generated', 'user.invited'
    resource_type VARCHAR(50), -- 'project', 'user', 'segment'
    resource_id UUID,
    
    -- Details
    details JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- Audit logs are tenant-isolated but readable by admins only
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON audit_logs
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

## Migration Strategy

### Initial Migration (Single Tenant)
```sql
-- Create initial tenant
INSERT INTO tenants (id, name, subdomain, plan)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Default Tenant',
    'app',
    'single'
);

-- Create admin user
INSERT INTO users (tenant_id, email, role, full_name, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'admin@khipustudio.app',
    'admin',
    'System Administrator',
    TRUE
);
```

### Data Migration from Desktop App
```python
# Example migration script structure
async def migrate_project_from_desktop(desktop_project_path: str):
    """
    Migrate a desktop app project to cloud database
    """
    # 1. Load project config from filesystem
    config = load_project_config(desktop_project_path)
    
    # 2. Create project in database
    project = await create_project(
        tenant_id=TENANT_ID,
        owner_id=USER_ID,
        title=config['title'],
        # ... other fields
    )
    
    # 3. Upload manuscript to blob storage
    manuscript_blob_path = await upload_manuscript(
        project_id=project.id,
        file_path=f"{desktop_project_path}/manuscript.txt"
    )
    
    # 4. Migrate characters
    for char in config['characters']:
        await create_character(
            project_id=project.id,
            name=char['name'],
            voice_id=char['voiceId']
        )
    
    # 5. Migrate chapters and segments
    # ... similar pattern
    
    return project.id
```

## Indexes & Performance

### Composite Indexes for Common Queries
```sql
-- Fast lookup: Get user's projects
CREATE INDEX idx_projects_owner_created ON projects(owner_id, created_at DESC);

-- Fast lookup: Get project's segments by chapter
CREATE INDEX idx_segments_chapter_order ON segments(chapter_id, segment_number);

-- Fast lookup: Cost tracking by project and service
CREATE INDEX idx_cost_project_service ON cost_entries(project_id, service, created_at DESC);
```

### Partitioning (For scale)
```sql
-- Partition audit_logs by month (when you have lots of data)
CREATE TABLE audit_logs (
    -- ... columns
) PARTITION BY RANGE (created_at);

CREATE TABLE audit_logs_2025_11 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- Create partitions automatically with pg_partman extension
```

## Next Steps
1. Review and approve schema
2. Create migration scripts (Alembic for Python)
3. Set up Azure PostgreSQL instance
4. Run initial migrations
5. Seed with test data
