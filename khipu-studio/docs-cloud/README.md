# Khipu Cloud - Getting Started

This guide will help you set up the Khipu Cloud project from scratch.

## Prerequisites

1. **Azure Subscription** - Active Azure account with billing enabled
2. **Development Tools**:
   - Node.js 18+ (for frontend)
   - Python 3.11+ (for backend)
   - Docker Desktop (for local development)
   - Azure CLI
   - Git

## Project Structure

```
khipu-studio/                    # Monorepo root
├── khipu-cloud-api/             # Backend API services
│   ├── services/
│   │   ├── auth/               # Authentication service
│   │   ├── projects/           # Project management
│   │   ├── characters/         # Character detection & casting
│   │   ├── audio/              # Audio generation & processing
│   │   ├── manuscripts/        # Manuscript parsing
│   │   └── packages/           # Export & packaging
│   ├── shared/                 # Shared utilities
│   ├── alembic/                # Database migrations
│   ├── tests/
│   └── docker-compose.yml
│
├── khipu-web/                   # Frontend web application
│   ├── src/
│   │   ├── components/         # UI components (reused from desktop)
│   │   ├── pages/              # Page components
│   │   ├── hooks/              # React hooks
│   │   ├── lib/                # API clients, utilities
│   │   └── store/              # State management (Zustand)
│   ├── public/
│   └── package.json
│
├── shared/                      # Shared code between frontend & backend
│   ├── types/                  # TypeScript type definitions
│   └── schemas/                # Validation schemas
│
├── docs-cloud/                  # Cloud architecture documentation
│   ├── 00-architecture-overview.md
│   ├── 01-database-schema.md
│   ├── 02-api-specifications.md
│   └── 03-deployment-guide.md
│
└── app/                         # Original desktop app (unchanged)
```

## Step 1: Azure Setup

### 1.1 Create Resource Group

```bash
# Login to Azure
az login

# Create resource group
az group create \\
  --name rg-khipu-prod \\
  --location eastus

# Or use Azure Portal:
# Portal → Resource Groups → Create
```

### 1.2 Create PostgreSQL Database

```bash
# Create PostgreSQL server
az postgres flexible-server create \\
  --resource-group rg-khipu-prod \\
  --name khipu-db-prod \\
  --location eastus \\
  --admin-user khipuadmin \\
  --admin-password "<YourStrongPassword>" \\
  --sku-name Standard_B2s \\
  --tier Burstable \\
  --version 14 \\
  --storage-size 128 \\
  --public-access 0.0.0.0

# Create database
az postgres flexible-server db create \\
  --resource-group rg-khipu-prod \\
  --server-name khipu-db-prod \\
  --database-name khipu_production
```

### 1.3 Create Storage Account

```bash
# Create storage account
az storage account create \\
  --name khipustorageprod \\
  --resource-group rg-khipu-prod \\
  --location eastus \\
  --sku Standard_LRS \\
  --kind StorageV2

# Create blob containers
az storage container create \\
  --name tenants \\
  --account-name khipustorageprod \\
  --public-access off
```

### 1.4 Create Redis Cache

```bash
az redis create \\
  --name khipu-cache-prod \\
  --resource-group rg-khipu-prod \\
  --location eastus \\
  --sku Basic \\
  --vm-size C1
```

### 1.5 Set Up Azure OpenAI

**Why Azure OpenAI over standard OpenAI API?**
- Native Azure integration (Managed Identity, VNet, unified billing)
- Enterprise security features (content filters, abuse monitoring)
- Regional deployment for data sovereignty
- Provisioned throughput for predictable high-volume costs

**Setup Steps:**

