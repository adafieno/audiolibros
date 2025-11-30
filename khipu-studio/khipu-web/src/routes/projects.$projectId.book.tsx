import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, type ProjectUpdate } from '../lib/projects';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/projects/$projectId/book')({
  component: BookDetailsPage,
});

function BookDetailsPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  });

  // Local state for book metadata
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [narrators, setNarrators] = useState('');
  const [translators, setTranslators] = useState('');
  const [adaptors, setAdaptors] = useState('');
  const [description, setDescription] = useState('');
  const [publisher, setPublisher] = useState('');
  const [isbn, setIsbn] = useState('');
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  // Load data from project when available
  useEffect(() => {
    if (project) {
      setTitle(project.title || '');
      setSubtitle(project.subtitle || '');
      setAuthors(project.authors?.join(', ') || '');
      setNarrators(project.narrators?.join(', ') || '');
      setTranslators(project.translators?.join(', ') || '');
      setAdaptors(project.adaptors?.join(', ') || '');
      setDescription(project.description || '');
      setPublisher(project.publisher || '');
      setIsbn(project.isbn || '');
    }
  }, [project]);

  const updateMutation = useMutation({
    mutationFn: (data: ProjectUpdate) => projectsApi.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setSaveMessage(t('book.saved', 'Book details saved successfully'));
      setTimeout(() => setSaveMessage(''), 3000);
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(error.response?.data?.detail || error.message || t('book.saveError', 'Failed to save book details'));
    },
  });

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    setError('');

    updateMutation.mutate({
      title,
      subtitle: subtitle || undefined,
      authors: authors ? authors.split(',').map((a) => a.trim()) : undefined,
      narrators: narrators ? narrators.split(',').map((n) => n.trim()) : undefined,
      translators: translators ? translators.split(',').map((t) => t.trim()) : undefined,
      adaptors: adaptors ? adaptors.split(',').map((a) => a.trim()) : undefined,
      description: description || undefined,
      publisher: publisher || undefined,
      isbn: isbn || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
          <p className="mt-2" style={{ color: 'var(--text-muted)' }}>{t('book.loading', 'Loading...')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6 flex justify-between items-center">
        <button
          onClick={() => navigate({ to: '/projects/$projectId', params: { projectId } })}
          style={{ color: 'var(--text-muted)' }}
          className="hover:opacity-80 flex items-center gap-2"
        >
          ← {t('book.back', 'Back to Project')}
        </button>
        <button
          onClick={() => navigate({ to: '/projects/$projectId/properties', params: { projectId } })}
          style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          className="px-4 py-2 border rounded-md hover:opacity-80"
        >
          ← {t('book.goToProperties', 'Project Properties')}
        </button>
      </div>

      <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border p-6">
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)' }}>
          {t('book.title', 'Book Details')}
        </h1>
        <p className="mb-6" style={{ color: 'var(--text-muted)' }}>
          {t('book.description', 'Enter the book metadata and publishing information that will appear in the audiobook.')}
        </p>

        {error && (
          <div className="mb-4 rounded-lg p-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--error)', border: '1px solid' }}>
            <p style={{ color: 'var(--error)' }}>{error}</p>
          </div>
        )}

        {saveMessage && (
          <div className="mb-4 rounded-lg p-4" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'var(--success)', border: '1px solid' }}>
            <p style={{ color: 'var(--success)' }}>{saveMessage}</p>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Basic Information */}
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>
              {t('book.basicInfo', 'Basic Information')}
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="title" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('book.title.label', 'Book Title')} <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <input
                  id="title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('book.title.placeholder', 'Enter the book title')}
                />
              </div>

              <div>
                <label htmlFor="subtitle" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('book.subtitle.label', 'Subtitle')}
                </label>
                <input
                  id="subtitle"
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('book.subtitle.placeholder', 'Enter the book subtitle')}
                />
              </div>
            </div>
          </section>

          {/* Contributors */}
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>
              {t('book.contributors', 'Contributors')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="authors" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('book.authors.label', 'Authors')}
                </label>
                <input
                  id="authors"
                  type="text"
                  value={authors}
                  onChange={(e) => setAuthors(e.target.value)}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('book.authors.placeholder', 'Comma-separated list')}
                />
              </div>

              <div>
                <label htmlFor="narrators" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('book.narrators.label', 'Narrators')}
                </label>
                <input
                  id="narrators"
                  type="text"
                  value={narrators}
                  onChange={(e) => setNarrators(e.target.value)}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('book.narrators.placeholder', 'Comma-separated list')}
                />
              </div>

              <div>
                <label htmlFor="translators" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('book.translators.label', 'Translators')}
                </label>
                <input
                  id="translators"
                  type="text"
                  value={translators}
                  onChange={(e) => setTranslators(e.target.value)}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('book.translators.placeholder', 'Comma-separated list')}
                />
              </div>

              <div>
                <label htmlFor="adaptors" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('book.adaptors.label', 'Adaptors')}
                </label>
                <input
                  id="adaptors"
                  type="text"
                  value={adaptors}
                  onChange={(e) => setAdaptors(e.target.value)}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('book.adaptors.placeholder', 'Comma-separated list')}
                />
              </div>
            </div>
          </section>

          {/* Description */}
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>
              {t('book.content', 'Content Information')}
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="description" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('book.description.label', 'Description')}
                </label>
                <textarea
                  id="description"
                  rows={8}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('book.description.placeholder', 'Enter a description of the book')}
                />
              </div>
            </div>
          </section>

          {/* Publishing Information */}
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>
              {t('book.publishing', 'Publishing Information')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="publisher" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('book.publisher.label', 'Publisher')}
                </label>
                <input
                  id="publisher"
                  type="text"
                  value={publisher}
                  onChange={(e) => setPublisher(e.target.value)}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('book.publisher.placeholder', 'Publisher name')}
                />
              </div>

              <div>
                <label htmlFor="isbn" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('book.isbn.label', 'ISBN')}
                </label>
                <input
                  id="isbn"
                  type="text"
                  value={isbn}
                  onChange={(e) => setIsbn(e.target.value)}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('book.isbn.placeholder', 'ISBN number')}
                />
              </div>
            </div>
          </section>

          {/* Actions */}
          <div className="flex justify-between pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button"
              onClick={() => navigate({ to: '/projects/$projectId', params: { projectId } })}
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
              className="px-4 py-2 border rounded-md hover:opacity-80"
            >
              {t('book.cancel', 'Cancel')}
            </button>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                style={{ backgroundColor: 'var(--accent)', color: 'white' }}
                className="px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-50"
              >
                {updateMutation.isPending 
                  ? t('book.saving', 'Saving...') 
                  : t('book.save', 'Save Book Details')}
              </button>
              <button
                type="button"
                onClick={() => navigate({ to: '/projects/$projectId/manuscript' as any, params: { projectId } })}
                style={{ backgroundColor: 'var(--success)', color: 'white' }}
                className="px-4 py-2 rounded-md hover:opacity-90"
              >
                {t('book.nextStep', 'Next: Manuscript')} →
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
