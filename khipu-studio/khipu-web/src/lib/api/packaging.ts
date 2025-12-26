import api from '../api';

// ============================================================================
// Types
// ============================================================================

export interface ValidationResults {
  is_valid: boolean;
  errors?: string[];
  warnings?: string[];
  metadata?: Record<string, unknown>;
}

export interface AudioSpec {
  codec: string;
  bitrate_kbps: number;
  sample_rate_hz: number;
  channels: number;
}

export interface PlatformRequirement {
  id: string;
  met: boolean;
  details?: string;
  expected?: unknown;
  actual?: unknown;
}

export interface PlatformReadiness {
  id: string;
  name: string;
  enabled: boolean;
  ready: boolean;
  requirements: PlatformRequirement[];
}

export interface PackagingReadinessResponse {
  overall_ready: boolean;
  completion_stats: {
    total_chapters: number;
    chapters_with_complete_audio: number;
    total_segments: number;
    segments_with_audio: number;
    percent_complete: number;
  };
  platforms: PlatformReadiness[];
  missing_audio: {
    chapterIds: string[];
    segmentIds: string[];
  };
}

export interface PackagingJobResponse {
  id: string;
  project_id: string;
  platform_id: string;
  status: 'queued' | 'downloading_audio' | 'processing' | 'uploading' | 'completed' | 'failed';
  progress_percent: number;
  current_step: string;
  error_message?: string;
  package_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CreatePackagesRequest {
  platform_ids?: string[];
}

export interface CreatePackagesResponse {
  project_id: string;
  jobs: PackagingJobResponse[];
  message: string;
}

export interface PackageResponse {
  id: string;
  project_id: string;
  platform_id: string;
  platform_name: string;
  version_number: number;
  package_format: string;
  blob_path: string;
  blob_container: string;
  storage_tier: 'temp' | 'archive';
  size_bytes: number;
  audio_spec: AudioSpec;
  is_validated: boolean;
  validation_results?: ValidationResults;
  same_as_package_id?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface StorageQuota {
  used_mb: number;
  limit_mb: number;
  available_mb: number;
  percentage_used: number;
}

export interface PackageListResponse {
  packages: PackageResponse[];
  total_count: number;
  storage_quota: StorageQuota;
}

export interface ArchivePackageRequest {
  confirmation?: boolean;
}

export interface ArchivePackageResponse {
  package_id: string;
  storage_tier: string;
  expires_at?: string;
  message: string;
  storage_quota: StorageQuota;
}

// ============================================================================
// API Functions
// ============================================================================

export const packagingApi = {
  /**
   * Check if project is ready for packaging
   */
  getReadiness: async (projectId: string): Promise<PackagingReadinessResponse> => {
    const response = await api.get(`/projects/${projectId}/packaging/readiness`);
    return response.data;
  },

  /**
   * Create packages for all (or specified) platforms
   */
  createPackages: async (
    projectId: string,
    request: CreatePackagesRequest = {}
  ): Promise<CreatePackagesResponse> => {
    const response = await api.post(`/projects/${projectId}/packaging/create-all`, request);
    return response.data;
  },

  /**
   * Get status of a specific packaging job
   */
  getJobStatus: async (projectId: string, jobId: string): Promise<PackagingJobResponse> => {
    const response = await api.get(`/projects/${projectId}/packaging/jobs/${jobId}`);
    return response.data;
  },

  /**
   * List all packaging jobs for a project
   */
  listJobs: async (
    projectId: string,
    status?: string,
    limit?: number
  ): Promise<PackagingJobResponse[]> => {
    const params = new URLSearchParams();
    if (status) params.append('status_filter', status);
    if (limit) params.append('limit', limit.toString());
    
    const response = await api.get(`/projects/${projectId}/packaging/jobs?${params}`);
    return response.data;
  },

  /**
   * List all packages for a project
   */
  listPackages: async (
    projectId: string,
    platformId?: string,
    storageTier?: string
  ): Promise<PackageListResponse> => {
    const params = new URLSearchParams();
    if (platformId) params.append('platform_id', platformId);
    if (storageTier) params.append('storage_tier', storageTier);
    
    const response = await api.get(`/projects/${projectId}/packages?${params}`);
    return response.data;
  },

  /**
   * Archive a package (move from temp to archive tier)
   */
  archivePackage: async (
    projectId: string,
    packageId: string,
    request: ArchivePackageRequest = {}
  ): Promise<ArchivePackageResponse> => {
    const response = await api.post(
      `/projects/${projectId}/packages/${packageId}/archive`,
      request
    );
    return response.data;
  },

  /**
   * Validate a package
   */
  validatePackage: async (projectId: string, packageId: string): Promise<ValidationResults> => {
    const response = await api.post(`/projects/${projectId}/packages/${packageId}/validate`);
    return response.data;
  },

  /**
   * Get download URL for a package
   */
  getDownloadUrl: (packageResponse: PackageResponse): string => {
    // This would need to be implemented with a proper signed URL endpoint
    // For now, return a placeholder
    return `/api/v1/packages/${packageResponse.id}/download`;
  },
};

export default packagingApi;