```bash
# Create Azure OpenAI resource
az cognitiveservices account create \
  --name khipu-openai-prod \
  --resource-group rg-khipu-prod \
  --location eastus \
  --kind OpenAI \
  --sku S0 \
  --custom-domain khipu-openai-prod

# Deploy GPT-4o model (for character detection)
az cognitiveservices account deployment create \
  --resource-group rg-khipu-prod \
  --name khipu-openai-prod \
  --deployment-name gpt-4o \
  --model-name gpt-4o \
  --model-version "2024-08-06" \
  --model-format OpenAI \
  --sku-capacity 10 \
  --sku-name "Standard"

# Deploy GPT-4o-mini (for simple/high-volume tasks)
az cognitiveservices account deployment create \
  --resource-group rg-khipu-prod \
  --name khipu-openai-prod \
  --deployment-name gpt-4o-mini \
  --model-name gpt-4o-mini \
  --model-version "2024-07-18" \
  --model-format OpenAI \
  --sku-capacity 50 \
  --sku-name "Standard"

# Get endpoint and key
AZURE_OPENAI_ENDPOINT=$(az cognitiveservices account show \
  --name khipu-openai-prod \
  --resource-group rg-khipu-prod \
  --query properties.endpoint \
  --output tsv)

AZURE_OPENAI_KEY=$(az cognitiveservices account keys list \
  --name khipu-openai-prod \
  --resource-group rg-khipu-prod \
  --query key1 \
  --output tsv)

echo "Azure OpenAI Endpoint: $AZURE_OPENAI_ENDPOINT"
echo "Azure OpenAI Key: [hidden for security]"
```

**Configure Managed Identity (Recommended for Production):**
```bash
# Enable system-assigned managed identity on Container App
az containerapp identity assign \
  --name khipu-api \
  --resource-group rg-khipu-prod \
  --system-assigned

# Grant "Cognitive Services OpenAI User" role
PRINCIPAL_ID=$(az containerapp identity show \
  --name khipu-api \
  --resource-group rg-khipu-prod \
  --query principalId \
  --output tsv)

az role assignment create \
  --assignee $PRINCIPAL_ID \
  --role "Cognitive Services OpenAI User" \
  --scope "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/rg-khipu-prod/providers/Microsoft.CognitiveServices/accounts/khipu-openai-prod"

echo "Managed Identity configured. No API keys needed in production!"
```

### 1.6 Set Up Azure Speech (TTS)

```bash
az cognitiveservices account create \\
  --name khipu-speech-prod \\
  --resource-group rg-khipu-prod \\
  --location eastus \\
  --kind SpeechServices \\
  --sku S0
```

## Step 2: Backend Setup (FastAPI)

### 2.1 Initialize Backend Project

```bash
cd khipu-cloud-api

# Create virtual environment
python -m venv venv

# Activate (Windows)
.\\venv\\Scripts\\activate

# Install dependencies
pip install fastapi uvicorn sqlalchemy alembic psycopg2-binary \
            pydantic pydantic-settings python-jose[cryptography] \
            passlib[bcrypt] python-multipart aiofiles httpx \
            redis azure-storage-blob azure-identity \
            openai azure-cognitiveservices-speech pytest pytest-asyncio

# Key dependencies explained:
# - openai>=1.50.0                    # Azure OpenAI SDK (unified client)
# - azure-identity>=1.15.0            # Managed Identity authentication
# - azure-cognitiveservices-speech    # Azure Speech Services (TTS)
# - azure-storage-blob                # Azure Blob Storage
# - fastapi[all]                      # Web framework with all extras
# - sqlalchemy[asyncio]               # Async database ORM

# Save dependencies
pip freeze > requirements.txt
```

### 2.2 Create Project Structure

```bash
# Create directories
mkdir -p services/auth services/projects services/characters \\
         services/audio services/manuscripts services/packages \\
         shared/db shared/models shared/schemas shared/utils \\
         alembic/versions tests

# Create __init__.py files
touch services/__init__.py shared/__init__.py tests/__init__.py
```

### 2.3 Configure Environment

