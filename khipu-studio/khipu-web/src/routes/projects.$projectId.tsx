import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../lib/projects';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  });

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate({ to: '/projects' });
    },
  });

  const handleDelete = () => {
    if (window.confirm(t('projectDetail.deleteConfirm'))) {
      deleteMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
          <p className="mt-2" style={{ color: 'var(--text-muted)' }}>{t('projectDetail.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--error)' }} className="border rounded-lg p-4">
          <p style={{ color: 'var(--error)' }}>{t('projectDetail.loadError')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
          <button
            onClick={() => navigate({ to: '/projects' })}
            style={{ color: 'var(--text-muted)' }}
            className="hover:opacity-80 flex items-center gap-2"
          >
            ← {t('projects.backToProjects')}
          </button>
        </div>

        <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border">
          {/* Header */}
          <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>{project.title}</h1>
                {project.subtitle && (
                  <p className="mt-2 text-lg" style={{ color: 'var(--text-muted)' }}>{project.subtitle}</p>
                )}
              </div>
              <span
                className={`px-3 py-1 text-sm font-medium rounded-full ${
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
          </div>

          {/* Details */}
          <div className="p-6 space-y-6">
            {project.description && (
              <div>
                <h2 className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>{t('projectDetail.description')}</h2>
                <p style={{ color: 'var(--text-muted)' }}>{project.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              {project.authors && project.authors.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>{t('projectDetail.authors')}</h2>
                  <p style={{ color: 'var(--text-muted)' }}>{project.authors.join(', ')}</p>
                </div>
              )}

              {project.narrators && project.narrators.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>{t('projectDetail.narrators')}</h2>
                  <p style={{ color: 'var(--text-muted)' }}>{project.narrators.join(', ')}</p>
                </div>
              )}

              <div>
                <h2 className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>{t('projectDetail.language')}</h2>
                <p style={{ color: 'var(--text-muted)' }}>{project.language}</p>
              </div>

              <div>
                <h2 className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>{t('projectDetail.created')}</h2>
                <p style={{ color: 'var(--text-muted)' }}>{new Date(project.created_at).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Workflow Links */}
            <div>
              <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text)' }}>Workflow</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <button
                  onClick={() => navigate({ to: '/projects/$projectId/properties', params: { projectId } })}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '1rem',
                    backgroundColor: 'var(--panel-accent)',
                    border: '1px solid var(--border)',
                    borderRadius: '0.5rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  className="hover:opacity-80"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium" style={{ color: 'var(--text)' }}>
                        {t('projectProperties.title', 'Project Properties')}
                      </h3>
                      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                        {t('projectProperties.cardDescription', 'Configure TTS, LLM, and technical settings')}
                      </p>
                    </div>
                    <svg
                      className="w-5 h-5"
                      style={{ color: 'var(--text-muted)' }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>

                <button
                  onClick={() => navigate({ to: '/projects/$projectId/book' as any, params: { projectId } })}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '1rem',
                    backgroundColor: 'var(--panel-accent)',
                    border: '1px solid var(--border)',
                    borderRadius: '0.5rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  className="hover:opacity-80"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium" style={{ color: 'var(--text)' }}>
                        {t('book.title', 'Book Details')}
                      </h3>
                      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                        {t('book.cardDescription', 'Enter book metadata and publishing information')}
                      </p>
                    </div>
                    <svg
                      className="w-5 h-5"
                      style={{ color: 'var(--text-muted)' }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>

                <button
                  onClick={() => navigate({ to: `/projects/${projectId}/manuscript` as any })}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '1rem',
                    backgroundColor: 'var(--panel-accent)',
                    border: '1px solid var(--border)',
                    borderRadius: '0.5rem',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  className="hover:opacity-80"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium" style={{ color: 'var(--text)' }}>
                        {t('manuscript.title')}
                      </h3>
                      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                        {t('manuscript.description')}
                      </p>
                    </div>
                    <svg
                      className="w-5 h-5"
                      style={{ color: 'var(--text-muted)' }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>

            {project.workflow_completed && Object.keys(project.workflow_completed).length > 0 && (
              <div>
                <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--text)' }}>{t('projectDetail.workflowProgress')}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(project.workflow_completed).map(([step, completed]) => (
                    <div
                      key={step}
                      style={{
                        backgroundColor: completed ? 'rgba(16, 185, 129, 0.1)' : 'var(--panel-accent)',
                        borderColor: completed ? 'var(--success)' : 'var(--border)'
                      }}
                      className="p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-2">
                        {completed ? (
                          <svg
                            className="w-5 h-5"
                            style={{ color: 'var(--success)' }}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-5 h-5"
                            style={{ color: 'var(--text-muted)' }}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        )}
                        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                          {step.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-6 border-t flex justify-between" style={{ borderColor: 'var(--border)' }}>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              style={{ borderColor: 'var(--error)', color: 'var(--error)' }}
              className="px-4 py-2 border rounded-md hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleteMutation.isPending ? t('projectDetail.deleting') : t('projectDetail.deleteProject')}
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => navigate({ to: '/projects' })}
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                className="px-4 py-2 border rounded-md hover:opacity-80"
              >
                {t('projectDetail.close')}
              </button>
              <button
                onClick={() => navigate({ to: `/projects/${projectId}/edit` })}
                style={{ backgroundColor: 'var(--accent)', color: 'white' }}
                className="px-4 py-2 rounded-md hover:opacity-90"
              >
                {t('projectDetail.edit')}
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}
