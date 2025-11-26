# Khipu Cloud Architecture Overview

**Version:** 1.0  
**Date:** November 25, 2025  
**Cloud Provider:** Microsoft Azure  
**Target:** Full web-based audiobook production platform

## Executive Summary

This document outlines the architecture for migrating Khipu Studio from a desktop application to a fully cloud-native, web-based platform on Azure. While initially deployed as single-tenant, the architecture is designed from the ground up to support multi-tenancy.

## Core Principles

1. **Cloud-Native First**: Built for Azure from day one
2. **Multi-Tenancy Ready**: Single codebase supporting multiple organizations
3. **Scalable by Design**: Horizontal scaling for compute, storage, and services
4. **Security & Compliance**: Enterprise-grade authentication, authorization, and data isolation
5. **Cost-Optimized**: Pay-per-use model leveraging Azure's consumption-based services

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT TIER                             │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  React Web App (khipu-web)                             │     │
│  │  - TypeScript + Vite                                   │     │
│  │  - React Query for API state                           │     │
│  │  - Same UI components as desktop app                   │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTPS
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY TIER                           │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Azure API Management (APIM)                           │     │
│  │  - Rate limiting & throttling                          │     │
│  │  - API versioning                                      │     │
│  │  - Authentication validation                           │     │
│  │  - Request/response transformation                     │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      APPLICATION TIER                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐   │
│  │  Auth Service   │  │  Project Svc    │  │  Audio Svc     │   │
│  │  (Node/FastAPI) │  │  (FastAPI)      │  │  (FastAPI)     │   │
│  └─────────────────┘  └─────────────────┘  └────────────────┘   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐   │
│  │  Manuscript Svc │  │  Character Svc  │  │  Package Svc   │   │
│  │  (FastAPI)      │  │  (FastAPI)      │  │  (FastAPI)     │   │
│  └─────────────────┘  └─────────────────┘  └────────────────┘   │
│                                                                 │
│  Deployed as: Azure Container Apps or App Service               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        DATA TIER                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐   │
│  │  PostgreSQL     │  │  Redis Cache    │  │  Blob Storage  │   │
│  │  (Azure DB)     │  │  (Azure Cache)  │  │  - Audio files │   │
│  │  - Users        │  │  - Sessions     │  │  - Manuscripts │   │
│  │  - Projects     │  │  - TTS cache    │  │  - Packages    │   │
│  │  - Metadata     │  │  - API cache    │  │  - Temp files  │   │
│  └─────────────────┘  └─────────────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐   │
│  │  Azure OpenAI   │  │  Azure TTS      │  │  Azure Monitor │   │
│  │  - GPT-4o       │  │  - Neural TTS   │  │  - Logging     │   │
│  │  - Embeddings   │  │  - SSML support │  │  - Metrics     │   │
│  └─────────────────┘  └─────────────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend (khipu-web)
- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **State Management**: Zustand (same as desktop)
- **API Client**: React Query (TanStack Query)
- **UI Components**: Reuse from desktop app
- **Hosting**: Azure Static Web Apps or Azure App Service

### Backend (khipu-cloud-api)
- **Language**: Python 3.11+
- **Framework**: FastAPI (async, high-performance)
- **API Documentation**: OpenAPI/Swagger (auto-generated)
- **Authentication**: Azure AD B2C or Auth0
- **Hosting**: Azure Container Apps (preferred) or App Service

### Shared Code (shared/)
- **TypeScript Types**: Shared between web and API
- **Validation Schemas**: Pydantic (Python) + Zod (TypeScript)
- **Constants**: API endpoints, limits, defaults

### Database
- **Primary DB**: Azure Database for PostgreSQL (Flexible Server)
- **Cache**: Azure Cache for Redis
- **Search**: Azure Cognitive Search (optional, for advanced search)

### Storage
- **Blob Storage**: Azure Storage Account (Hot tier for active, Cool/Archive for old projects)
- **CDN**: Azure CDN for static assets and frequently accessed audio

