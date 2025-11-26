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
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [narrators, setNarrators] = useState('');
  const [language, setLanguage] = useState(i18n.language);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const createMutation = useMutation({
    mutationFn: projectsApi.create,
    onSuccess: (project) => {
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
      title,
      subtitle: subtitle || undefined,
      authors: authors ? authors.split(',').map((a) => a.trim()) : undefined,
      narrators: narrators ? narrators.split(',').map((n) => n.trim()) : undefined,
      language,
      description: description || undefined,
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
          <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text)' }}>{t('projectForm.createTitle')}</h1>

          {error && (
            <div className="mb-4 rounded-lg p-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--error)', border: '1px solid' }}>
              <p style={{ color: 'var(--error)' }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="title" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                {t('projectForm.title')} <span style={{ color: 'var(--error)' }}>*</span>
              </label>
              <input
                id="title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                placeholder={t('projectForm.titlePlaceholder')}
              />
            </div>

            <div>
              <label htmlFor="subtitle" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                {t('projectForm.subtitle')}
              </label>
              <input
                id="subtitle"
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                placeholder={t('projectForm.subtitlePlaceholder')}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="authors" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('projectForm.authors')}
                </label>
                <input
                  id="authors"
                  type="text"
                  value={authors}
                  onChange={(e) => setAuthors(e.target.value)}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                  placeholder={t('projectForm.authorsPlaceholder')}
                />
              </div>

              <div>
                <label htmlFor="narrators" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('projectForm.narrators')}
                </label>
                <input
                  id="narrators"
                  type="text"
                  value={narrators}
                  onChange={(e) => setNarrators(e.target.value)}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                  placeholder={t('projectForm.narratorsPlaceholder')}
                />
              </div>
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
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                {t('projectForm.description')}
              </label>
              <textarea
                id="description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                placeholder={t('projectForm.descriptionPlaceholder')}
              />
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
