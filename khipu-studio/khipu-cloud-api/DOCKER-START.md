# Docker Startup Guide

## Prerequisites
1. **Start Docker Desktop** (required before running any docker commands)
   - Open Docker Desktop application
   - Wait until it shows "Docker Desktop is running"

## Starting the Services

```powershell
cd khipu-cloud-api
docker-compose up -d
```

This starts:
- **PostgreSQL** on port 5432
- **Redis** on port 6379  
- **API** on port 8000

## Check Status

```powershell
docker-compose ps
```

## View Logs

```powershell
# All services
docker-compose logs -f

# Just the API
docker-compose logs -f api
```

## Access the API

- **Swagger UI**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health
- **Root**: http://localhost:8000/

## Stop Services

```powershell
# Stop but keep data
docker-compose stop

# Stop and remove containers (keeps data volumes)
docker-compose down

# Stop and remove everything including data
docker-compose down -v
```

## Troubleshooting

### "Cannot find file specified" error
- Start Docker Desktop first

### Port already in use
```powershell
# Check what's using the port
netstat -ano | findstr :8000

# Stop the process
taskkill /PID <process-id> /F
```

### Reset everything
```powershell
docker-compose down -v
docker-compose up -d --build
```

## Development Workflow

The API container uses **hot reload** - any changes to Python files will automatically restart the server.

1. Edit code in your editor
2. Save file
3. Docker detects change and reloads
4. Test at http://localhost:8000/docs
