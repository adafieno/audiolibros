import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { projectsApi } from '../lib/projects';
import { useAuth } from '../hooks/useAuthHook';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/Button';
import { TextInput } from '../components/TextInput';
import { Select } from '../components/Select';
import { StatusPill, type ProjectStatus } from '../components/StatusPill';

export const Route = createFileRoute('/projects/')({
  component: ProjectsIndexPage,
});

function ProjectsIndexPage() {
  console.log('ProjectsIndexPage rendering');
  const { user } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');

  // Do NOT clear project workflow state here so that after opening a project
  // and returning Home, workflow icons remain visible (requested behavior).
  // If we ever need an explicit "Close Project" action, that should invoke clearProjectState().

  const { data, isLoading, error } = useQuery({
    queryKey: ['projects', { search, status }],
    queryFn: () => projectsApi.list({ search: search || undefined, status: status || undefined }),
  });

  return (
    <div className="p-6">
      {/* Header in panel */}
      <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border p-6 mb-6">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)', margin: 0 }}>{t('projects.title')}</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)', margin: 0 }}>
              {t('projects.welcome', { name: user?.full_name || user?.email })}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search input */}
            <TextInput
              id="search"
              type="text"
              placeholder={t('projects.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '280px' }}
            />
            
            {/* Status filter */}
            <Select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ minWidth: '150px' }}
            >
              <option value="">{t('projects.allStatuses')}</option>
              <option value="archived">{t('projects.statusArchived')}</option>
              <option value="completed">{t('projects.statusCompleted')}</option>
              <option value="draft">{t('projects.statusDraft')}</option>
              <option value="in_progress">{t('projects.statusInProgress')}</option>
              <option value="published">{t('projects.statusPublished')}</option>
              <option value="review">{t('projects.statusReview')}</option>
            </Select>
            
            {/* New Project button */}
            <Button
              variant="primary"
              onClick={() => navigate({ to: '/projects/new' })}
            >
              {t('projects.newProject')}
            </Button>
          </div>
        </div>
      </div>

        {/* Projects List */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
            <p className="mt-2" style={{ color: 'var(--text-muted)' }}>{t('projects.loading')}</p>
          </div>
        )}

        {error && (
          <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--error)' }} className="border rounded-lg p-4">
            <p style={{ color: 'var(--error)' }}>{t('projects.loadError')}</p>
          </div>
        )}

        {data && data.items.length === 0 && (
          <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border p-12 text-center">
            <svg
              className="mx-auto h-12 w-12"
              style={{ color: 'var(--text-muted)' }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium" style={{ color: 'var(--text)' }}>{t('projects.noProjects')}</h3>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{t('projects.noProjectsDesc')}</p>
            <div className="mt-6">
              <Button
                variant="primary"
                onClick={() => navigate({ to: '/projects/new' })}
              >
                {t('projects.newProject')}
              </Button>
            </div>
          </div>
        )}

        {data && data.items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.items.map((project) => {
              // Get cover image from settings.book or top-level field
              const bookSettings = (project.settings as any)?.book;
              const coverImageUrl = bookSettings?.cover_image_b64 
                ? `data:image/jpeg;base64,${bookSettings.cover_image_b64}`
                : (bookSettings?.cover_image_url || project.cover_image_url);

              return (
              <Link
                key={project.id}
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }}
                className="rounded-lg shadow border hover:shadow-md transition-shadow p-6"
              >
                <div className="flex gap-4 mb-3">
                  {/* Cover thumbnail */}
                  <div 
                    className="flex-shrink-0 rounded overflow-hidden"
                    style={{ 
                      width: '80px', 
                      height: '80px',
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)'
                    }}
                  >
                    {coverImageUrl ? (
                      <img 
                        src={coverImageUrl} 
                        alt={project.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl">
                        📚
                      </div>
                    )}
                  </div>

                  {/* Title and status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="text-lg font-semibold line-clamp-2" style={{ color: 'var(--text)' }}>
                        {project.title}
                      </h3>
                    </div>
                    <StatusPill 
                      type="project-status" 
                      status={project.status as ProjectStatus}
                    >
                      {project.status.replace('_', ' ')}
                    </StatusPill>
                  </div>
                </div>

                {project.subtitle && (
                  <p className="text-sm mb-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{project.subtitle}</p>
                )}

                {project.authors && project.authors.length > 0 && (
                  <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
                    <span className="font-medium">{t('projects.author')}</span> {project.authors.join(', ')}
                  </p>
                )}

                {project.narrators && project.narrators.length > 0 && (
                  <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                    <span className="font-medium">{t('projects.narrator')}</span> {project.narrators.join(', ')}
                  </p>
                )}

                <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(project.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{project.language}</span>
                </div>
              </Link>
            );
            })}
          </div>
        )}

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="mt-8 flex justify-center">
            <div className="flex gap-2">
              {Array.from({ length: data.pages }, (_, i) => i + 1).map((page) => (
                <Button
                  key={page}
                  variant={page === data.page ? 'primary' : 'secondary'}
                >
                  {page}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
  );
}