### AI Services
- **LLM**: Azure OpenAI Service (GPT-4o, GPT-4o-mini)
  - Native Azure integration with Managed Identity
  - Enterprise-grade security and compliance
  - Content filtering and responsible AI features
  - Regional deployment options for data residency
  - Unified Azure billing and cost management
- **TTS**: Azure Cognitive Services Speech (Neural TTS)
- **Monitoring**: Azure Monitor + Application Insights

## User Roles & Permissions

### Role Definitions

| Role      | Description                           | Permissions                                    |
|-----------|---------------------------------------|------------------------------------------------|
| **Admin** | Full system access                    | All operations + user management + settings    |
| **Creator** | Content creators                     | Create/edit projects, generate audio, export   |
| **Validator** | QA/Review role                      | Read-only access to projects and assets        |

### Permission Matrix

| Resource         | Admin | Creator | Validator |
|------------------|-------|---------|-----------|
| Users (CRUD)     | ✅    | ❌      | ❌        |
| Projects (Create)| ✅    | ✅      | ❌        |
| Projects (Read)  | ✅    | ✅ (own)| ✅ (assigned) |
| Projects (Update)| ✅    | ✅ (own)| ❌        |
| Projects (Delete)| ✅    | ✅ (own)| ❌        |
| Audio Generation | ✅    | ✅      | ❌        |
| Export/Package   | ✅    | ✅      | ❌        |
| Cost Analytics   | ✅    | ✅ (own)| ✅ (assigned) |
| System Settings  | ✅    | ❌      | ❌        |

## Multi-Tenancy Design

### Tenant Isolation Strategy: **Hybrid (Database + Row-Level)**

**Approach**: Shared database with row-level security (RLS) and tenant context

#### Database Schema
```sql
-- Every table includes tenant_id for data isolation
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    subdomain VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) NOT NULL, -- 'single', 'team', 'enterprise'
    settings JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL, -- 'admin', 'creator', 'validator'
    azure_ad_id VARCHAR(255), -- Link to Azure AD
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    -- ... other fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Row-level security policy example
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON projects
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

#### Storage Isolation
```
Azure Blob Storage Structure:
/tenants/{tenant-id}/
  /projects/{project-id}/
    /manuscripts/
    /audio/
      /chapters/
      /segments/
    /packages/
    /cache/
```

### Tenant Identification
- **Subdomain-based**: `{tenant-subdomain}.khipustudio.app`
- **API Header**: `X-Tenant-ID` (backup method)
- **JWT Claims**: Tenant ID embedded in authentication token

## Authentication & Authorization Flow

```
1. User visits: tenant1.khipustudio.app
2. Frontend detects tenant from subdomain
3. Redirect to Azure AD B2C (tenant-aware)
4. User authenticates
5. Azure AD returns JWT with:
   - user_id
   - tenant_id
   - role (admin/creator/validator)
   - permissions
6. Frontend stores token
7. All API requests include: Authorization: Bearer {token}
8. API Gateway (APIM) validates token
9. Backend extracts tenant_id + user context
10. Sets PostgreSQL session: SET app.current_tenant = '{tenant_id}'
11. Row-level security enforces data isolation
12. Return only tenant's data
```

## Microservices Architecture

### Service Breakdown

#### 1. **Auth Service** (Node.js/TypeScript)
- User authentication (Azure AD B2C integration)
- JWT token generation/validation
- Role-based access control (RBAC)
- Session management

#### 2. **Project Service** (FastAPI)
- Project CRUD operations
- Manuscript management
- Metadata handling
- File upload/download coordination

#### 3. **Character Service** (FastAPI)
- Character detection (Azure OpenAI GPT-4o)
- Character profiling with structured outputs
- Voice casting recommendations
- Character-voice assignment
- Semantic search for character disambiguation

#### 4. **Audio Service** (FastAPI)
- TTS generation (Azure Speech)
- Audio processing (FFmpeg)
- Segment stitching
- Audio caching

#### 5. **Manuscript Service** (FastAPI)
- Document parsing
- Text segmentation
- SSML generation
- Content validation

#### 6. **Package Service** (FastAPI)
- Export to multiple formats (M4B, Audible, ACX)
- Metadata embedding
- File compression
- Distribution prep

#### 7. **Admin Service** (FastAPI)
- User management
- Tenant management
- System settings
- Analytics & reporting

### Inter-Service Communication
- **Synchronous**: REST APIs (service-to-service)
- **Asynchronous**: Azure Service Bus (for long-running tasks)
- **Event-Driven**: Azure Event Grid (for notifications)

## Deployment Strategy

### Initial Single-Tenant Deployment
```
Phase 1 (MVP):
- Deploy all services to single Azure resource group
- Single PostgreSQL instance
- Single Redis cache
- One tenant hardcoded in config
- Azure AD B2C for authentication

