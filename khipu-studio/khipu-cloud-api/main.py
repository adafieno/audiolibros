"""
Khipu Cloud API - Main Application Entry Point
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import asyncio

from shared.config import settings
from shared.db.database import engine, get_db
from services.auth.router import router as auth_router
from services.projects.router import router as projects_router
from services.chapters.router import router as chapters_router
from services.voices.router import router as voices_router
from services.characters.router import router as characters_router
from services.planning.router import router as planning_router
from services.actions.router import router as actions_router

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


async def cleanup_audio_cache_task():
    """Background task to cleanup expired and LRU audio cache entries"""
    from shared.services.audio_cache import get_audio_cache_service
    
    while True:
        try:
            # Wait 1 hour between cleanup runs
            await asyncio.sleep(3600)
            
            logger.info("🧹 Running audio cache cleanup...")
            
            # Get database session
            async for db in get_db():
                audio_cache_service = get_audio_cache_service()
                
                # Cleanup expired entries
                deleted_expired = await audio_cache_service.cleanup_expired_cache(db)
                logger.info(f"🗑️ Deleted {deleted_expired} expired cache entries")
                
                # Cleanup LRU entries (keep 10,000 most recent per tenant)
                deleted_lru = await audio_cache_service.cleanup_lru_cache(db, max_entries=10000)
                logger.info(f"🗑️ Deleted {deleted_lru} old cache entries via LRU")
                
                # Get cache stats
                stats = await audio_cache_service.get_cache_stats(db)
                logger.info(
                    f"📊 Cache stats: {stats['total_entries']} entries, "
                    f"{stats['total_size_mb']:.2f} MB, "
                    f"{stats['total_hits']} total hits, "
                    f"{stats['average_hits_per_entry']:.2f} avg hits/entry"
                )
                
                break  # Exit the async for loop after one iteration
                
        except Exception as e:
            logger.error(f"❌ Error during audio cache cleanup: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown events"""
    # Startup
    logger.info("Starting Khipu Cloud API...")
    logger.info(f"Environment: {settings.ENV}")
    logger.info(f"Debug mode: {settings.DEBUG}")
    logger.info("Database schema managed by Alembic migrations")
    
    # Start background tasks
    cleanup_task = asyncio.create_task(cleanup_audio_cache_task())
    logger.info("✅ Started audio cache cleanup background task")
    
    yield
    
    # Shutdown
    logger.info("Shutting down Khipu Cloud API...")
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        logger.info("✅ Cancelled audio cache cleanup task")
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
app.include_router(planning_router, prefix="/api/v1/projects/{project_id}/planning", tags=["Planning"])
app.include_router(voices_router, prefix="/api/v1", tags=["Voices"])
app.include_router(characters_router, prefix="/api/v1", tags=["Characters"])
app.include_router(actions_router, prefix="/api/v1", tags=["Actions"])


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