```bash
# Create .env file
cat > .env << 'EOF'
# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT=https://khipu-openai-prod.openai.azure.com/
AZURE_OPENAI_API_VERSION=2024-10-21
AZURE_OPENAI_DEPLOYMENT_GPT4O=gpt-4o
AZURE_OPENAI_DEPLOYMENT_GPT4O_MINI=gpt-4o-mini

# Authentication (choose one)
# For local development/testing (using API key):
AZURE_OPENAI_API_KEY=<your-api-key-here>
# For production (using Managed Identity - no key needed):
# USE_MANAGED_IDENTITY=true

# Azure Speech Services
AZURE_SPEECH_KEY=<speech_key>
AZURE_SPEECH_REGION=eastus

# Database
DATABASE_URL=postgresql://khipuadmin:<password>@khipu-db-prod.postgres.database.azure.com/khipu_production?sslmode=require

# Redis
REDIS_URL=redis://:<password>@khipu-cache-prod.redis.cache.windows.net:6380?ssl=True

# Azure Storage
AZURE_STORAGE_CONNECTION_STRING=<connection_string>
AZURE_STORAGE_ACCOUNT_NAME=khipustorageprod
AZURE_STORAGE_CONTAINER_NAME=tenants

# Authentication
JWT_SECRET_KEY=<generate_random_secret>
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# Azure AD B2C
AZURE_AD_B2C_TENANT_ID=<tenant_id>
AZURE_AD_B2C_CLIENT_ID=<client_id>
AZURE_AD_B2C_CLIENT_SECRET=<client_secret>

# Application
ENV=development
DEBUG=True
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Default Tenant (for single-tenant deployment)
DEFAULT_TENANT_ID=00000000-0000-0000-0000-000000000001
EOF
```

### 2.4 Set Up Database Migrations

```bash
# Initialize Alembic
alembic init alembic

# Configure alembic.ini
# Edit: sqlalchemy.url = postgresql://...

# Create initial migration
alembic revision --autogenerate -m "Initial schema"

# Run migrations
alembic upgrade head
```

### 2.5 Run Backend Locally

```bash
# Start development server
uvicorn main:app --reload --port 8000

# Access API docs
# http://localhost:8000/docs
```

## Step 3: Frontend Setup (React + Vite)

### 3.1 Initialize Frontend Project

```bash
cd ../khipu-web

# Create Vite app with React + TypeScript
npm create vite@latest . -- --template react-ts

# Install dependencies
npm install

# Install additional libraries
npm install @tanstack/react-query zustand react-router-dom \\
            axios react-hook-form zod @hookform/resolvers \\
            date-fns i18next react-i18next

# Install dev dependencies
npm install -D @types/node
```

### 3.2 Configure Environment

```bash
# Create .env file
cat > .env << 'EOF'
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_WS_URL=ws://localhost:8000/ws
VITE_AZURE_AD_B2C_AUTHORITY=https://<tenant>.b2clogin.com
VITE_AZURE_AD_B2C_CLIENT_ID=<client_id>
EOF
```

### 3.3 Copy Components from Desktop App

```bash
# Copy reusable components
cp -r ../app/src/components ./src/
cp -r ../app/src/lib ./src/
cp -r ../app/src/locales ./src/
cp -r ../app/src/types ./src/

# Update imports to remove Electron-specific code
```

### 3.4 Run Frontend Locally

```bash
# Start development server
npm run dev

# Access app
# http://localhost:5173
```

## Step 4: Local Development with Docker

### 4.1 Create Docker Compose

```yaml
# docker-compose.yml in khipu-cloud-api/
version: '3.8'

services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_USER: khipu
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: khipu_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api:
    build: .
    command: uvicorn main:app --reload --host 0.0.0.0 --port 8000
    volumes:
      - .:/app
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://khipu:dev_password@postgres/khipu_dev
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

volumes:
  postgres_data:
```

### 4.2 Run with Docker

```bash
# Start all services
docker-compose up -d

# Run migrations
docker-compose exec api alembic upgrade head

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

## Step 5: Deploy to Azure

### 5.1 Deploy Backend (Azure Container Apps)

```bash
# Create Container Apps environment
az containerapp env create \\
  --name khipu-env-prod \\
  --resource-group rg-khipu-prod \\
  --location eastus

