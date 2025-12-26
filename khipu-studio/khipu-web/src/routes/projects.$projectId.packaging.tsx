import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { packagingApi, type PlatformReadiness, type PackagingJobResponse, type PackageResponse } from '../lib/api/packaging';
import { Button } from '../components/Button';

export const Route = createFileRoute('/projects/$projectId/packaging')({
  component: PackagingPage,
});

function PackagingPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const [showManifest, setShowManifest] = useState(false);
  const [validatingPackageIds, setValidatingPackageIds] = useState<Set<string>>(new Set());

  // Query packaging readiness
  const { data: readiness, isLoading: isLoadingReadiness, error: readinessError } = useQuery({
    queryKey: ['packaging-readiness', projectId],
    queryFn: () => packagingApi.getReadiness(projectId),
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Query manifest (always available, auto-generated from database)
  const { data: manifest, isLoading: isLoadingManifest } = useQuery({
    queryKey: ['packaging-manifest', projectId],
    queryFn: () => packagingApi.getManifest(projectId),
  });

  // Query packages list
  const { data: packagesData } = useQuery({
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

  // Track active jobs for UI - derived from query data
  const activeJobsList =
    jobs?.filter(
      (j) => j.status !== 'completed' && j.status !== 'failed'
    ) || [];

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

  // Validate package mutation
  const validatePackageMutation = useMutation({
    mutationFn: ({ packageId }: { packageId: string }) =>
      packagingApi.validatePackage(projectId, packageId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['packages', projectId] });
      setValidatingPackageIds(prev => {
        const next = new Set(prev);
        next.delete(variables.packageId);
        return next;
      });
    },
    onError: (_, variables) => {
      setValidatingPackageIds(prev => {
        const next = new Set(prev);
        next.delete(variables.packageId);
        return next;
      });
    },
  });

  const handleCreatePlatform = (platformId: string) => {
    // Refresh manifest when packaging starts
    queryClient.invalidateQueries({ queryKey: ['packaging-manifest', projectId] });
    createPackagesMutation.mutate([platformId]);
  };

  const handleViewManifest = () => {
    setShowManifest(!showManifest);
  };

  const handleValidatePackage = (packageId: string) => {
    setValidatingPackageIds(prev => new Set(prev).add(packageId));
    validatePackageMutation.mutate({ packageId });
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

  const isProjectReady = readiness?.overall_ready || false;

  return (
    <div className="p-6">
      {/* Header Panel */}
      <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border p-6 mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)', margin: 0 }}>
            Packaging
          </h1>
          {isProjectReady && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium shadow" style={{ background: '#22c55e', color: '#052e12' }}>
              Ready
            </span>
          )}
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)', margin: 0 }}>
          Prepare your audiobook for delivery to platforms. Review requirements and create packages when ready.
        </p>
      </div>

      {/* Universal Manifest Section */}
      <div 
        className="mb-6 rounded-lg shadow border p-6" 
        style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }}
      >
        <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text)' }}>
          Universal Manifest
          <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-muted)' }}>(Optional)</span>
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          The universal manifest aggregates all book metadata, chapter information, and audio file paths into a single file needed for platform-specific packaging.
        </p>
        
        {/* Status Indicator */}
        <div 
          className="flex items-center gap-3 mb-4 p-3 rounded" 
          style={{ 
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)'
          }}
        >
          <span style={{ 
            color: manifest ? 'var(--success)' : 'var(--text-muted)', 
            fontSize: '20px',
            lineHeight: 1
          }}>
            {manifest ? '✓' : isLoadingManifest ? '⟳' : '○'}
          </span>
          <div className="flex-1">
            <div className="font-medium" style={{ color: 'var(--text)' }}>
              {manifest ? 'Manifest generated' : 'Manifest not loaded'}
            </div>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {isLoadingManifest ? 'Loading...' : 'Ready for platform packaging'}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div>
          <Button
            variant="primary"
            onClick={handleViewManifest}
            disabled={isLoadingManifest || !manifest}
          >
            {showManifest ? 'Hide Manifest' : 'View Manifest'}
          </Button>
        </div>

        {/* Manifest Viewer */}
        {showManifest && manifest && (
          <div 
            className="mt-4 rounded border p-4" 
            style={{ 
              backgroundColor: 'var(--surface)', 
              borderColor: 'var(--border)'
            }}
          >
            <pre 
              className="text-xs overflow-auto" 
              style={{ 
                color: 'var(--text)', 
                maxHeight: '400px',
                margin: 0,
                fontFamily: 'monospace'
              }}
            >
              {JSON.stringify(manifest, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Active Jobs */}
      {activeJobsList.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text)' }}>Active Jobs</h2>
          <div className="space-y-3">
            {activeJobsList.map((job) => (
              <JobProgressCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {/* Platform Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {readiness?.platforms.map((platform) => {
          // Find package for this platform
          const platformPackage = packagesData?.packages.find(pkg => pkg.platform_id === platform.id);
          
          return (
            <PlatformCard
              key={platform.id}
              platform={platform}
              package={platformPackage}
              onCreatePackage={handleCreatePlatform}
              onValidatePackage={handleValidatePackage}
              isCreating={createPackagesMutation.isPending}
              isValidating={platformPackage ? validatingPackageIds.has(platformPackage.id) : false}
              hasActiveJob={activeJobsList.some((j: PackagingJobResponse) => j.platform_id === platform.id)}
            />
          );
        })}
      </div>

      {/* Existing Packages */}
      {packagesData && packagesData.packages.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text)' }}>Existing Packages</h2>
          
          {/* Storage Quota */}
          <div className="rounded-lg border p-4 mb-4" style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Storage Usage</span>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {packagesData.storage_quota.used_mb.toFixed(2)} MB / {packagesData.storage_quota.limit_mb} MB
              </span>
            </div>
            <div className="w-full rounded-full h-2" style={{ backgroundColor: 'var(--border)' }}>
              <div
                className="h-2 rounded-full transition-all"
                style={{ backgroundColor: 'var(--primary)', width: `${Math.min(packagesData.storage_quota.percentage_used, 100)}%` }}
              />
            </div>
          </div>

          <div className="rounded-lg shadow border overflow-hidden" style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }}>
            <table className="min-w-full" style={{ borderColor: 'var(--border)' }}>
              <thead style={{ backgroundColor: 'var(--surface)' }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Platform</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Version</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Size</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Tier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Expires</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase" style={{ color: 'var(--text-secondary)' }}>Actions</th>
                </tr>
              </thead>
              <tbody style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }}>
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
  package: pkg,
  onCreatePackage,
  onValidatePackage,
  isCreating,
  isValidating,
  hasActiveJob,
}: {
  platform: PlatformReadiness;
  package?: PackageResponse;
  onCreatePackage: (platformId: string) => void;
  onValidatePackage: (packageId: string) => void;
  isCreating: boolean;
  isValidating: boolean;
  hasActiveJob: boolean;
}) {
  const [showValidationDetails, setShowValidationDetails] = useState(false);

  return (
    <div
      className="rounded-lg shadow border p-6"
      style={{
        backgroundColor: 'var(--panel)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{platform.name}</h3>
          {platform.ready ? (
            <span 
              className="px-2 py-1 rounded-full text-xs font-medium"
              style={{ 
                backgroundColor: 'var(--success)', 
                color: 'white'
              }}
            >
              Ready
            </span>
          ) : (
            <span 
              className="px-2 py-1 rounded-full text-xs font-medium"
              style={{ 
                backgroundColor: 'var(--warning)', 
                color: 'white'
              }}
            >
              Not Ready
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant={platform.ready && !hasActiveJob ? 'primary' : 'secondary'}
            size="compact"
            onClick={() => onCreatePackage(platform.id)}
            disabled={!platform.ready || isCreating || hasActiveJob}
          >
            {hasActiveJob ? 'Packaging...' : isCreating ? 'Creating...' : pkg ? 'Re-create' : 'Create'}
          </Button>
          {pkg && (
            <Button
              variant="secondary"
              size="compact"
              onClick={() => onValidatePackage(pkg.id)}
              disabled={isValidating}
              title="Validate package quality"
            >
              {isValidating ? '⏳' : '🔍'}
            </Button>
          )}
        </div>
      </div>

      {/* Package Info */}
      {pkg && (
        <div 
          className="mb-3 p-3 rounded text-sm"
          style={{ 
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)'
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span style={{ color: 'var(--success)', fontSize: '16px' }}>✓</span>
            <span className="font-medium" style={{ color: 'var(--text)' }}>
              Package created
            </span>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            {(pkg.size_bytes / (1024 * 1024)).toFixed(1)} MB • v{pkg.version_number}
          </div>
          
          {/* Validation Status */}
          {pkg.is_validated && pkg.validation_results && (
            <div 
              className="mt-2 p-2 rounded cursor-pointer"
              style={{ 
                backgroundColor: pkg.validation_results.valid ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                border: `1px solid ${pkg.validation_results.valid ? 'var(--success)' : 'var(--error)'}`
              }}
              onClick={() => setShowValidationDetails(!showValidationDetails)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: '14px' }}>
                    {pkg.validation_results.valid ? '✅' : '❌'}
                  </span>
                  <span className="font-medium text-xs" style={{ color: 'var(--text)' }}>
                    {pkg.validation_results.valid ? 'Validation Passed' : 'Validation Failed'}
                  </span>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                  {showValidationDetails ? '▼' : '▶'}
                </span>
              </div>
              
              {showValidationDetails && pkg.validation_results.issues && pkg.validation_results.issues.length > 0 && (
                <div className="mt-2 space-y-1">
                  {pkg.validation_results.issues.map((issue, idx: number) => (
                    <div 
                      key={idx}
                      className="p-2 rounded text-xs"
                      style={{ 
                        backgroundColor: 'var(--panel)',
                        borderLeft: `3px solid ${
                          issue.severity === 'error' ? 'var(--error)' : 
                          issue.severity === 'warning' ? 'var(--warning)' : 
                          'var(--primary)'
                        }`
                      }}
                    >
                      <div className="font-medium" style={{ color: 'var(--text)' }}>
                        {issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️'} {issue.message}
                      </div>
                      {issue.details && (
                        <div className="mt-1" style={{ color: 'var(--text-muted)' }}>
                          {issue.details}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {showValidationDetails && pkg.validation_results.specs && (() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const specs = pkg.validation_results.specs as any;
                return (
                  <div className="mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <div className="font-medium mb-1">Technical Specs:</div>
                    <div className="grid grid-cols-2 gap-1">
                      {specs.codec && (
                        <div>Codec: {String(specs.codec)}</div>
                      )}
                      {specs.bitrate && (
                        <div>Bitrate: {String(specs.bitrate)}kbps</div>
                      )}
                      {specs.sampleRate && (
                        <div>Sample Rate: {String(specs.sampleRate)}Hz</div>
                      )}
                      {specs.channels && (
                        <div>Channels: {String(specs.channels)}</div>
                      )}
                      {specs.chapterCount && (
                        <div>Chapters: {String(specs.chapterCount)}</div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Requirements */}
      <div className="space-y-2">
        {platform.requirements?.map((req) => (
          <div key={req.id} className="flex items-start text-sm">
            <span style={{ marginRight: '8px', color: req.met ? 'var(--success)' : 'var(--error)' }}>
              {req.met ? '✓' : '✗'}
            </span>
            <span style={{ color: req.met ? 'var(--text-secondary)' : 'var(--error)' }}>
              {req.details || req.id}
            </span>
          </div>
        ))}
      </div>
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
    <div
      className="rounded-lg shadow border p-4"
      style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold" style={{ color: 'var(--text)' }}>
          {platformNames[job.platform_id] || job.platform_id}
        </h3>
        <span className={`px-3 py-1 rounded-full text-white text-sm ${statusColors[job.status]}`}>
          {job.status.replace('_', ' ')}
        </span>
      </div>

      <div className="mb-2">
        <div className="flex items-center justify-between text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
          <span>{job.current_step}</span>
          <span>{job.progress_percent}%</span>
        </div>
        <div className="w-full rounded-full h-2" style={{ backgroundColor: 'var(--border)' }}>
          <div
            className="h-2 rounded-full transition-all"
            style={{ backgroundColor: 'var(--primary)', width: `${job.progress_percent}%` }}
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
  package: PackageResponse;
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
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant="outline"
            size="compact"
            onClick={() => window.open(packagingApi.getDownloadUrl(pkg), '_blank')}
          >
            Download
          </Button>
          {pkg.storage_tier === 'temp' && (
            <Button
              variant="secondary"
              size="compact"
              onClick={onArchive}
              disabled={isArchiving}
            >
              {isArchiving ? 'Archiving...' : 'Archive'}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

