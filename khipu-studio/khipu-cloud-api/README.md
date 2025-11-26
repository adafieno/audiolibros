# Khipu Cloud API

FastAPI-based backend for Khipu Studio cloud platform.

## Quick Start

### 1. Setup Environment

```powershell
# Create virtual environment
python -m venv venv

# Activate (Windows)
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment

```powershell
# Copy example environment file
cp .env.example .env

# Edit .env and add your Azure credentials
```

**Required Configuration**:
- Azure OpenAI endpoint and API key
- Azure Speech Services key
- PostgreSQL database URL
- JWT secret key

### 3. Setup Database

```powershell
# Run with Docker (recommended for local development)
docker-compose up -d postgres redis

# Or install PostgreSQL and Redis locally
```

### 4. Run Development Server

```powershell
# Run with auto-reload
python main.py

# Or use uvicorn directly
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API will be available at:
- **API**: http://localhost:8000
- **Docs**: http://localhost:8000/docs
- **Health**: http://localhost:8000/health

## Project Structure

```
khipu-cloud-api/
├── main.py                    # Application entry point
├── requirements.txt           # Python dependencies
├── .env.example              # Environment template
├── shared/                   # Shared utilities
│   ├── config.py            # Configuration
│   ├── db/                  # Database setup
│   ├── models/              # SQLAlchemy models
│   ├── schemas/             # Pydantic schemas
│   └── utils/               # Utilities
├── services/                # Microservices
│   ├── auth/               # Authentication
│   ├── projects/           # Project management
│   ├── characters/         # Character detection
│   ├── audio/              # Audio generation
│   ├── manuscripts/        # Manuscript processing
│   └── packages/           # Packaging & export
├── alembic/                # Database migrations
│   └── versions/
└── tests/                  # Tests
    ├── unit/
    └── integration/
```

## Development

### Running Tests

```powershell
# Run all tests
pytest

# Run with coverage
pytest --cov=. --cov-report=term-missing

# Run specific test file
pytest tests/unit/test_auth.py
```

### Code Quality

```powershell
# Format code
black .

# Lint code
flake8 .

# Type checking
mypy .
```

### Database Migrations

```powershell
# Create migration
alembic revision --autogenerate -m "Description"

# Apply migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1
```

## Docker Support

```powershell
# Build image
docker build -t khipu-cloud-api .

# Run with docker-compose
docker-compose up -d
```

## Next Steps

1. ✅ Project structure created
2. ⬜ Implement authentication service
3. ⬜ Implement projects CRUD
4. ⬜ Add Azure OpenAI integration
5. ⬜ Add Azure Speech integration
6. ⬜ Implement character detection
7. ⬜ Add audio generation
8. ⬜ Deploy to Azure

## Documentation

- **Architecture**: [../docs-cloud/00-architecture-overview.md](../docs-cloud/00-architecture-overview.md)
- **Database Schema**: [../docs-cloud/01-database-schema.md](../docs-cloud/01-database-schema.md)
- **API Specs**: [../docs-cloud/02-api-specifications.md](../docs-cloud/02-api-specifications.md)
- **Azure OpenAI Integration**: [../docs-cloud/03-azure-openai-integration.md](../docs-cloud/03-azure-openai-integration.md)
