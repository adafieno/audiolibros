"""
Khipu Cloud API - Main Application Entry Point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from shared.config import settings
from shared.db.database import engine, Base
from services.auth.router import router as auth_router
from services.projects.router import router as projects_router
from services.chapters.router import router as chapters_router
from services.voices.router import router as voices_router

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown events"""
    # Startup
    logger.info("Starting Khipu Cloud API...")
    logger.info(f"Environment: {settings.ENV}")
    logger.info(f"Debug mode: {settings.DEBUG}")
    logger.info("Database schema managed by Alembic migrations")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Khipu Cloud API...")
    await engine.dispose()


# Create FastAPI application
app = FastAPI(
    title="Khipu Cloud API",
    description="AI-powered audiobook production platform - Cloud Edition",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(projects_router, prefix="/api/v1/projects", tags=["Projects"])
app.include_router(chapters_router, prefix="/api/v1/projects/{project_id}/chapters", tags=["Chapters"])
app.include_router(voices_router, prefix="/api/v1/projects", tags=["Voices"])


@app.get("/")
async def root():
    """Root endpoint - API health check"""
    return {
        "service": "Khipu Cloud API",
        "version": "1.0.0",
        "status": "healthy",
        "environment": settings.ENV
    }


@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "database": "connected",  # TODO: Add actual DB health check
        "cache": "connected"       # TODO: Add actual Redis health check
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.API_HOST,
        port=settings.API_PORT,
        reload=settings.API_RELOAD
    )
