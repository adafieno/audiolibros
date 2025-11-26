import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { projectsApi } from '../lib/projects';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/projects/new')({
  component: NewProjectPage,
});

function NewProjectPage() {
  console.log('NewProjectPage rendering');
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState(i18n.language);
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (project) => {
      // Redirect to project properties page after creation
      navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(error.response?.data?.detail || error.message || t('projectForm.createError'));
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    createMutation.mutate({
      title: name,
      language,
    });
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate({ to: '/projects' })}
            style={{ color: 'var(--text-muted)' }}
            className="hover:opacity-80 flex items-center gap-2"
          >
            ← {t('projects.backToProjects')}
          </button>
        </div>

        <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border p-6">
          <h1 className="text-2xl font-bold mb-4" style={{ color: 'var(--text)' }}>{t('projectForm.createTitle')}</h1>
          <p className="mb-6" style={{ color: 'var(--text-muted)' }}>
            {t('projectForm.createDescription', 'Create a new audiobook project. You will configure book details and settings in the next steps.')}
          </p>

          {error && (
            <div className="mb-4 rounded-lg p-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--error)', border: '1px solid' }}>
              <p style={{ color: 'var(--error)' }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                {t('projectForm.projectName', 'Project Name')} <span style={{ color: 'var(--error)' }}>*</span>
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                placeholder={t('projectForm.projectNamePlaceholder', 'Enter a name for this project')}
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('projectForm.projectNameHelp', 'This is the internal name for your project.')}
              </p>
            </div>

            <div>
              <label htmlFor="language" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                {t('projectForm.language')} <span style={{ color: 'var(--error)' }}>*</span>
              </label>
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
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
              </select>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('projectForm.languageHelp', 'Default language for TTS and project settings.')}
              </p>
            </div>

            <div className="flex justify-end gap-4 pt-4">
              <button
                type="button"
                onClick={() => navigate({ to: '/projects' })}
                style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
                className="px-4 py-2 border rounded-md hover:opacity-80"
              >
                {t('projectForm.cancel')}
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                style={{ backgroundColor: 'var(--accent)', color: 'white' }}
                className="px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createMutation.isPending ? t('projectForm.creating') : t('projectForm.create')}
              </button>
            </div>
          </form>
        </div>
      </div>
  );
}