Phase 2 (Production Single-Tenant):
- Production-grade infrastructure
- Automated backups
- High availability (99.9% SLA)
- Monitoring & alerting
- Performance optimization

Phase 3 (Multi-Tenant Ready):
- Dynamic tenant creation API
- Tenant provisioning workflow
- Self-service signup
- Billing integration

Phase 4 (Full Multi-Tenant):
- Multiple paying customers
- Tenant isolation testing
- Load balancing across tenants
- Resource quotas per tenant
```

### Azure Resources (Phase 1)

```hcl
# Core Compute
- Azure Container Apps (or App Service)
  - 1x instance per microservice
  - Auto-scaling enabled
  
# Database
- Azure Database for PostgreSQL (Flexible Server)
  - Tier: General Purpose
  - vCores: 2-4
  - Storage: 128GB (auto-grow)
  
# Cache
- Azure Cache for Redis
  - Tier: Basic or Standard
  - Size: C1 (1GB)
  
# Storage
- Azure Storage Account (v2)
  - Hot tier for active projects
  - Cool tier for archived projects
  - LRS or ZRS redundancy
  
# API Management
- Azure API Management
  - Tier: Developer (for testing) → Standard (production)
  
# Identity
- Azure AD B2C
  - User flows configured
  - Custom policies for roles
  
# Monitoring
- Azure Monitor + Application Insights
  - Distributed tracing
  - Custom metrics
  - Alerts
  
