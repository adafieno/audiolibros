import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { projectsApi } from '../lib/projects';
import { useAuth } from '../hooks/useAuthHook';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/projects/')({
  component: ProjectsIndexPage,
});

function ProjectsIndexPage() {
  console.log('ProjectsIndexPage rendering');
  const { user } = useAuth();
  const { t } = useTranslation();
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
            <input
              id="search"
              type="text"
              placeholder={t('projects.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ 
                backgroundColor: 'var(--panel)', 
                borderColor: 'var(--border)', 
                color: 'var(--text)',
                width: '200px'
              }}
              className="px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            
            {/* Status filter */}
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ 
                backgroundColor: 'var(--panel)', 
                borderColor: 'var(--border)', 
                color: 'var(--text)',
                minWidth: '150px'
              }}
              className="px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('projects.allStatuses')}</option>
              <option value="draft">{t('projects.statusDraft')}</option>
              <option value="in_progress">{t('projects.statusInProgress')}</option>
              <option value="review">{t('projects.statusReview')}</option>
              <option value="completed">{t('projects.statusCompleted')}</option>
              <option value="published">{t('projects.statusPublished')}</option>
            </select>
            
            {/* New Project button */}
            <Link
              to="/projects/new"
              style={{ backgroundColor: 'var(--accent)', color: 'white' }}
              className="px-4 py-2 rounded-lg hover:opacity-90 transition-colors"
            >
              {t('projects.newProject')}
            </Link>
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
              <Link
                to="/projects/new"
                style={{ backgroundColor: 'var(--accent)', color: 'white' }}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md hover:opacity-90"
              >
                {t('projects.newProject')}
              </Link>
            </div>
          </div>
        )}

        {data && data.items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.items.map((project) => (
              <Link
                key={project.id}
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }}
                className="rounded-lg shadow border hover:shadow-md transition-shadow p-6"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold line-clamp-2" style={{ color: 'var(--text)' }}>
                    {project.title}
                  </h3>
                  <span
                    className={`ml-2 px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${
                      project.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : project.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-800'
                        : project.status === 'review'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {project.status.replace('_', ' ')}
                  </span>
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
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="mt-8 flex justify-center">
            <div className="flex gap-2">
              {Array.from({ length: data.pages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  className={`px-4 py-2 rounded-md ${
                    page === data.page
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
  );
}
