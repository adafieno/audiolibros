import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../lib/projects';
import { setStepCompleted } from '../store/project';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/projects/$projectId/properties')({
  component: ProjectPropertiesPage,
});

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
      setSettings(project.settings as ProjectSettings);
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
  const ttsConfigured = settings.tts?.engine?.name === 'azure' && !!settings.tts?.engine?.voice;
  const llmConfigured = ['openai','azure-openai','anthropic'].includes(settings.llm?.engine?.name || '');
  const isComplete = hasPlatform && ttsConfigured && llmConfigured;

  return (
    <div>
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

        

        <form className="space-y-8">
          {/* TTS Configuration */}
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>
              {t('projectProperties.tts', 'Text-to-Speech Engine')}
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="tts-engine" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('projectProperties.ttsEngine', 'TTS Provider')}
                </label>
                <select
                  id="tts-engine"
                  value={settings.tts?.engine?.name || 'azure'}
                  onChange={(e) => updateSettings(['tts', 'engine', 'name'], e.target.value)}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="azure">Azure Cognitive Services</option>
                  <option value="elevenlabs">ElevenLabs</option>
                  <option value="openai">OpenAI TTS</option>
                </select>
              </div>

              <div>
                <label htmlFor="tts-voice" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('projectProperties.ttsVoice', 'Voice ID')}
                </label>
                <input
                  id="tts-voice"
                  type="text"
                  value={settings.tts?.engine?.voice || ''}
                  onChange={(e) => updateSettings(['tts', 'engine', 'voice'], e.target.value)}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('projectProperties.ttsVoicePlaceholder', 'e.g., es-PE-CamilaNeural')}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="tts-cache"
                  type="checkbox"
                  checked={settings.tts?.cache ?? true}
                  onChange={(e) => updateSettings(['tts', 'cache'], e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="tts-cache" className="text-sm" style={{ color: 'var(--text)' }}>
                  {t('projectProperties.ttsCache', 'Enable TTS caching')}
                </label>
              </div>
            </div>
          </section>

          {/* LLM Configuration */}
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>
              {t('projectProperties.llm', 'LLM Engine')}
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="llm-engine" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('projectProperties.llmProvider', 'LLM Provider')}
                </label>
                <select
                  id="llm-engine"
                  value={settings.llm?.engine?.name || 'openai'}
                  onChange={(e) => updateSettings(['llm', 'engine', 'name'], e.target.value)}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="openai">OpenAI</option>
                  <option value="azure-openai">Azure OpenAI</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                </select>
              </div>

              <div>
                <label htmlFor="llm-model" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('projectProperties.llmModel', 'Model')}
                </label>
                <input
                  id="llm-model"
                  type="text"
                  value={settings.llm?.engine?.model || ''}
                  onChange={(e) => updateSettings(['llm', 'engine', 'model'], e.target.value)}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder={t('projectProperties.llmModelPlaceholder', 'e.g., gpt-4o, claude-3-opus')}
                />
              </div>
            </div>
          </section>

          {/* Planning Configuration */}
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>
              {t('projectProperties.planning', 'Planning')}
            </h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="max-kb" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('projectProperties.maxKb', 'Max Segment Size (KB)')}
                </label>
                <input
                  id="max-kb"
                  type="number"
                  value={settings.planning?.maxKb || 48}
                  onChange={(e) => updateSettings(['planning', 'maxKb'], parseInt(e.target.value))}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                  min="1"
                  max="1000"
                />
              </div>

              <div>
                <label htmlFor="llm-attribution" className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
                  {t('projectProperties.llmAttribution', 'LLM Attribution')}
                </label>
                <select
                  id="llm-attribution"
                  value={settings.planning?.llmAttribution || 'off'}
                  onChange={(e) => updateSettings(['planning', 'llmAttribution'], e.target.value)}
                  style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="off">{t('projectProperties.llmAttributionOff', 'Off')}</option>
                  <option value="on">{t('projectProperties.llmAttributionOn', 'On')}</option>
                </select>
              </div>
            </div>
          </section>

          {/* Export Platforms */}
          <section>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>
              {t('projectProperties.export', 'Export Platforms')}
            </h2>
            <div className="space-y-3">
              {(['apple', 'google', 'spotify', 'acx', 'kobo'] as const).map((platform) => (
                <div key={platform} className="flex items-center gap-2">
                  <input
                    id={`platform-${platform}`}
                    type="checkbox"
                    checked={settings.export?.platforms?.[platform] ?? false}
                    onChange={(e) => updateSettings(['export', 'platforms', platform], e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor={`platform-${platform}`} className="text-sm capitalize" style={{ color: 'var(--text)' }}>
                    {platform === 'acx' ? 'ACX/Audible' : platform.charAt(0).toUpperCase() + platform.slice(1)}
                  </label>
                </div>
              ))}
            </div>
          </section>

          {/* Autosave status */}
          <div className="flex justify-end pt-2" style={{ minHeight: 24, color: 'var(--text-muted)' }}>
            {updateMutation.isPending ? t('projectProperties.saving', 'Saving...') : null}
          </div>
        </form>
      </div>
    </div>
  );
}
