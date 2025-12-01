import { useState, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { projectsApi, type ProjectUpdate, type Project } from '../lib/projects';
import { SUPPORTED_LOCALES, getLocaleDisplayName } from '../data/languages';
import { setStepCompleted } from '../store/project';

export const Route = createFileRoute('/projects/$projectId/book')({
  component: BookDetailsPage,
});

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
  coverImageUrl: string;
};

function BookDetailsPage() {
  const { projectId } = Route.useParams();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const initializedRef = useRef(false);
  const autosaveTimer = useRef<number | null>(null);
  const lastSavedHashRef = useRef<string>('');
  const tRef = useRef(t);
  const mutateRef = useRef<(data: ProjectUpdate) => void>(() => {});
  const settingsRef = useRef<Project['settings'] | undefined>(undefined);
  const projectRef = useRef<Project | undefined>(undefined);
  const [error, setError] = useState('');

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  });

  // Keep project ref updated
  useEffect(() => {
    if (project) {
      projectRef.current = project;
    }
  }, [project]);

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
    coverImageUrl: '',
  });

  useEffect(() => {
    if (!project) return;
    // Prevent reinitializing form on every project refetch
    if (initializedRef.current) return;
    const book = (project.settings?.book || {}) as {
      keywords?: string[];
      categories?: string[];
      series_name?: string;
      series_number?: number;
      digital_voice_disclosure?: string;
      cover_image_b64?: string;
      cover_image_url?: string;
    };
    const next: FormState = {
      title: project.title || '',
      subtitle: project.subtitle || '',
      authors: (project.authors || []).join(', '),
      narrators: (project.narrators || []).join(', '),
      translators: (project.translators || []).join(', '),
      adaptors: (project.adaptors || []).join(', '),
      description: project.description || '',
      publisher: project.publisher || '',
      isbn: project.isbn || '',
      language: project.language || '',
      keywords: (book.keywords || []).join(', '),
      categories: (book.categories || []).join(', '),
      seriesName: book.series_name || '',
      seriesNumber: book.series_number ? String(book.series_number) : '',
      digitalVoiceDisclosureChecked: !!book.digital_voice_disclosure,
      coverImageUrl: book.cover_image_b64 ? `data:image/jpeg;base64,${book.cover_image_b64}` : (book.cover_image_url || project.cover_image_url || ''),
    };
    // Mark initialized and apply state once (defer to next tick)
    initializedRef.current = true;
    setTimeout(() => setForm(next), 0);
  }, [project]);

  const updateMutation = useMutation({
    mutationFn: (data: ProjectUpdate) => projectsApi.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e.response?.data?.detail || e.message || t('book.saveError', 'Failed to save book details'));
    },
  });

  // Keep stable refs for external deps used inside autosave effect
  useEffect(() => { tRef.current = t; }, [t]);
  useEffect(() => { mutateRef.current = updateMutation.mutate; }, [updateMutation.mutate]);
  useEffect(() => { settingsRef.current = project?.settings; }, [project?.settings]);

  useEffect(() => {
    if (!initializedRef.current) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      setError('');
      const update: ProjectUpdate = {
        title: form.title || undefined,
        subtitle: form.subtitle || undefined,
        authors: form.authors ? form.authors.split(',').map(a => a.trim()).filter(Boolean) : undefined,
        narrators: form.narrators ? form.narrators.split(',').map(n => n.trim()).filter(Boolean) : undefined,
        translators: form.translators ? form.translators.split(',').map(tr => tr.trim()).filter(Boolean) : undefined,
        adaptors: form.adaptors ? form.adaptors.split(',').map(ad => ad.trim()).filter(Boolean) : undefined,
        language: form.language || undefined,
        description: form.description || undefined,
        publisher: form.publisher || undefined,
        isbn: form.isbn || undefined,
        cover_image_url: form.coverImageUrl && !form.coverImageUrl.startsWith('data:') ? form.coverImageUrl : undefined,
        settings: {
          ...(settingsRef.current || {}),
          book: {
            ...(settingsRef.current?.book || {}),
            keywords: form.keywords ? form.keywords.split(',').map(k => k.trim()).filter(Boolean) : undefined,
            categories: form.categories ? form.categories.split(',').map(c => c.trim()).filter(Boolean) : undefined,
            series_name: form.seriesName || undefined,
            series_number: form.seriesNumber ? Number(form.seriesNumber) : undefined,
            digital_voice_disclosure: form.digitalVoiceDisclosureChecked ? tRef.current('book.digitalVoiceDisclosure.defaultText', 'This audiobook uses synthetic voices.') : undefined,
            cover_image_url: form.coverImageUrl && !form.coverImageUrl.startsWith('data:') ? form.coverImageUrl : undefined,
            cover_image_b64: form.coverImageUrl?.startsWith('data:image/jpeg;base64,') ? form.coverImageUrl.replace('data:image/jpeg;base64,','') : undefined,
          },
        },
      };
      // Skip autosave if the only change is transient data URL cover preview
      const bookSettings = update.settings?.book as {
        cover_image_b64?: string;
        keywords?: string[];
        categories?: string[];
        series_name?: string;
        series_number?: number;
        digital_voice_disclosure?: string;
        cover_image_url?: string;
      } | undefined;
      const onlyCoverDataUrl = bookSettings?.cover_image_b64 &&
        !update.title && !update.subtitle && !update.authors && !update.narrators && !update.translators && !update.adaptors && !update.language && !update.description && !update.publisher && !update.isbn && !update.cover_image_url &&
        !bookSettings?.keywords && !bookSettings?.categories && !bookSettings?.series_name && !bookSettings?.series_number && !bookSettings?.digital_voice_disclosure && !bookSettings?.cover_image_url;

      // Check completion status
      const complete =
        form.title.trim() &&
        form.authors.split(',').map(a => a.trim()).filter(Boolean).length > 0 &&
        form.description.trim() &&
        form.language.trim() &&
        form.digitalVoiceDisclosureChecked;
      
      // Add workflow_completed to the update
      update.workflow_completed = {
        ...(projectRef.current?.workflow_completed || {}),
        book: !!complete
      };
      
      // Compute a hash of the payload; avoid mutating if unchanged
      const hash = JSON.stringify(update);
      const changed = hash !== lastSavedHashRef.current;
      if (!onlyCoverDataUrl && changed) {
        lastSavedHashRef.current = hash;
        mutateRef.current(update);
      }
      setStepCompleted('book', !!complete);
    }, 700);
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current); };
  }, [form]);

  if (isLoading) {
    return <div className="py-12 text-center">{t('book.loading', 'Loading...')}</div>;
  }

  const byCode = new Map(SUPPORTED_LOCALES.map(l => [l.code, l]));
  const groupDefs: { key: string; label: string; codes: string[] }[] = [
    { key: 'spanish', label: t('languages.group.spanish', '🇪🇸 Spanish'), codes: ['es-ES','es-MX','es-AR','es-PE','es-CO','es-CL','es-VE','es-EC','es-GT','es-CR','es-PA','es-UY','es-PY','es-BO','es-SV','es-HN','es-NI','es-DO','es-PR','es-CU','es-GQ','es-US'] },
    { key: 'english', label: t('languages.group.english', '🇺🇸 English'), codes: ['en-US','en-GB','en-AU','en-CA','en-IN','en-IE','en-ZA','en-NZ','en-SG','en-PH'] },
    { key: 'portuguese', label: t('languages.group.portuguese', '🇵🇹 Portuguese'), codes: ['pt-BR','pt-PT'] },
    { key: 'french', label: t('languages.group.french', '🇫🇷 French'), codes: ['fr-FR','fr-CA','fr-BE','fr-CH'] },
    { key: 'german', label: t('languages.group.german', '🇩🇪 German'), codes: ['de-DE','de-AT','de-CH'] },
    { key: 'italian', label: t('languages.group.italian', '🇮🇹 Italian'), codes: ['it-IT'] },
    { key: 'chinese', label: t('languages.group.chinese', '🇨🇳 Chinese'), codes: ['zh-CN','zh-TW','zh-HK'] },
    { key: 'japanese', label: t('languages.group.japanese', '🇯🇵 Japanese'), codes: ['ja-JP'] },
    { key: 'korean', label: t('languages.group.korean', '🇰🇷 Korean'), codes: ['ko-KR'] },
    { key: 'arabic', label: t('languages.group.arabic', '🇸🇦 Arabic'), codes: ['ar-SA','ar-EG','ar-AE','ar-MA','ar-LB'] },
    { key: 'otherEuropean', label: t('languages.group.otherEuropean', '🇪🇺 Other European'), codes: ['ru-RU','nl-NL','nl-BE','sv-SE','nb-NO','da-DK','fi-FI','pl-PL','cs-CZ','sk-SK','hu-HU','ro-RO','bg-BG','hr-HR','sl-SI','lt-LT','lv-LV','et-EE','mt-MT','el-GR','tr-TR','uk-UA'] },
    { key: 'regionalEuropean', label: t('languages.group.regionalEuropean', '🏴 Regional European'), codes: ['ca-ES','eu-ES','gl-ES'] },
    { key: 'otherLanguages', label: t('languages.group.otherLanguages', '🌏 Other Languages'), codes: ['hi-IN','th-TH','vi-VN','id-ID','he-IL'] },
  ];

  const isComplete = (
    form.title.trim() &&
    form.authors.split(',').map(a => a.trim()).filter(Boolean).length > 0 &&
    form.description.trim() &&
    form.language.trim() &&
    form.digitalVoiceDisclosureChecked
  );

  return (
    <div className="p-6">
      <div className="rounded-lg border shadow mb-6 p-6" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>{t('book.title', 'Book Details')}</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('book.description', 'Enter the book metadata and publishing information that will appear in the audiobook.')}</p>
          </div>
          {isComplete ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium shadow" style={{ background: '#22c55e', color: '#052e12' }}>
              {t('project.completed', 'Completed')}
            </span>
          ) : null}
        </div>
      </div>
      {error && (
        <div className="mb-4 p-4 rounded border" style={{ borderColor: 'var(--error)', background: 'rgba(239,68,68,0.1)' }}>
          <p style={{ color: 'var(--error)' }}>{error}</p>
        </div>
      )}
      <form className="space-y-10">
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text)' }}>{t('book.basicInfo', 'Basic Information')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label htmlFor="title" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t('book.title.label', 'Book Title')} <span style={{ color: 'var(--error)' }}>*</span></label>
                <input id="title" value={form.title} required onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="w-full px-3 py-2 border rounded" style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder={t('book.title.placeholder', 'Enter the book title')} />
              </div>
              <div>
                <label htmlFor="subtitle" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t('book.subtitle.label', 'Subtitle')}</label>
                <input id="subtitle" value={form.subtitle} onChange={e => setForm(p => ({ ...p, subtitle: e.target.value }))} className="w-full px-3 py-2 border rounded" style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder={t('book.subtitle.placeholder', 'Enter the book subtitle')} />
              </div>
              <div>
                <label htmlFor="language" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t('book.language.label', 'Book Language / Locale')} <span style={{ color: 'var(--error)' }}>*</span></label>
                <select id="language" required value={form.language} onChange={e => setForm(p => ({ ...p, language: e.target.value }))} className="w-full px-3 py-2 border rounded" style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}>
                  <option value="">{t('book.language.placeholder', 'Select book language')}</option>
                  {groupDefs.map(g => (
                    <optgroup key={g.key} label={g.label}>
                      {g.codes.map(code => {
                        const loc = byCode.get(code);
                        if (!loc) return null;
                        return <option key={code} value={code}>{getLocaleDisplayName(code)}</option>;
                      })}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="authors" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t('book.authors.label', 'Authors')}</label>
                <input id="authors" value={form.authors} onChange={e => setForm(p => ({ ...p, authors: e.target.value }))} className="w-full px-3 py-2 border rounded" style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder={t('book.authors.placeholder', 'Comma-separated list')} />
              </div>
              <div>
                <label htmlFor="narrators" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t('book.narrators.label', 'Narrators')}</label>
                <input id="narrators" value={form.narrators} onChange={e => setForm(p => ({ ...p, narrators: e.target.value }))} className="w-full px-3 py-2 border rounded" style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder={t('book.narrators.placeholder', 'Comma-separated list')} />
              </div>
              <div>
                <label htmlFor="translators" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t('book.translators.label', 'Translators')}</label>
                <input id="translators" value={form.translators} onChange={e => setForm(p => ({ ...p, translators: e.target.value }))} className="w-full px-3 py-2 border rounded" style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder={t('book.translators.placeholder', 'Comma-separated list')} />
              </div>
              <div>
                <label htmlFor="adaptors" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t('book.adaptors.label', 'Adaptors')}</label>
                <input id="adaptors" value={form.adaptors} onChange={e => setForm(p => ({ ...p, adaptors: e.target.value }))} className="w-full px-3 py-2 border rounded" style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder={t('book.adaptors.placeholder', 'Comma-separated list')} />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="description" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t('book.description.label', 'Description')} <span style={{ color: 'var(--error)' }}>*</span></label>
                <textarea id="description" rows={5} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2 border rounded" style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)', resize: 'vertical' }} placeholder={t('book.description.placeholder', 'Enter the book description')} />
              </div>
              <div>
                <label htmlFor="keywords" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t('book.keywords.label', 'Keywords')}</label>
                <input id="keywords" value={form.keywords} onChange={e => setForm(p => ({ ...p, keywords: e.target.value }))} className="w-full px-3 py-2 border rounded" style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder={t('book.keywords.placeholder', 'Comma-separated')} />
              </div>
              <div>
                <label htmlFor="categories" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t('book.categories.label', 'Categories')}</label>
                <input id="categories" value={form.categories} onChange={e => setForm(p => ({ ...p, categories: e.target.value }))} className="w-full px-3 py-2 border rounded" style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder={t('book.categories.placeholder', 'Comma-separated')} />
              </div>
              <div>
                <label htmlFor="seriesName" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t('book.seriesName.label', 'Series Name')}</label>
                <input id="seriesName" value={form.seriesName} onChange={e => setForm(p => ({ ...p, seriesName: e.target.value }))} className="w-full px-3 py-2 border rounded" style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder={t('book.seriesName.placeholder', 'Enter the series name')} />
              </div>
              <div>
                <label htmlFor="seriesNumber" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t('book.seriesNumber.label', 'Series Number')}</label>
                <input id="seriesNumber" value={form.seriesNumber} onChange={e => setForm(p => ({ ...p, seriesNumber: e.target.value }))} className="w-full px-3 py-2 border rounded" style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder={t('book.seriesNumber.placeholder', 'Enter the series number')} />
              </div>
              <div className="md:col-span-2 flex items-center gap-2">
                <input id="dvDisclosure" type="checkbox" checked={form.digitalVoiceDisclosureChecked} onChange={e => setForm(p => ({ ...p, digitalVoiceDisclosureChecked: e.target.checked }))} />
                <label htmlFor="dvDisclosure" className="text-sm" style={{ color: 'var(--text)' }}>{t('book.digitalVoiceDisclosure.label', 'Synthetic voice disclosure')}</label>
              </div>
              <div>
                <label htmlFor="publisher" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t('book.publisher.label', 'Publisher')}</label>
                <input id="publisher" value={form.publisher} onChange={e => setForm(p => ({ ...p, publisher: e.target.value }))} className="w-full px-3 py-2 border rounded" style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder={t('book.publisher.placeholder', 'Publisher name')} />
              </div>
              <div>
                <label htmlFor="isbn" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{t('book.isbn.label', 'ISBN')}</label>
                <input id="isbn" value={form.isbn} onChange={e => setForm(p => ({ ...p, isbn: e.target.value }))} className="w-full px-3 py-2 border rounded" style={{ background: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }} placeholder={t('book.isbn.placeholder', 'ISBN number')} />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{t('book.coverImage.panelTitle', 'Cover Image')}</h2>
            <div className="flex items-start gap-4">
              <div style={{ width: 300, height: 300, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {form.coverImageUrl ? (
                  <img src={form.coverImageUrl} alt={t('book.coverImage.alt','Cover image')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('book.coverImage.placeholder','No image uploaded')}</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input id="coverFileInput" type="file" accept="image/jpeg" className="hidden" onChange={async (e) => {
                  const file = e.currentTarget.files?.[0];
                  if (!file) return;
                  if (file.type !== 'image/jpeg') { setError(t('book.coverImage.error.format', 'Cover must be a JPG image.')); return; }
                  let bmp: ImageBitmap;
                  try { bmp = await createImageBitmap(file); } catch { setError(t('book.coverImage.error.load', 'Failed to load image for validation.')); return; }
                  if (bmp.width !== 3000 || bmp.height !== 3000) { setError(t('book.coverImage.error.size', 'Image must be exactly 3000 × 3000 pixels.')); return; }
                  const arrayBuffer = await file.arrayBuffer();
                  const bytes = new Uint8Array(arrayBuffer);
                  let binary = ''; for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
                  const base64 = btoa(binary);
                  const dataUrl = `data:image/jpeg;base64,${base64}`;
                  setError('');
                  setForm(p => ({ ...p, coverImageUrl: dataUrl }));
                  // Immediately persist, without waiting for debounce
                  updateMutation.mutate({
                    settings: {
                      ...(project?.settings || {}),
                      book: {
                        ...(project?.settings?.book || {}),
                        cover_image_b64: base64,
                        cover_image_url: undefined,
                      },
                    },
                  });
                }} />
                <button type="button" className="px-3 py-1 text-sm rounded shadow-sm" style={{ background: 'var(--accent)', color: '#fff' }} onClick={() => document.getElementById('coverFileInput')?.click()}>
                  {form.coverImageUrl ? t('book.coverImage.change', 'Change Image') : t('book.coverImage.upload', 'Upload Image')}
                </button>
                {form.coverImageUrl && (
                  <button type="button" className="px-3 py-1 text-sm rounded" style={{ background: '#ef4444', color: '#fff' }} onClick={() => setForm(p => ({ ...p, coverImageUrl: '' }))}>
                    {t('book.coverImage.remove', 'Remove')}
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('book.coverImage.requirements')}</p>
          </div>
        </section>
        <div className="flex justify-end pt-2" style={{ minHeight: 24, color: 'var(--text-muted)' }}>{updateMutation.isPending ? t('book.saving', 'Saving…') : null}</div>
      </form>
    </div>
  );
}

export default BookDetailsPage;
