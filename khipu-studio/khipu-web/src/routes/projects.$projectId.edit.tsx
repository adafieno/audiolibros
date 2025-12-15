import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../lib/projects';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from '../components/TextInput';
import { Select } from '../components/Select';
import { Button } from '../components/Button';

export const Route = createFileRoute('/projects/$projectId/edit')({
  component: ProjectEditPage,
});

function ProjectEditPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  });

  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    authors: '',
    narrators: '',
    language: 'en-US',
    description: '',
    status: 'draft' as 'draft' | 'in_progress' | 'review' | 'completed' | 'published' | 'archived',
  });

  const [formInitialized, setFormInitialized] = useState(false);

  // Initialize form when project loads
  if (project && !formInitialized) {
    console.log('[EDIT FORM] Initializing form from project');
    console.log('[EDIT FORM] project.narrators:', project.narrators);
    const initialData = {
      title: project.title || '',
      subtitle: project.subtitle || '',
      authors: project.authors?.join(', ') || '',
      narrators: project.narrators?.join(', ') || '',
      language: project.language || 'en-US',
      description: project.description || '',
      status: project.status || 'draft',
    };
    console.log('[EDIT FORM] Initial narrators value:', initialData.narrators);
    setFormData(initialData);
    setFormInitialized(true);
  }

  const updateMutation = useMutation({
    mutationFn: (data: {
      title: string;
      subtitle?: string;
      authors?: string[];
      narrators?: string[];
      language: string;
      description?: string;
      status: 'draft' | 'in_progress' | 'review' | 'completed' | 'published' | 'archived';
    }) => projectsApi.update(projectId, data),
    onSuccess: (data) => {
      console.log('[EDIT FORM] Save successful, response:', data);
      console.log('[EDIT FORM] Response narrators:', data.narrators);
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate({ to: `/projects/${projectId}` });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: formData.title,
      subtitle: formData.subtitle || undefined,
      authors: formData.authors
        ? formData.authors.split(',').map((a) => a.trim()).filter(Boolean)
        : undefined,
      narrators: formData.narrators
        ? formData.narrators.split(',').map((n) => n.trim()).filter(Boolean)
        : undefined,
      language: formData.language,
      description: formData.description || undefined,
      status: formData.status,
    };
    console.log('[EDIT FORM] Submitting update with payload:', payload);
    console.log('[EDIT FORM] Narrators field:', formData.narrators, '→', payload.narrators);
    updateMutation.mutate(payload);
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
    <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate({ to: `/projects/${projectId}` })}
            style={{ color: 'var(--text-muted)' }}
            className="hover:opacity-80 flex items-center gap-2"
          >
            ← {t('projectForm.backToProject')}
          </button>
        </div>

        <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border p-6">
          <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text)' }}>{t('projectForm.editTitle')}</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="title" className="block text-sm font-medium" style={{ color: 'var(--text)' }}>
                {t('projectForm.title')} <span style={{ color: 'var(--error)' }}>*</span>
              </label>
              <TextInput
                type="text"
                id="title"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                style={{ width: '100%', marginTop: '0.25rem' }}
                placeholder={t('projectForm.titlePlaceholder')}
              />
            </div>

            <div>
              <label htmlFor="subtitle" className="block text-sm font-medium" style={{ color: 'var(--text)' }}>
                {t('projectForm.subtitle')}
              </label>
              <TextInput
                type="text"
                id="subtitle"
                value={formData.subtitle}
                onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                style={{ width: '100%', marginTop: '0.25rem' }}
                placeholder={t('projectForm.subtitlePlaceholder')}
              />
            </div>

            <div>
              <label htmlFor="authors" className="block text-sm font-medium" style={{ color: 'var(--text)' }}>
                {t('projectForm.authors')}
              </label>
              <TextInput
                type="text"
                id="authors"
                value={formData.authors}
                onChange={(e) => setFormData({ ...formData, authors: e.target.value })}
                placeholder={t('projectForm.authorsPlaceholder')}
                style={{ width: '100%', marginTop: '0.25rem' }}
              />
            </div>

            <div>
              <label htmlFor="narrators" className="block text-sm font-medium" style={{ color: 'var(--text)' }}>
                {t('projectForm.narrators')}
              </label>
              <TextInput
                type="text"
                id="narrators"
                value={formData.narrators}
                onChange={(e) => setFormData({ ...formData, narrators: e.target.value })}
                placeholder={t('projectForm.narratorsPlaceholder')}
                style={{ width: '100%', marginTop: '0.25rem' }}
              />
            </div>

            <div>
              <label htmlFor="language" className="block text-sm font-medium" style={{ color: 'var(--text)' }}>
                {t('projectForm.language')}
              </label>
              <Select
                id="language"
                value={formData.language}
                onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                style={{ width: '100%', marginTop: '0.25rem' }}
              >
                <option value="en-US">{t('languages.en-US')}</option>
                <option value="en-GB">{t('languages.en-GB')}</option>
                <option value="es-ES">{t('languages.es-ES')}</option>
                <option value="es-MX">{t('languages.es-MX')}</option>
                <option value="es-PE">{t('languages.es-PE')}</option>
                <option value="fr-FR">{t('languages.fr-FR')}</option>
                <option value="de-DE">{t('languages.de-DE')}</option>
                <option value="it-IT">{t('languages.it-IT')}</option>
                <option value="pt-BR">{t('languages.pt-BR')}</option>
              </Select>
            </div>

            <div>
              <label htmlFor="status" className="block text-sm font-medium" style={{ color: 'var(--text)' }}>
                {t('projects.status')}
              </label>
              <Select
                id="status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as 'draft' | 'in_progress' | 'review' | 'completed' | 'published' | 'archived' })}
                style={{ width: '100%', marginTop: '0.25rem' }}
                disabled={!!project.archived_at}
              >
                {/* Draft can only be shown, not selected */}
                {project.status === 'draft' && <option value="draft">{t('projects.statusDraft')}</option>}
                
                {/* In Progress: always available, or auto-set when user edits */}
                <option value="in_progress">{t('projects.statusInProgress')}</option>
                
                {/* Review: Pending implementation */}
                <option value="review" disabled>{t('projects.statusReview')} (Coming Soon)</option>
                
                {/* Completed: only if all workflow steps are done */}
                {(() => {
                  const workflow = project.workflow_completed || {};
                  const allStepsComplete = ['project', 'manuscript', 'casting', 'characters', 'planning', 'voice', 'export']
                    .every(step => workflow[step] === true);
                  return allStepsComplete ? (
                    <option value="completed">{t('projects.statusCompleted')}</option>
                  ) : null;
                })()}
                
                {/* Published: only if status is completed */}
                {(project.status === 'completed' || project.status === 'published') && (
                  <option value="published">{t('projects.statusPublished')}</option>
                )}
                
                {/* Archived: always available */}
                <option value="archived">{t('projects.statusArchived', 'Archived')}</option>
              </Select>
              {project.archived_at && (
                <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                  {t('projects.archivedReadOnly', 'This project is archived and read-only. Contact an admin to restore it.')}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium" style={{ color: 'var(--text)' }}>
                {t('projectForm.description')}
              </label>
              <textarea
                id="description"
                rows={4}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                className="mt-1 block w-full rounded-md border shadow-sm focus:outline-none focus:ring-2"
                placeholder={t('projectForm.descriptionPlaceholder')}
              />
            </div>

            {updateMutation.isError && (
              <div className="rounded-lg p-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--error)', border: '1px solid' }}>
                <p style={{ color: 'var(--error)' }}>
                  {(updateMutation.error as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail ||
                    (updateMutation.error as { message?: string })?.message ||
                    t('projectForm.updateError')}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => navigate({ to: `/projects/${projectId}` })}
              >
                {t('projectForm.cancel')}
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? t('projectForm.saving') : t('projectForm.saveChanges')}
              </Button>
            </div>
          </form>
        </div>
      </div>
  );
}