# Networking
- Azure Front Door (optional, for global distribution)
- Azure CDN
```

## Cost Estimation (Monthly, Single Tenant, Moderate Usage)

| Service                     | Est. Cost (USD) | Notes |
|-----------------------------|-----------------|-------|
| **Azure OpenAI (Consumption)**| | |
| Azure Container Apps (6 services) | $150-300    |
| PostgreSQL (General Purpose, 2 vCores) | $100-150 |
| Redis Cache (C1, 1GB)       | $35             |
| Storage Account (500GB)     | $10-20          |
| GPT-4o (character detection) | $50-200 (usage) | ~10K-40K requests/month |
| GPT-4o-mini (simple tasks)  | $10-30 (usage)  | ~100K requests/month |
| **Azure OpenAI (Provisioned)** | | |
| Reserved capacity (optional) | $750/month      | Fixed cost, unlimited tokens |
| Azure Speech (TTS)          | $50-200 (usage) |
| API Management (Developer)  | $50             |
| Azure AD B2C                | Free (< 50k MAU) |
| Application Insights        | $20-50          |
| **Total (Consumption Model)** | **$475-1,185/month** | Variable with usage |
| **Total (Provisioned Model)** | **$1,165-1,435/month** | Predictable, high volume |

*Consumption model recommended for Phase 1. Switch to provisioned for predictable high-volume usage (>50K requests/day)*

## Azure OpenAI Integration

**Azure OpenAI Service is the preferred GenAI provider for Khipu Cloud**, offering superior integration with the Azure ecosystem.

### Key Advantages

**Enterprise Security**:
- Managed Identity (no API keys in code)
- Private Endpoints (VNet integration)
- Content Filtering (responsible AI)
- Compliance (SOC 2, ISO 27001, HIPAA)

**Cost Benefits**:
- Unified billing with other Azure services
- Provisioned throughput for predictable costs
- 20-25x savings using gpt-4o-mini for simple tasks

**Developer Experience**:
- Function calling for structured outputs
- Same OpenAI SDK (just change endpoint)
- Real-time streaming
- 99.9% SLA

### Deployment Models

| Model | Use Case | Cost |
|-------|----------|------|
| **GPT-4o** | Character detection, complex analysis | $5/1M input, $15/1M output |
| **GPT-4o-mini** | Simple tasks, high volume | $0.15/1M input, $0.60/1M output |

📖 **Detailed Guide**: See [03-azure-openai-integration.md](./03-azure-openai-integration.md) for:
- Complete implementation guide
- Authentication patterns (API key vs Managed Identity)
- Character detection with function calling
- Cost optimization strategies
- Error handling & monitoring
- Security best practices

## Security Considerations

### Data Protection
- **Encryption at Rest**: All Azure Storage and DB encrypted by default
- **Encryption in Transit**: TLS 1.2+ for all communications
- **Secrets Management**: Azure Key Vault for API keys, connection strings
- **Network Security**: Virtual Network (VNet) with private endpoints

### Authentication
- **Azure AD B2C**: Enterprise-grade identity provider
- **MFA**: Multi-factor authentication enforced for admins
- **JWT**: Short-lived tokens (15 min) with refresh tokens (7 days)
- **Password Policy**: Minimum 12 chars, complexity requirements

### Authorization
- **RBAC**: Role-based access control at API level
- **Row-Level Security**: Database-enforced tenant isolation
- **Least Privilege**: Services run with minimum required permissions

### Compliance
- **GDPR**: User data export, deletion, consent management
- **SOC 2**: Azure compliance inherited
- **Data Residency**: Choose Azure region for data sovereignty

## Monitoring & Observability

### Application Insights Integration
- **Distributed Tracing**: Track requests across microservices
- **Custom Metrics**: TTS usage, generation time, cache hit rate
- **Alerts**: Error rate, response time, resource utilization
- **Dashboards**: Real-time operations view

### Logging Strategy
```
Structured Logging (JSON):
{
  "timestamp": "2025-11-25T19:00:00Z",
  "level": "INFO",
  "service": "audio-service",
  "tenant_id": "uuid",
  "user_id": "uuid",
  "operation": "generate_segment",
  "duration_ms": 1234,
  "success": true
}
```

### Key Metrics to Track
- Request latency (p50, p95, p99)
- Error rates by service
- OpenAI API latency and cost
- Azure TTS latency and cost
- Cache hit ratio
- Active users per tenant
- Project completion rate

## Migration Path from Desktop

### Phase 1: API Development (4-6 weeks)
1. Set up Azure infrastructure
2. Develop core APIs (auth, projects, manuscripts)
3. Migrate Python backend logic to FastAPI services
4. Set up database schema with migrations

### Phase 2: Web Frontend (4-6 weeks)
1. Create React app scaffolding
2. Port UI components from Electron app
3. Implement authentication flow
4. Build core pages (Home, Projects, Manuscript, etc.)
5. Integrate with backend APIs

### Phase 3: Advanced Features (4-6 weeks)
1. Audio generation and processing
2. Character detection and casting
3. Voice synthesis integration
4. Package export functionality

### Phase 4: Testing & Polish (2-3 weeks)
1. Integration testing
2. Performance optimization
3. Security audit
4. User acceptance testing

### Phase 5: Deployment (1-2 weeks)
1. Production infrastructure setup
2. CI/CD pipeline configuration
3. Monitoring and alerting setup
4. Production deployment
5. Smoke testing

**Total Timeline: 15-19 weeks (4-5 months)**

## Next Steps

1. **Review & Approve Architecture** ✓ (You're reading it!)
2. **Set Up Azure Subscription** - Create resource groups
3. **Initialize Backend Project** - FastAPI boilerplate
4. **Initialize Frontend Project** - React + Vite setup
5. **Define API Contracts** - OpenAPI specs
6. **Set Up Shared Types** - TypeScript + Pydantic schemas
7. **Begin Development** - Start with Auth + Projects services

---

**Questions? Ready to start?** Let me know which area you'd like to dive into first!