# Build and push Docker image
az acr create --resource-group rg-khipu-prod \\
              --name khipuregistry --sku Basic

# Login to ACR
az acr login --name khipuregistry

# Build and push
docker build -t khipuregistry.azurecr.io/khipu-api:latest .
docker push khipuregistry.azurecr.io/khipu-api:latest

# Deploy container app
az containerapp create \\
  --name khipu-api \\
  --resource-group rg-khipu-prod \\
  --environment khipu-env-prod \\
  --image khipuregistry.azurecr.io/khipu-api:latest \\
  --target-port 8000 \\
  --ingress 'external' \\
  --env-vars \\
    DATABASE_URL=secretref:database-url \\
    REDIS_URL=secretref:redis-url
```

### 5.2 Deploy Frontend (Azure Static Web Apps)

```bash
# Build production
cd khipu-web
npm run build

# Deploy to Azure Static Web Apps
az staticwebapp create \\
  --name khipu-web \\
  --resource-group rg-khipu-prod \\
  --source dist/ \\
  --location eastus \\
  --branch main \\
  --app-location "/" \\
  --api-location "" \\
  --output-location "dist"
```

## Step 6: Set Up CI/CD (GitHub Actions)

Create `.github/workflows/deploy-api.yml`:

```yaml
name: Deploy API

on:
  push:
    branches: [main]
    paths:
      - 'khipu-cloud-api/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Login to Azure
        uses: azure/login@v1
        with:
          creds: \${{ secrets.AZURE_CREDENTIALS }}
      
      - name: Build and push Docker image
        # ... build steps
      
      - name: Deploy to Container Apps
        # ... deploy steps
```

## Step 7: Testing

### Backend Tests
```bash
cd khipu-cloud-api
pytest tests/
pytest --cov=services tests/
```

### Frontend Tests
```bash
cd khipu-web
npm run test
npm run test:coverage
```

## Step 8: Monitoring

### Set Up Application Insights

```bash
az monitor app-insights component create \\
  --app khipu-insights \\
  --resource-group rg-khipu-prod \\
  --location eastus \\
  --application-type web
```

### Configure Alerts

- API latency > 2s
- Error rate > 1%
- Database CPU > 80%
- Storage capacity > 80%

## Next Steps

1. ✅ Review architecture documentation
2. ⬜ Set up Azure resources
3. ⬜ Initialize backend project
4. ⬜ Initialize frontend project
5. ⬜ Migrate shared code from desktop app
6. ⬜ Implement authentication
7. ⬜ Build core APIs (projects, manuscripts)
8. ⬜ Build web UI
9. ⬜ Deploy to staging environment
10. ⬜ User acceptance testing
11. ⬜ Production deployment

## Useful Commands

```bash
# Backend
cd khipu-cloud-api
source venv/bin/activate  # or .\\venv\\Scripts\\activate on Windows
uvicorn main:app --reload

# Frontend
cd khipu-web
npm run dev

# Database migrations
alembic revision --autogenerate -m "Migration name"
alembic upgrade head
alembic downgrade -1

# Docker
docker-compose up -d
docker-compose logs -f api
docker-compose exec api bash

# Azure CLI
az login
az account show
az group list
az resource list --resource-group rg-khipu-prod
```

## Troubleshooting

### Database Connection Issues
- Check firewall rules in Azure Portal
- Verify connection string
- Ensure SSL is enabled

### Authentication Issues
- Verify Azure AD B2C configuration
- Check JWT secret and algorithm
- Validate token expiration

### Storage Issues
- Verify storage account access keys
- Check container permissions
- Validate SAS token generation

## Support & Resources

- **Architecture Docs**: `/docs-cloud/`
- **API Docs**: `http://localhost:8000/docs` (local)
- **Azure Docs**: https://docs.microsoft.com/azure
- **FastAPI Docs**: https://fastapi.tiangolo.com
- **React Query**: https://tanstack.com/query

---

Ready to start building? Pick a component and let's dive in! 🚀
