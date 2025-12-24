import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { packagingApi, type PlatformReadiness, type PackagingJobResponse } from '../lib/api/packaging';

export const Route = createFileRoute('/projects/$projectId/packaging')({
  component: PackagingPage,
});

function PackagingPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const [activeJobs, setActiveJobs] = useState<PackagingJobResponse[]>([]);

  // Query packaging readiness
  const { data: readiness, isLoading: isLoadingReadiness, error: readinessError } = useQuery({
    queryKey: ['packaging-readiness', projectId],
    queryFn: () => packagingApi.getReadiness(projectId),
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Query packages list
  const { data: packagesData, isLoading: isLoadingPackages } = useQuery({
    queryKey: ['packages', projectId],
    queryFn: () => packagingApi.listPackages(projectId),
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Query active jobs
  const { data: jobs } = useQuery({
    queryKey: ['packaging-jobs', projectId],
    queryFn: () => packagingApi.listJobs(projectId),
    refetchInterval: 2000, // Poll every 2 seconds for job updates
  });

  // Update active jobs
  useEffect(() => {
    if (jobs) {
      const active = jobs.filter(
        (j) => j.status !== 'completed' && j.status !== 'failed'
      );
      setActiveJobs(active);
    }
  }, [jobs]);

  // Create packages mutation
  const createPackagesMutation = useMutation({
    mutationFn: (platformIds?: string[]) =>
      packagingApi.createPackages(projectId, { platform_ids: platformIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packaging-jobs', projectId] });
    },
  });

  // Archive package mutation
  const archivePackageMutation = useMutation({
    mutationFn: (packageId: string) =>
      packagingApi.archivePackage(projectId, packageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packages', projectId] });
    },
  });

  const handleCreateAll = () => {
    if (!readiness) return;
    
    const readyPlatforms = readiness.platforms
      .filter((p) => p.is_ready)
      .map((p) => p.platform_id);
    
    if (readyPlatforms.length === 0) {
      alert('No platforms are ready for packaging');
      return;
    }
    
    createPackagesMutation.mutate(readyPlatforms);
  };

  const handleCreatePlatform = (platformId: string) => {
    createPackagesMutation.mutate([platformId]);
  };

  if (isLoadingReadiness) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading packaging status...</p>
        </div>
      </div>
    );
  }

  if (readinessError) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-red-800 font-semibold">Error Loading Packaging</h2>
          <p className="text-red-600 mt-2">{(readinessError as Error).message}</p>
        </div>
      </div>
    );
  }

  const audioCompletion = readiness?.audio_completion;
  const isProjectReady = readiness?.is_ready || false;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Packaging</h1>
        <p className="text-gray-600">Create downloadable packages for distribution platforms</p>
      </div>

      {/* Audio Completion Status */}
      {audioCompletion && (
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Audio Completion</h2>
            <span className={`text-2xl font-bold ${
              audioCompletion.completion_percentage === 100
                ? 'text-green-600'
                : 'text-orange-600'
            }`}>
              {audioCompletion.completion_percentage.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
            <div
              className={`h-3 rounded-full transition-all ${
                audioCompletion.completion_percentage === 100
                  ? 'bg-green-600'
                  : 'bg-orange-500'
              }`}
              style={{ width: `${audioCompletion.completion_percentage}%` }}
            />
          </div>
          <p className="text-sm text-gray-600">
            {audioCompletion.segments_with_audio} of {audioCompletion.total_segments} segments
          </p>
        </div>
      )}

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Active Jobs</h2>
          <div className="space-y-3">
            {activeJobs.map((job) => (
              <JobProgressCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {/* Create All Button */}
      <div className="mb-6">
        <button
          onClick={handleCreateAll}
          disabled={!isProjectReady || createPackagesMutation.isPending || activeJobs.length > 0}
          className={`w-full py-3 px-6 rounded-lg font-semibold text-white transition-colors ${
            isProjectReady && activeJobs.length === 0
              ? 'bg-indigo-600 hover:bg-indigo-700'
              : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          {activeJobs.length > 0
            ? 'Packaging in Progress...'
            : createPackagesMutation.isPending
            ? 'Creating Packages...'
            : 'Create All Ready Packages'}
        </button>
      </div>

      {/* Platform Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {readiness?.platforms.map((platform) => (
          <PlatformCard
            key={platform.platform_id}
            platform={platform}
            onCreatePackage={handleCreatePlatform}
            isCreating={createPackagesMutation.isPending}
            hasActiveJob={activeJobs.some((j) => j.platform_id === platform.platform_id)}
          />
        ))}
      </div>

      {/* Existing Packages */}
      {packagesData && packagesData.packages.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Existing Packages</h2>
          
          {/* Storage Quota */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-900">Storage Usage</span>
              <span className="text-sm text-blue-700">
                {packagesData.storage_quota.used_mb.toFixed(2)} MB / {packagesData.storage_quota.limit_mb} MB
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(packagesData.storage_quota.percentage_used, 100)}%` }}
              />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Platform</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Version</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {packagesData.packages.map((pkg) => (
                  <PackageRow
                    key={pkg.id}
                    package={pkg}
                    onArchive={() => archivePackageMutation.mutate(pkg.id)}
                    isArchiving={archivePackageMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Platform Card Component
// ============================================================================

function PlatformCard({
  platform,
  onCreatePackage,
  isCreating,
  hasActiveJob,
}: {
  platform: PlatformReadiness;
  onCreatePackage: (platformId: string) => void;
  isCreating: boolean;
  hasActiveJob: boolean;
}) {
  const platformIcons: Record<string, string> = {
    apple: '🍎',
    google: '📚',
    spotify: '🎵',
    acx: '🎧',
    kobo: '📖',
  };

  return (
    <div className={`bg-white rounded-lg shadow p-6 ${
      platform.is_ready ? 'border-2 border-green-500' : 'border border-gray-200'
    }`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <span className="text-3xl mr-3">{platformIcons[platform.platform_id] || '📦'}</span>
          <h3 className="text-lg font-semibold text-gray-900">{platform.platform_name}</h3>
        </div>
        {platform.is_ready ? (
          <span className="text-green-600 text-sm font-medium">✓ Ready</span>
        ) : (
          <span className="text-orange-600 text-sm font-medium">⚠ Not Ready</span>
        )}
      </div>

      {/* Requirements */}
      <div className="space-y-2 mb-4">
        {platform.requirements.map((req) => (
          <div key={req.requirement_id} className="flex items-start text-sm">
            <span className={`mr-2 ${req.is_met ? 'text-green-600' : 'text-red-600'}`}>
              {req.is_met ? '✓' : '✗'}
            </span>
            <span className={req.is_met ? 'text-gray-600' : 'text-red-600'}>
              {req.description}
            </span>
          </div>
        ))}
      </div>

      {/* Missing Items */}
      {platform.missing_items.length > 0 && (
        <div className="mb-4 p-3 bg-orange-50 rounded text-sm">
          <p className="font-medium text-orange-900 mb-1">Missing:</p>
          <ul className="list-disc list-inside text-orange-700">
            {platform.missing_items.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Estimated Size */}
      {platform.estimated_size_mb && (
        <p className="text-sm text-gray-600 mb-4">
          Estimated size: {platform.estimated_size_mb.toFixed(2)} MB
        </p>
      )}

      {/* Create Button */}
      <button
        onClick={() => onCreatePackage(platform.platform_id)}
        disabled={!platform.is_ready || isCreating || hasActiveJob}
        className={`w-full py-2 px-4 rounded font-medium transition-colors ${
          platform.is_ready && !hasActiveJob
            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
        }`}
      >
        {hasActiveJob ? 'Packaging...' : isCreating ? 'Creating...' : 'Create Package'}
      </button>
    </div>
  );
}

// ============================================================================
// Job Progress Card Component
// ============================================================================

function JobProgressCard({ job }: { job: PackagingJobResponse }) {
  const platformNames: Record<string, string> = {
    apple: 'Apple Books',
    google: 'Google Play',
    spotify: 'Spotify',
    acx: 'ACX/Audible',
    kobo: 'Kobo',
  };

  const statusColors: Record<string, string> = {
    queued: 'bg-gray-500',
    downloading_audio: 'bg-blue-500',
    processing: 'bg-indigo-500',
    uploading: 'bg-purple-500',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">
          {platformNames[job.platform_id] || job.platform_id}
        </h3>
        <span className={`px-3 py-1 rounded-full text-white text-sm ${statusColors[job.status]}`}>
          {job.status.replace('_', ' ')}
        </span>
      </div>

      <div className="mb-2">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
          <span>{job.current_step}</span>
          <span>{job.progress_percent}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-indigo-600 h-2 rounded-full transition-all"
            style={{ width: `${job.progress_percent}%` }}
          />
        </div>
      </div>

      {job.error_message && (
        <p className="text-sm text-red-600 mt-2">{job.error_message}</p>
      )}
    </div>
  );
}

// ============================================================================
// Package Row Component
// ============================================================================

function PackageRow({
  package: pkg,
  onArchive,
  isArchiving,
}: {
  package: any;
  onArchive: () => void;
  isArchiving: boolean;
}) {
  const formatSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <tr>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
        {pkg.platform_name}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        v{pkg.version_number}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {formatSize(pkg.size_bytes)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          pkg.storage_tier === 'archive'
            ? 'bg-blue-100 text-blue-800'
            : 'bg-yellow-100 text-yellow-800'
        }`}>
          {pkg.storage_tier}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {formatDate(pkg.expires_at)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
        <a
          href={packagingApi.getDownloadUrl(pkg)}
          className="text-indigo-600 hover:text-indigo-900"
          download
        >
          Download
        </a>
        {pkg.storage_tier === 'temp' && (
          <button
            onClick={onArchive}
            disabled={isArchiving}
            className="text-blue-600 hover:text-blue-900 disabled:text-gray-400"
          >
            {isArchiving ? 'Archiving...' : 'Archive'}
          </button>
        )}
      </td>
    </tr>
  );
}
