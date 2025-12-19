"""Azure Blob Storage service for audio file management."""
import logging
from typing import Optional

from azure.storage.blob import BlobServiceClient, BlobClient, ContentSettings
from azure.core.exceptions import ResourceNotFoundError, AzureError

from shared.config import Settings

logger = logging.getLogger(__name__)


class BlobStorageService:
    """
    Service for managing audio files in Azure Blob Storage.
    
    Handles upload, download, and deletion of audio files with proper error handling.
    """
    
    def __init__(self, settings: Settings):
        """Initialize blob storage service."""
        self.settings = settings
        self.connection_string = settings.AZURE_STORAGE_CONNECTION_STRING
        self.container_name = settings.AZURE_STORAGE_CONTAINER_NAME
        
        # Initialize blob service client
        try:
            self.blob_service_client = BlobServiceClient.from_connection_string(
                self.connection_string
            )
            logger.info(f"Initialized BlobStorageService for container: {self.container_name}")
        except Exception as e:
            logger.error(f"Failed to initialize BlobStorageService: {e}")
            raise
    
    def _get_blob_client(self, blob_path: str) -> BlobClient:
        """Get blob client for a specific blob path."""
        return self.blob_service_client.get_blob_client(
            container=self.container_name,
            blob=blob_path
        )
    
    async def upload_audio(
        self,
        blob_path: str,
        audio_data: bytes,
        content_type: str = "audio/mpeg"
    ) -> str:
        """
        Upload audio file to blob storage.
        
        Args:
            blob_path: Path in blob storage (e.g., "audio-cache/tenant-id/cache-key.mp3")
            audio_data: Audio file bytes
            content_type: MIME type (default: audio/mpeg)
            
        Returns:
            str: Full blob URL
            
        Raises:
            AzureError: If upload fails
        """
        try:
            blob_client = self._get_blob_client(blob_path)
            
            # Set content settings
            content_settings = ContentSettings(content_type=content_type)
            
            # Upload with overwrite
            blob_client.upload_blob(
                audio_data,
                overwrite=True,
                content_settings=content_settings
            )
            
            blob_url = blob_client.url
            logger.info(f"Uploaded audio to blob: {blob_path}")
            return blob_url
            
        except AzureError as e:
            logger.error(f"Failed to upload audio to blob {blob_path}: {e}")
            raise
    
    async def download_audio(self, blob_path: str) -> Optional[bytes]:
        """
        Download audio file from blob storage.
        
        Args:
            blob_path: Path in blob storage
            
        Returns:
            bytes: Audio file data, or None if not found
        """
        try:
            blob_client = self._get_blob_client(blob_path)
            
            # Download blob
            stream = blob_client.download_blob()
            audio_data = stream.readall()
            
            logger.info(f"Downloaded audio from blob: {blob_path}")
            return audio_data
            
        except ResourceNotFoundError:
            logger.warning(f"Blob not found: {blob_path}")
            return None
        except AzureError as e:
            logger.error(f"Failed to download audio from blob {blob_path}: {e}")
            raise
    
    async def delete_audio(self, blob_path: str) -> bool:
        """
        Delete audio file from blob storage.
        
        Args:
            blob_path: Path in blob storage
            
        Returns:
            bool: True if deleted, False if not found
        """
        try:
            blob_client = self._get_blob_client(blob_path)
            blob_client.delete_blob()
            
            logger.info(f"Deleted audio from blob: {blob_path}")
            return True
            
        except ResourceNotFoundError:
            logger.warning(f"Blob not found for deletion: {blob_path}")
            return False
        except AzureError as e:
            logger.error(f"Failed to delete audio from blob {blob_path}: {e}")
            raise
    
    async def blob_exists(self, blob_path: str) -> bool:
        """
        Check if a blob exists in storage.
        
        Args:
            blob_path: Path in blob storage
            
        Returns:
            bool: True if exists, False otherwise
        """
        try:
            blob_client = self._get_blob_client(blob_path)
            return blob_client.exists()
        except AzureError as e:
            logger.error(f"Failed to check blob existence {blob_path}: {e}")
            return False
    
    def generate_blob_path(self, tenant_id: str, cache_key: str, extension: str = "mp3") -> str:
        """
        Generate standardized blob path for audio cache.
        
        Args:
            tenant_id: Tenant UUID
            cache_key: Cache key (hash)
            extension: File extension (default: mp3)
            
        Returns:
            str: Blob path (e.g., "audio-cache/tenant-uuid/cache-key.mp3")
        """
        return f"audio-cache/{tenant_id}/{cache_key}.{extension}"
    
    async def get_blob_url(self, blob_path: str) -> Optional[str]:
        """
        Get public URL for a blob.
        
        Args:
            blob_path: Path in blob storage
            
        Returns:
            str: Public URL, or None if blob doesn't exist
        """
        try:
            blob_client = self._get_blob_client(blob_path)
            if blob_client.exists():
                return blob_client.url
            return None
        except AzureError as e:
            logger.error(f"Failed to get blob URL for {blob_path}: {e}")
            return None


# Singleton instance
_blob_storage_service: Optional[BlobStorageService] = None


def get_blob_storage_service(settings: Settings) -> BlobStorageService:
    """Get or create blob storage service instance."""
    global _blob_storage_service
    if _blob_storage_service is None:
        _blob_storage_service = BlobStorageService(settings)
    return _blob_storage_service
