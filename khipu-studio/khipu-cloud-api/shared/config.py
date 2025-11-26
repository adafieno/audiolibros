"""
Application Configuration
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )
    
    # Environment
    ENV: str = "development"
    DEBUG: bool = True
    LOG_LEVEL: str = "INFO"
    
    # API Configuration
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_RELOAD: bool = True
    
    # Azure OpenAI
    AZURE_OPENAI_ENDPOINT: str
    AZURE_OPENAI_API_VERSION: str = "2024-10-21"
    AZURE_OPENAI_DEPLOYMENT_GPT4O: str = "gpt-4o"
    AZURE_OPENAI_DEPLOYMENT_GPT4O_MINI: str = "gpt-4o-mini"
    AZURE_OPENAI_API_KEY: str | None = None
    USE_MANAGED_IDENTITY: bool = False
    
    # Azure Speech
    AZURE_SPEECH_KEY: str
    AZURE_SPEECH_REGION: str = "eastus"
    
    # Database
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 5
    DATABASE_MAX_OVERFLOW: int = 10
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_PASSWORD: str | None = None
    
    # Azure Storage
    AZURE_STORAGE_CONNECTION_STRING: str
    AZURE_STORAGE_ACCOUNT_NAME: str
    AZURE_STORAGE_CONTAINER_NAME: str = "tenants"
    
    # JWT Authentication
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Azure AD B2C (Optional)
    AZURE_AD_B2C_TENANT_ID: str | None = None
    AZURE_AD_B2C_CLIENT_ID: str | None = None
    AZURE_AD_B2C_CLIENT_SECRET: str | None = None
    AZURE_AD_B2C_AUTHORITY: str | None = None
    
    # CORS - Accept both comma-separated string and JSON array
    CORS_ORIGINS: str | List[str] = ["http://localhost:5173", "http://localhost:3000"]
    CORS_ALLOW_CREDENTIALS: bool = True
    
    # Default Tenant
    DEFAULT_TENANT_ID: str = "00000000-0000-0000-0000-000000000001"
    DEFAULT_TENANT_NAME: str = "Default Tenant"
    DEFAULT_TENANT_SUBDOMAIN: str = "app"
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 100
    
    # Monitoring
    APPLICATIONINSIGHTS_CONNECTION_STRING: str | None = None
    
    @property
    def is_production(self) -> bool:
        """Check if running in production environment"""
        return self.ENV == "production"
    
    @property
    def azure_openai_auth(self) -> dict:
        """Get Azure OpenAI authentication configuration"""
        if self.USE_MANAGED_IDENTITY:
            return {"use_managed_identity": True}
        return {"api_key": self.AZURE_OPENAI_API_KEY}
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Convert CORS origins to list if it's a string"""
        if isinstance(self.CORS_ORIGINS, str):
            # Handle comma-separated string
            return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
        return self.CORS_ORIGINS


# Create global settings instance
settings = Settings()
