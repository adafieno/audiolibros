import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../lib/projects';
import { setStepCompleted } from '../store/project';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/projects/$projectId/properties')({
  component: ProjectPropertiesPage,
});

// Password field component with visibility toggle
function PasswordField({ 
  label, 
  value, 
  onChange, 
  placeholder 
}: { 
  label: string; 
  value: string; 
  onChange: (value: string) => void; 
  placeholder?: string; 
}) {
  const [showPassword, setShowPassword] = useState(false);
  
  return (
    <label>
      <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>{label}</div>
      <div style={{ position: 'relative' }}>
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{ 
            backgroundColor: 'var(--panel)', 
            borderColor: 'var(--border)', 
            color: 'var(--text)',
            paddingRight: '36px'
          }}
          className="w-full px-3 py-2 border rounded-md"
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            color: 'var(--muted)',
            padding: '2px',
            borderRadius: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px'
          }}
        >
          {showPassword ? '🙈' : '👁️'}
        </button>
      </div>
    </label>
  );
}

type TtsEngine = {
  name: 'azure' | 'elevenlabs' | 'openai';
  voice?: string;
};

type LlmEngine = {
  name: 'openai' | 'azure-openai' | 'anthropic';
  model?: string;
};

type ProjectSettings = {
  tts?: {
    engine?: TtsEngine;
    cache?: boolean;
  };
  llm?: {
    engine?: LlmEngine;
  };
  planning?: {
    maxKb?: number;
    llmAttribution?: 'on' | 'off';
  };
  pauses?: {
    sentenceMs?: number;
    paragraphMs?: number;
    chapterMs?: number;
    commaMs?: number;
    colonMs?: number;
    semicolonMs?: number;
  };
  export?: {
    outputDir?: string;
    platforms?: {
      apple?: boolean;
      google?: boolean;
      spotify?: boolean;
      acx?: boolean;
      kobo?: boolean;
    };
  };
  pronunciationMap?: Record<string, string>;
  creds?: {
    tts?: {
      azure?: {
        key?: string;
        region?: string;
      };
    };
    llm?: {
      openai?: {
        apiKey?: string;
        baseUrl?: string;
      };
    };
  };
};

function ProjectPropertiesPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  });

  // Local state for settings
  const [settings, setSettings] = useState<ProjectSettings>({});
  const [error, setError] = useState('');
  const initializedRef = useRef(false);
  const autosaveTimer = useRef<number | null>(null);
  const lastSavedHashRef = useRef<string>('');
  const tRef = useRef(t);
  const mutateRef = useRef<(data: { settings: ProjectSettings }) => void>(() => {});

  // Load settings from project when available
  useEffect(() => {
    if (project?.settings && !initializedRef.current) {
      initializedRef.current = true;
      setTimeout(() => setSettings(project.settings as ProjectSettings), 0);
    }
  }, [project]);

  const updateMutation = useMutation({
    mutationFn: (data: { settings: ProjectSettings }) => projectsApi.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // Minimal properties completion: language and at least one export platform or TTS voice
      const platforms = settings.export?.platforms || {};
      const hasPlatform = Object.values(platforms).some(Boolean);
      const ttsConfigured = settings.tts?.engine?.name === 'azure' && !!settings.tts?.engine?.voice;
      const llmConfigured = ['openai','azure-openai','anthropic'].includes(settings.llm?.engine?.name || '');
      // Project completion requires at least one platform + TTS + LLM configured
      setStepCompleted('project', hasPlatform && ttsConfigured && llmConfigured);
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(error.response?.data?.detail || error.message || t('projectProperties.saveError', 'Failed to save settings'));
    },
  });

  // Stable refs to avoid effect dependency warnings
  useEffect(() => { tRef.current = t; }, [t]);
  useEffect(() => { mutateRef.current = updateMutation.mutate; }, [updateMutation.mutate]);

  // Autosave with debounce and payload hashing
  useEffect(() => {
    if (!initializedRef.current) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      setError('');
      const payload = { settings };
      const hash = JSON.stringify(payload);
      if (hash !== lastSavedHashRef.current) {
        lastSavedHashRef.current = hash;
        mutateRef.current(payload);
      }
      const platforms = settings.export?.platforms || {};
      const hasPlatform = Object.values(platforms).some(Boolean);
      const ttsConfigured = settings.tts?.engine?.name === 'azure' && !!settings.tts?.engine?.voice;
      const llmConfigured = ['openai','azure-openai','anthropic'].includes(settings.llm?.engine?.name || '');
      setStepCompleted('project', hasPlatform && ttsConfigured && llmConfigured);
    }, 700);
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current); };
  }, [settings]);

  const updateSettings = (path: string[], value: unknown) => {
    setSettings((prev) => {
      const newSettings = { ...prev };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let current: any = newSettings;
      
      for (let i = 0; i < path.length - 1; i++) {
        if (!current[path[i]]) {
          current[path[i]] = {};
        }
        current = current[path[i]];
      }
      
      current[path[path.length - 1]] = value;
      return newSettings;
    });
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
        <p className="mt-2" style={{ color: 'var(--text-muted)' }}>{t('properties.loading', 'Loading...')}</p>
      </div>
    );
  }

  const platforms = settings.export?.platforms || {};
  const hasPlatform = Object.values(platforms).some(Boolean);
  const ttsConfigured = !!settings.tts?.engine?.voice;
  const llmConfigured = !!settings.llm?.engine?.model;
  const isComplete = hasPlatform && ttsConfigured && llmConfigured;

  return (
    <div className="p-6">
      <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>
              {t('projectProperties.title', 'Project Properties')}
            </h1>
            <p style={{ color: 'var(--text-muted)' }}>
              {t('projectProperties.description', 'Configure technical settings for TTS, LLM, and export options.')}
            </p>
          </div>
          {isComplete ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium shadow" style={{ background: '#22c55e', color: '#052e12' }}>
              {t('project.completed', 'Completed')}
            </span>
          ) : null}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg p-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--error)', border: '1px solid' }}>
          <p style={{ color: 'var(--error)' }}>{error}</p>
        </div>
      )}

      {/* Two-column layout: Left (Orchestration + Packaging), Right (LLM + TTS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        
        {/* LEFT COLUMN: Orchestration + Packaging */}
        <div className="space-y-6">
          
          {/* Orchestration (Pause Configuration) */}
          <section>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>
              {t('project.planning', 'Orchestration')}
            </h3>
            <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
              {t('project.pauseUnitsInfo', 'Pause values are in milliseconds.')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.sentencePause', 'Sentence Pause')}
                </div>
                <input
                  type="number"
                  value={settings.pauses?.sentenceMs ?? 500}
                  onChange={(e) => updateSettings(['pauses', 'sentenceMs'], parseInt(e.target.value))}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </label>
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.paragraphPause', 'Paragraph Pause')}
                </div>
                <input
                  type="number"
                  value={settings.pauses?.paragraphMs ?? 1000}
                  onChange={(e) => updateSettings(['pauses', 'paragraphMs'], parseInt(e.target.value))}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </label>
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.chapterPause', 'Chapter Pause')}
                </div>
                <input
                  type="number"
                  value={settings.pauses?.chapterMs ?? 3000}
                  onChange={(e) => updateSettings(['pauses', 'chapterMs'], parseInt(e.target.value))}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </label>
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.commaPause', 'Comma Pause')}
                </div>
                <input
                  type="number"
                  value={settings.pauses?.commaMs ?? 300}
                  onChange={(e) => updateSettings(['pauses', 'commaMs'], parseInt(e.target.value))}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </label>
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.colonPause', 'Colon Pause')}
                </div>
                <input
                  type="number"
                  value={settings.pauses?.colonMs ?? 400}
                  onChange={(e) => updateSettings(['pauses', 'colonMs'], parseInt(e.target.value))}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </label>
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.semicolonPause', 'Semi-colon Pause')}
                </div>
                <input
                  type="number"
                  value={settings.pauses?.semicolonMs ?? 350}
                  onChange={(e) => updateSettings(['pauses', 'semicolonMs'], parseInt(e.target.value))}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </label>
            </div>
          </section>

          {/* Packaging */}
          <section>
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text)' }}>
              {t('project.packaging', 'Packaging')}
            </h3>
            <div>
              <div className="text-sm mb-2" style={{ color: 'var(--text)' }}>
                {t('project.targetPlatforms', 'Target Platforms')}
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.export?.platforms?.apple ?? false}
                    onChange={(e) => updateSettings(['export', 'platforms', 'apple'], e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>Apple Books</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.export?.platforms?.google ?? false}
                    onChange={(e) => updateSettings(['export', 'platforms', 'google'], e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>Google Play</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.export?.platforms?.spotify ?? false}
                    onChange={(e) => updateSettings(['export', 'platforms', 'spotify'], e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>Spotify</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.export?.platforms?.acx ?? false}
                    onChange={(e) => updateSettings(['export', 'platforms', 'acx'], e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>ACX</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.export?.platforms?.kobo ?? false}
                    onChange={(e) => updateSettings(['export', 'platforms', 'kobo'], e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>Kobo</span>
                </label>
              </div>
            </div>
          </section>

          {/* Pronunciation Map */}
          <section>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>
              {t('project.pronunciationMap', 'Pronunciation Map')}
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              {t('project.pronunciationMapInfo', 'Customize pronunciations using IPA. Use "Suggest IPA" for automated suggestions.')}
            </p>
            <div className="space-y-2">
              {Object.entries(settings.pronunciationMap || {}).map(([word, ipa]) => (
                <div key={word} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={word}
                    disabled
                    style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)', opacity: 0.7 }}
                    className="w-32 px-2 py-1 border rounded text-sm"
                  />
                  <input
                    type="text"
                    value={ipa}
                    onChange={(e) => {
                      const newMap = { ...settings.pronunciationMap, [word]: e.target.value };
                      updateSettings(['pronunciationMap'], newMap);
                    }}
                    style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                    className="w-48 px-2 py-1 border rounded text-sm"
                    placeholder={t('project.ipaPlaceholder', 'IPA notation')}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      // TODO: Implement IPA suggestion via API
                      alert('IPA suggestion not yet implemented in web version');
                    }}
                    style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                    className="px-3 py-1 border rounded text-sm hover:opacity-80"
                  >
                    {t('project.suggestIPA', 'Suggest IPA')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newMap = { ...settings.pronunciationMap };
                      delete newMap[word];
                      updateSettings(['pronunciationMap'], newMap);
                    }}
                    style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--error)', color: 'var(--error)' }}
                    className="px-3 py-1 border rounded text-sm hover:opacity-80"
                  >
                    {t('project.removeWord', 'Remove')}
                  </button>
                </div>
              ))}
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  id="newPronWord"
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-32 px-2 py-1 border rounded text-sm"
                  placeholder={t('project.wordPlaceholder', 'Word')}
                />
                <button
                  type="button"
                  onClick={() => {
                    const input = document.getElementById('newPronWord') as HTMLInputElement;
                    const word = input?.value?.trim();
                    if (word && !(settings.pronunciationMap || {})[word]) {
                      const newMap = { ...(settings.pronunciationMap || {}), [word]: '' };
                      updateSettings(['pronunciationMap'], newMap);
                      input.value = '';
                    }
                  }}
                  style={{ backgroundColor: '#22c55e', borderColor: '#16a34a', color: 'white' }}
                  className="px-3 py-1 border rounded text-sm hover:opacity-90"
                >
                  {t('project.addWord', 'Add Word')}
                </button>
              </div>
            </div>
          </section>

        </div>

        {/* RIGHT COLUMN: LLM + TTS Engines */}
        <div className="space-y-6">

          {/* LLM Engine */}
          <section>
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text)' }}>
              {t('project.llm', 'LLM Engine')}
            </h3>
            <div className="grid grid-cols-[140px_1fr] gap-2 items-center mb-4">
              <select
                value={settings.llm?.engine?.name || 'openai'}
                onChange={(e) => {
                  const name = e.target.value;
                  if (name === 'openai') {
                    updateSettings(['llm', 'engine'], { name: 'openai', model: settings.llm?.engine?.model || 'gpt-4o' });
                  } else if (name === 'azure-openai') {
                    updateSettings(['llm', 'engine'], { name: 'azure-openai', model: settings.llm?.engine?.model || 'gpt-4o' });
                  } else {
                    updateSettings(['llm', 'engine'], { name: 'anthropic', model: settings.llm?.engine?.model || 'claude-3-opus' });
                  }
                }}
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                className="px-3 py-2 border rounded-md"
              >
                <option value="openai">OpenAI</option>
                <option value="azure-openai">Azure OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
              <input
                type="text"
                value={settings.llm?.engine?.model || ''}
                onChange={(e) => updateSettings(['llm', 'engine', 'model'], e.target.value)}
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                className="px-3 py-2 border rounded-md"
                placeholder="gpt-4o"
              />
            </div>
            
            {/* OpenAI Credentials */}
            {settings.llm?.engine?.name === 'openai' && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <h4 className="text-base font-semibold mb-3" style={{ color: 'var(--text)' }}>
                  {t('project.openaiCredentials', 'OpenAI Credentials')}
                </h4>
                <div className="grid grid-cols-[1fr_1fr] gap-3 items-start">
                  <PasswordField
                    label={t('project.openaiApiKey', 'OpenAI API Key')}
                    value={settings.creds?.llm?.openai?.apiKey || ''}
                    onChange={(value) => updateSettings(['creds', 'llm', 'openai', 'apiKey'], value)}
                    placeholder="sk-..."
                  />
                  <label>
                    <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                      {t('project.openaiBaseUrl', 'OpenAI Base URL (optional)')}
                    </div>
                    <input
                      type="text"
                      value={settings.creds?.llm?.openai?.baseUrl || ''}
                      onChange={(e) => updateSettings(['creds', 'llm', 'openai', 'baseUrl'], e.target.value)}
                      style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                      className="w-full px-3 py-2 border rounded-md"
                      placeholder="https://api.openai.com/v1"
                    />
                  </label>
                </div>
              </div>
            )}
          </section>

          {/* TTS Engine */}
          <section>
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text)' }}>
              {t('project.tts', 'TTS Engine')}
            </h3>
            <div className="grid grid-cols-[140px_1fr] gap-2 items-center mb-3">
              <select
                value={settings.tts?.engine?.name || 'azure'}
                onChange={(e) => {
                  const name = e.target.value;
                  if (name === 'azure') {
                    updateSettings(['tts', 'engine'], { name: 'azure', voice: settings.tts?.engine?.voice || '' });
                  } else if (name === 'elevenlabs') {
                    updateSettings(['tts', 'engine'], { name: 'elevenlabs', voice: settings.tts?.engine?.voice || '' });
                  } else {
                    updateSettings(['tts', 'engine'], { name: 'openai', voice: settings.tts?.engine?.voice || '' });
                  }
                }}
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                className="px-3 py-2 border rounded-md"
              >
                <option value="azure">Azure</option>
                <option value="elevenlabs">ElevenLabs</option>
                <option value="openai">OpenAI TTS</option>
              </select>
              <input
                type="text"
                value={settings.tts?.engine?.voice || ''}
                onChange={(e) => updateSettings(['tts', 'engine', 'voice'], e.target.value)}
                style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                className="px-3 py-2 border rounded-md"
                placeholder="es-PE-CamilaNeural"
              />
            </div>
            <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
              {t('project.ttsCachingInfo', 'TTS caching is always enabled for optimal performance.')}
            </p>
            
            {/* Azure TTS Credentials */}
            {settings.tts?.engine?.name === 'azure' && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <h4 className="text-base font-semibold mb-3" style={{ color: 'var(--text)' }}>
                  {t('project.azureTtsCredentials', 'Azure TTS Credentials')}
                </h4>
                <div className="grid grid-cols-[1fr_200px] gap-3 items-start">
                  <PasswordField
                    label={t('project.azureTtsKey', 'Azure TTS Key')}
                    value={settings.creds?.tts?.azure?.key || ''}
                    onChange={(value) => updateSettings(['creds', 'tts', 'azure', 'key'], value)}
                    placeholder="••••••••"
                  />
                  <label>
                    <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                      {t('project.azureRegion', 'Azure Region')}
                    </div>
                    <input
                      type="text"
                      value={settings.creds?.tts?.azure?.region || ''}
                      onChange={(e) => updateSettings(['creds', 'tts', 'azure', 'region'], e.target.value)}
                      style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                      className="w-full px-3 py-2 border rounded-md"
                      placeholder="eastus"
                    />
                  </label>
                </div>
              </div>
            )}
          </section>

        </div>
      </div>

      {/* Autosave status */}
      <div className="flex justify-end pt-2" style={{ minHeight: 24, color: 'var(--text-muted)' }}>
        {updateMutation.isPending ? t('projectProperties.saving', 'Saving...') : null}
      </div>
    </div>
  );
}
