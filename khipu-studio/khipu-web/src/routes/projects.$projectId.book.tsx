import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi, type ProjectUpdate } from '../lib/projects';
import { useTranslation } from 'react-i18next';
import { setStepCompleted } from '../store/project';
import { ImageSelectorWeb } from '../components/ImageSelectorWeb';
import { SUPPORTED_LOCALES, getLocaleDisplayName } from '../data/languages';

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
  cover_image?: string;
};

function BookDetailsPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

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
    coverImage: string;
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
    coverImage: '',
  });
  const [error, setError] = useState('');
  // removed manual save message (autosave)

  // Load data from project when available
  const initializedRef = useRef(false);
  useEffect(() => {
    if (project && !initializedRef.current) {
      const p = project as Partial<ProjectExtra> & {
        title?: string; subtitle?: string; authors?: string[]; narrators?: string[]; translators?: string[]; adaptors?: string[];
        description?: string; publisher?: string; isbn?: string;
      };
      setTimeout(() => setForm({
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
        coverImage: (p as { cover_image?: string }).cover_image || '',
      }), 0);
      initializedRef.current = true;
    }
  }, [project]);

  const updateMutation = useMutation({
    mutationFn: (data: ProjectUpdate) => projectsApi.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // no manual save message for autosave mode
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(error.response?.data?.detail || error.message || t('book.saveError', 'Failed to save book details'));
    },
  });

  // Debounced autosave
  const autosaveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!initializedRef.current) return; // skip until initial load
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
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
        cover_image: form.coverImage || undefined,
      };
      const merged: ProjectUpdate = {
        ...payload,
        language: extras.language,
        settings: {
          ...(project?.settings || {}),
          book: {
            ...(project?.settings?.book || {}),
            keywords: extras.keywords,
            categories: extras.categories,
            series_name: extras.series_name,
            series_number: extras.series_number,
            digital_voice_disclosure: extras.digital_voice_disclosure,
            cover_image: extras.cover_image,
          },
        },
      };
      updateMutation.mutate(merged);
      const hasTitle = form.title.trim().length > 0;
      const authorList = form.authors.split(',').map(a => a.trim()).filter(Boolean);
      const hasAuthor = authorList.length > 0;
      const hasDescription = form.description.trim().length > 0;
      const hasLanguage = form.language.trim().length > 0;
      const hasDigitalDisclosure = form.digitalVoiceDisclosureChecked;
      const bookComplete = hasTitle && hasAuthor && hasDescription && hasDigitalDisclosure && hasLanguage;
      setStepCompleted('book', bookComplete);
    }, 800);
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current); };
  }, [form, t, updateMutation, project]);

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
        <p className="mt-2" style={{ color: 'var(--text-muted)' }}>{t('book.loading', 'Loading...')}</p>
      </div>
    );
  }

  // Build groups matching desktop ordering, with localization-friendly labels
  const byCode = new Map(SUPPORTED_LOCALES.map(l => [l.code, l]));
  const groupDefs: { key: string; label: string; codes: string[] }[] = [
    { key: 'spanish', label: t('languages.group.spanish', '🇪🇸 Spanish'), codes: ['es-ES','es-MX','es-AR','es-PE','es-CO','es-CL','es-VE','es-EC','es-GT','es-CR','es-PA','es-UY','es-PY','es-BO','es-SV','es-HN','es-NI','es-DO','es-PR','es-CU','es-GQ','es-US'] },
    { key: 'english', label: t('languages.group.english', '🇺🇸 English'), codes: ['en-US','en-GB','en-AU','en-CA','en-IN','en-IE','en-ZA','en-NZ','en-SG','en-HK','en-PH','en-KE','en-NG','en-TZ'] },
    { key: 'portuguese', label: t('languages.group.portuguese', '🇵🇹 Portuguese'), codes: ['pt-BR','pt-PT'] },
    { key: 'french', label: t('languages.group.french', '🇫🇷 French'), codes: ['fr-FR','fr-CA','fr-BE','fr-CH'] },
    { key: 'german', label: t('languages.group.german', '🇩🇪 German'), codes: ['de-DE','de-AT','de-CH'] },
    { key: 'italian', label: t('languages.group.italian', '🇮🇹 Italian'), codes: ['it-IT'] },
    { key: 'chinese', label: t('languages.group.chinese', '🇨🇳 Chinese'), codes: ['zh-CN','zh-TW','zh-HK'] },
    { key: 'japanese', label: t('languages.group.japanese', '🇯🇵 Japanese'), codes: ['ja-JP'] },
    { key: 'korean', label: t('languages.group.korean', '🇰🇷 Korean'), codes: ['ko-KR'] },
    { key: 'arabic', label: t('languages.group.arabic', '🇸🇦 Arabic'), codes: ['ar-SA','ar-EG','ar-AE','ar-JO','ar-LB','ar-MA','ar-TN','ar-DZ','ar-IQ','ar-KW','ar-BH','ar-QA','ar-OM','ar-YE','ar-SY','ar-LY'] },
    { key: 'otherEuropean', label: t('languages.group.otherEuropean', '🇪🇺 Other European'), codes: ['ru-RU','nl-NL','nl-BE','sv-SE','nb-NO','da-DK','fi-FI','pl-PL','cs-CZ','sk-SK','hu-HU','ro-RO','bg-BG','hr-HR','sl-SI','lt-LT','lv-LV','et-EE','mt-MT','el-GR','tr-TR','uk-UA'] },
    { key: 'regionalEuropean', label: t('languages.group.regionalEuropean', '🏴 Regional European'), codes: ['ca-ES','eu-ES','gl-ES'] },
    { key: 'otherLanguages', label: t('languages.group.otherLanguages', '🌏 Other Languages'), codes: ['hi-IN','th-TH','vi-VN','id-ID','he-IL'] },
  ];

  return (
    <div>
      <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border p-6">
              {/* Header and intro */}

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

        {/* Autosave removes manual success banner */}

        <form className="space-y-6">
          {/* Basic Information */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
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
                  className="w-full px-3 py-2 border rounded-md mb-3"
                >
                  <option value="">{t('book.language.placeholder', 'Select book language')}</option>
                  {groupDefs.map(group => (
                    <optgroup key={group.key} label={group.label}>
                      {group.codes.map(code => {
                        const loc = byCode.get(code);
                        if (!loc) return null;
                        return (
                          <option key={code} value={code}>{getLocaleDisplayName(code)}</option>
                        );
                      })}
                    </optgroup>
                  ))}
                </select>
              </div>

            </div>
            <div>
              <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>
                {t('book.coverImage.panelTitle', 'Cover Image')}
              </h2>
              <div className="space-y-4">
                <ImageSelectorWeb
                  value={form.coverImage}
                  onChange={(url) => setForm(prev => ({ ...prev, coverImage: url || '' }))}
                  onUpload={async (variants) => {
                    if (variants[0]) return URL.createObjectURL(variants[0].blob);
                    return undefined;
                  }}
                />
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t('book.coverImage.requirements', 'Requirements: Square image 2000–4000px. Preferred 3000×3000px. Formats: PNG or JPG.')}
                </p>
              </div>
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

          <div className="flex justify-end pt-2" style={{ color: 'var(--text-muted)', minHeight: 24 }}>
            {updateMutation.isPending ? t('book.saving', 'Saving…') : null}
          </div>
        </form>
      </div>
    </div>
  );
}
