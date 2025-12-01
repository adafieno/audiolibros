import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, type ProjectUpdate } from '../lib/projects';
import { useTranslation } from 'react-i18next';
import { setStepCompleted } from '../store/project';

export const Route = createFileRoute('/projects/$projectId/book')({
  component: BookDetailsPage,
});

type ProjectExtra = {
  language?: string;
  keywords?: string[];
  categories?: string[];
  series_name?: string;
  series_number?: number;
  digital_voice_disclosure?: string;
};

function BookDetailsPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  });

  // Local state for book metadata (single object to avoid multiple setState in effects)
  type FormState = {
    title: string;
    subtitle: string;
    authors: string;
    narrators: string;
    translators: string;
    adaptors: string;
    description: string;
    publisher: string;
    isbn: string;
    language: string;
    keywords: string;
    categories: string;
    seriesName: string;
    seriesNumber: string;
    digitalVoiceDisclosureChecked: boolean;
  };
  const [form, setForm] = useState<FormState>({
    title: '',
    subtitle: '',
    authors: '',
    narrators: '',
    translators: '',
    adaptors: '',
    description: '',
    publisher: '',
    isbn: '',
    language: '',
    keywords: '',
    categories: '',
    seriesName: '',
    seriesNumber: '',
    digitalVoiceDisclosureChecked: false,
  });
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  // Load data from project when available
  useEffect(() => {
    if (project) {
      const p = project as Partial<ProjectExtra> & {
        title?: string; subtitle?: string; authors?: string[]; narrators?: string[]; translators?: string[]; adaptors?: string[];
        description?: string; publisher?: string; isbn?: string;
      };
      setForm({
        title: p.title || '',
        subtitle: p.subtitle || '',
        authors: p.authors?.join(', ') || '',
        narrators: p.narrators?.join(', ') || '',
        translators: p.translators?.join(', ') || '',
        adaptors: p.adaptors?.join(', ') || '',
        description: p.description || '',
        publisher: p.publisher || '',
        isbn: p.isbn || '',
        language: p.language || '',
        keywords: p.keywords?.join(', ') || '',
        categories: p.categories?.join(', ') || '',
        seriesName: p.series_name || '',
        seriesNumber: String(p.series_number ?? '') || '',
        digitalVoiceDisclosureChecked: !!p.digital_voice_disclosure,
      });
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

    const payload: ProjectUpdate = {
      title: form.title,
      subtitle: form.subtitle || undefined,
      authors: form.authors ? form.authors.split(',').map((a) => a.trim()) : undefined,
      narrators: form.narrators ? form.narrators.split(',').map((n) => n.trim()) : undefined,
      translators: form.translators ? form.translators.split(',').map((t) => t.trim()) : undefined,
      adaptors: form.adaptors ? form.adaptors.split(',').map((a) => a.trim()) : undefined,
      description: form.description || undefined,
      publisher: form.publisher || undefined,
      isbn: form.isbn || undefined,
    };
    const extras: ProjectExtra = {
      language: form.language || undefined,
      keywords: form.keywords ? form.keywords.split(',').map(k => k.trim()).filter(Boolean) : undefined,
      categories: form.categories ? form.categories.split(',').map(c => c.trim()).filter(Boolean) : undefined,
      series_name: form.seriesName || undefined,
      series_number: form.seriesNumber ? Number(form.seriesNumber) : undefined,
      digital_voice_disclosure: form.digitalVoiceDisclosureChecked ? t('book.digitalVoiceDisclosure.defaultText') : undefined,
    };
    const merged = { ...payload, ...extras } as unknown as ProjectUpdate;
    updateMutation.mutate(merged);

    // Evaluate book completion after save trigger (optimistic check); final confirmation after project refetch
    const hasTitle = form.title.trim().length > 0;
    const authorList = form.authors.split(',').map(a => a.trim()).filter(Boolean);
    const hasAuthor = authorList.length > 0;
    const hasDescription = form.description.trim().length > 0;
    // Digital voice disclosure placeholder: treat as required once field exists; currently assume true
    const hasLanguage = form.language.trim().length > 0;
    const hasDigitalDisclosure = form.digitalVoiceDisclosureChecked;
    const bookComplete = hasTitle && hasAuthor && hasDescription && hasDigitalDisclosure && hasLanguage;
    setStepCompleted('book', bookComplete);
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
        <p className="mt-2" style={{ color: 'var(--text-muted)' }}>{t('book.loading', 'Loading...')}</p>
      </div>
    );
  }

  // Build language options dynamically from translation keys
  let languageOptions: { code: string; label: string }[] = [];
  try {
    const bundle = i18n.getResourceBundle(i18n.language, 'common') as Record<string, unknown>;
    const keys = Object.keys(bundle).filter(k => k.startsWith('languages.'));
    languageOptions = keys.map(k => ({ code: k.replace('languages.', ''), label: t(k) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch {
    // fallback to previous hard-coded minimal set if bundle unavailable
    languageOptions = [
      'en-US','en-GB','es-ES','es-MX','es-PE','pt-BR','fr-FR','de-DE','it-IT'
    ].map(code => ({ code, label: t(`languages.${code}`) }));
  }

  return (
    <div>
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
                  value={form.title}
                  onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
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
                  value={form.subtitle}
                  onChange={(e) => setForm(prev => ({ ...prev, subtitle: e.target.value }))}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('book.subtitle.placeholder', 'Enter the book subtitle')}
                />
              </div>
              <div>
                <label htmlFor="language" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('book.language.label', 'Book Language / Locale')} <span style={{ color: 'var(--error)' }}>*</span>
                </label>
                <select
                  id="language"
                  value={form.language}
                  onChange={(e) => setForm(prev => ({ ...prev, language: e.target.value }))}
                  required
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">{t('book.language.placeholder', 'Select book language')}</option>
                  {languageOptions.map(opt => (
                    <option key={opt.code} value={opt.code}>{opt.label}</option>
                  ))}
                </select>
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
                  value={form.authors}
                  onChange={(e) => setForm(prev => ({ ...prev, authors: e.target.value }))}
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
                  value={form.narrators}
                  onChange={(e) => setForm(prev => ({ ...prev, narrators: e.target.value }))}
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
                  value={form.translators}
                  onChange={(e) => setForm(prev => ({ ...prev, translators: e.target.value }))}
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
                  value={form.adaptors}
                  onChange={(e) => setForm(prev => ({ ...prev, adaptors: e.target.value }))}
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
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('book.description.placeholder', 'Enter a description of the book')}
                />
              </div>
              <div>
                <label htmlFor="keywords" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('book.keywords.label', 'Keywords')}
                </label>
                <input
                  id="keywords"
                  type="text"
                  value={form.keywords}
                  onChange={(e) => setForm(prev => ({ ...prev, keywords: e.target.value }))}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('book.keywords.placeholder', 'Comma-separated keywords')}
                />
              </div>
              <div>
                <label htmlFor="categories" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('book.categories.label', 'Categories')}
                </label>
                <input
                  id="categories"
                  type="text"
                  value={form.categories}
                  onChange={(e) => setForm(prev => ({ ...prev, categories: e.target.value }))}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('book.categories.placeholder', 'Comma-separated categories')}
                />
              </div>
            </div>
          </section>

          {/* Series Information */}
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>
              {t('book.series', 'Series Information')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="seriesName" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('book.seriesName.label', 'Series Name')}
                </label>
                <input
                  id="seriesName"
                  type="text"
                  value={form.seriesName}
                  onChange={(e) => setForm(prev => ({ ...prev, seriesName: e.target.value }))}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('book.seriesName.placeholder', 'Enter series name')}
                />
              </div>
              <div>
                <label htmlFor="seriesNumber" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('book.seriesNumber.label', 'Series Number')}
                </label>
                <input
                  id="seriesNumber"
                  type="number"
                  min={1}
                  value={form.seriesNumber}
                  onChange={(e) => setForm(prev => ({ ...prev, seriesNumber: e.target.value }))}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('book.seriesNumber.placeholder', 'Enter number in series')}
                />
              </div>
            </div>
          </section>

          {/* Digital Voice Disclosure (Checkbox) */}
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>
              {t('book.digitalVoiceDisclosure.label', 'Digital Voice Disclosure')} <span style={{ color: 'var(--error)' }}>*</span>
            </h2>
            <div className="flex items-center gap-2">
              <input
                id="digitalVoiceDisclosure"
                type="checkbox"
                checked={form.digitalVoiceDisclosureChecked}
                onChange={(e) => setForm(prev => ({ ...prev, digitalVoiceDisclosureChecked: e.target.checked }))}
                className="h-4 w-4"
                style={{ accentColor: 'var(--accent)' }}
                required
              />
              <label htmlFor="digitalVoiceDisclosure" className="text-sm" style={{ color: 'var(--text)' }}>
                {t('book.digitalVoiceDisclosure.checkboxLabel', 'Contains digital voices/AI')}
              </label>
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
                  value={form.publisher}
                  onChange={(e) => setForm(prev => ({ ...prev, publisher: e.target.value }))}
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
                  value={form.isbn}
                  onChange={(e) => setForm(prev => ({ ...prev, isbn: e.target.value }))}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('book.isbn.placeholder', 'ISBN number')}
                />
              </div>
            </div>
          </section>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
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
          </div>
        </form>
      </div>
    </div>
  );
}
