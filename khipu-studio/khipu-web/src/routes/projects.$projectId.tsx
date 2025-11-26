import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../lib/projects';

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
    if (window.confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      deleteMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load project</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
          <button
            onClick={() => navigate({ to: '/projects' })}
            className="text-gray-600 hover:text-gray-900 flex items-center gap-2"
          >
            ← Back to Projects
          </button>
        </div>

        <div className="bg-white rounded-lg shadow">
          {/* Header */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{project.title}</h1>
                {project.subtitle && (
                  <p className="mt-2 text-lg text-gray-600">{project.subtitle}</p>
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
                <h2 className="text-sm font-medium text-gray-700 mb-2">Description</h2>
                <p className="text-gray-900">{project.description}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              {project.authors && project.authors.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium text-gray-700 mb-2">Authors</h2>
                  <p className="text-gray-900">{project.authors.join(', ')}</p>
                </div>
              )}

              {project.narrators && project.narrators.length > 0 && (
                <div>
                  <h2 className="text-sm font-medium text-gray-700 mb-2">Narrators</h2>
                  <p className="text-gray-900">{project.narrators.join(', ')}</p>
                </div>
              )}

              <div>
                <h2 className="text-sm font-medium text-gray-700 mb-2">Language</h2>
                <p className="text-gray-900">{project.language}</p>
              </div>

              <div>
                <h2 className="text-sm font-medium text-gray-700 mb-2">Created</h2>
                <p className="text-gray-900">{new Date(project.created_at).toLocaleDateString()}</p>
              </div>
            </div>

            {project.workflow_completed && Object.keys(project.workflow_completed).length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-gray-700 mb-3">Workflow Progress</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(project.workflow_completed).map(([step, completed]) => (
                    <div
                      key={step}
                      className={`p-3 rounded-lg border ${
                        completed
                          ? 'bg-green-50 border-green-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {completed ? (
                          <svg
                            className="w-5 h-5 text-green-600"
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
                            className="w-5 h-5 text-gray-400"
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
                        <span className="text-sm font-medium text-gray-900">
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
          <div className="p-6 border-t border-gray-200 flex justify-between">
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Project'}
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => navigate({ to: '/projects' })}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => navigate({ to: `/projects/${projectId}/edit` })}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Edit Project
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}
