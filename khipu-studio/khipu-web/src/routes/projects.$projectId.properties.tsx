import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../lib/projects';
import { setStepCompleted } from '../store/project';
import { useTranslation } from 'react-i18next';
import { TextInput } from '../components/TextInput';
import { Select } from '../components/Select';
import { Button } from '../components/Button';

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
        <TextInput
          type={showPassword ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{ 
            paddingRight: '36px',
            width: '100%'
          }}
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
      azure?: {
        apiKey?: string;
        endpoint?: string;
        apiVersion?: string;
      };
    };
    storage?: {
      azure?: {
        accountName?: string;
        accessKey?: string;
        containerName?: string;
        endpoint?: string;
      };
    };
  };
};

function ProjectPropertiesPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  });

  // Local state for settings
  const [settings, setSettings] = useState<ProjectSettings>({});
  const [projectStatus, setProjectStatus] = useState<'draft' | 'in_progress' | 'review' | 'completed' | 'published' | 'archived'>('draft');
  const [error, setError] = useState('');
  const initializedRef = useRef(false);
  const autosaveTimer = useRef<number | null>(null);
  const lastSavedHashRef = useRef<string>('');
  const tRef = useRef(t);
  const mutateRef = useRef<(data: { settings: ProjectSettings }) => void>(() => {});

  // Load settings and status from project when available
  useEffect(() => {
    if (project?.settings && !initializedRef.current) {
      initializedRef.current = true;
      setTimeout(() => {
        setSettings(project.settings as ProjectSettings);
        setProjectStatus(project.status || 'draft');
      }, 0);
    }
  }, [project]);

  const updateMutation = useMutation({
    mutationFn: (data: { settings: ProjectSettings; workflow_completed?: Record<string, boolean>; status?: string }) => projectsApi.update(projectId, data),
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

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate({ to: '/projects' });
    },
  });

  const handleStatusChange = (newStatus: 'draft' | 'in_progress' | 'review' | 'completed' | 'published' | 'archived') => {
    setProjectStatus(newStatus);
    updateMutation.mutate({ settings, status: newStatus });
  };

  const handleDeleteProject = () => {
    if (window.confirm(t('projectProperties.confirmDelete', 'Are you sure you want to delete this project? This action cannot be undone.'))) {
      deleteMutation.mutate();
    }
  };

  // Stable refs to avoid effect dependency warnings
  useEffect(() => { tRef.current = t; }, [t]);
  useEffect(() => { mutateRef.current = updateMutation.mutate; }, [updateMutation.mutate]);

  // Autosave with debounce and payload hashing
  useEffect(() => {
    if (!initializedRef.current) return;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      setError('');
      const platforms = settings.export?.platforms || {};
      const hasPlatform = Object.values(platforms).some(Boolean);
      const ttsConfigured = settings.tts?.engine?.name === 'azure' && !!settings.tts?.engine?.voice;
      const llmConfigured = ['openai','azure-openai','anthropic'].includes(settings.llm?.engine?.name || '');
      const isComplete = hasPlatform && ttsConfigured && llmConfigured;
      
      const payload = { 
        settings,
        workflow_completed: {
          ...(project?.workflow_completed || {}),
          project: isComplete
        }
      };
      const hash = JSON.stringify(payload);
      if (hash !== lastSavedHashRef.current) {
        lastSavedHashRef.current = hash;
        mutateRef.current(payload);
      }
      setStepCompleted('project', isComplete);
    }, 700);
    return () => { if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current); };
  }, [settings, project?.workflow_completed]);

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
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)', margin: 0 }}>
              {t('projectProperties.title', 'Project Properties')}
            </h1>
            {isComplete && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium shadow" style={{ background: '#22c55e', color: '#052e12' }}>
                {t('project.completed', 'Completed')}
              </span>
            )}
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)', margin: 0 }}>
            {t('projectProperties.description', 'Configure technical settings for TTS, LLM, and export options.')}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg p-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--error)', border: '1px solid' }}>
          <p style={{ color: 'var(--error)' }}>{error}</p>
        </div>
      )}

      {/* Two-column layout with all sections styled as panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        
        {/* LEFT COLUMN: Project Status & Management, Orchestration, Packaging, Pronunciation Map */}
        <div className="space-y-6">
          
          {/* Project Status & Management */}
          <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border p-6">
            <div className="flex items-center justify-between mb-4 gap-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                {t('projectProperties.statusManagement', 'Project Status & Management')}
              </h2>
              
              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="compact"
                  onClick={() => {
                    if (projectStatus === 'review') {
                      // Check if workflow is complete to determine next status
                      const workflow = project?.workflow_completed || {};
                      const keyStepsComplete = ['manuscript', 'book', 'characters', 'casting', 'orchestration', 'production']
                        .every(step => workflow[step] === true);
                      handleStatusChange(keyStepsComplete ? 'completed' : 'in_progress');
                    } else {
                      handleStatusChange('review');
                    }
                  }}
                  disabled={updateMutation.isPending || !!project?.archived_at}
                >
                  {projectStatus === 'review' 
                    ? t('projectProperties.reviewCompleted', 'Review Completed')
                    : t('projectProperties.setForReview', 'Set for Review')
                  }
                </Button>
                <Button
                  variant="primary"
                  size="compact"
                  onClick={() => handleStatusChange('archived')}
                  disabled={updateMutation.isPending || !!project?.archived_at}
                >
                  {t('projectProperties.archive', 'Archive')}
                </Button>
                <Button
                  variant="danger"
                  size="compact"
                  onClick={handleDeleteProject}
                  disabled={deleteMutation.isPending || !!project?.archived_at}
                >
                  {deleteMutation.isPending ? t('projectProperties.deleting', 'Deleting...') : t('projectProperties.deleteProject', 'Delete')}
                </Button>
              </div>
            </div>
            
            <div>
              {/* Current Status Display */}
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  {t('projectProperties.projectStatus', 'Project Status')}:
                </span>
                <span 
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                  style={{ 
                    backgroundColor: projectStatus === 'archived' ? 'var(--error-subtle)' :
                                    projectStatus === 'review' ? '#fbbf24' :
                                    projectStatus === 'completed' ? '#22c55e' :
                                    projectStatus === 'published' ? '#3b82f6' :
                                    'var(--border)',
                    color: projectStatus === 'archived' ? 'var(--error)' :
                          projectStatus === 'review' ? '#78350f' :
                          projectStatus === 'completed' ? '#052e12' :
                          projectStatus === 'published' ? '#ffffff' :
                          'var(--text)'
                  }}
                >
                  {projectStatus === 'draft' && t('projects.statusDraft', 'Draft')}
                  {projectStatus === 'in_progress' && t('projects.statusInProgress', 'In Progress')}
                  {projectStatus === 'review' && t('projects.statusReview', 'Review')}
                  {projectStatus === 'completed' && t('projects.statusCompleted', 'Completed')}
                  {projectStatus === 'published' && t('projects.statusPublished', 'Published')}
                  {projectStatus === 'archived' && t('projects.statusArchived', 'Archived')}
                </span>
              </div>
              {project?.archived_at && (
                <p className="text-sm mb-2" style={{ color: 'var(--warning)' }}>
                  ⚠️ {t('projects.archivedReadOnly', 'This project is archived and read-only.')}
                </p>
              )}
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('projectProperties.statusActionsHint', 'Set to Review for QA or Archive to make read-only. Delete permanently removes the project.')}
              </p>
            </div>
          </div>

          {/* Orchestration (Pause Configuration) */}
          <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border p-6">
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>
              {t('project.planning', 'Orchestration')}
            </h3>
            <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
              {t('project.pauseUnitsInfo', 'Pause values are in milliseconds.')}
            </p>
            <div className="grid grid-cols-3 gap-2">
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.sentencePause', 'Sentence Pause')}
                </div>
                <TextInput
                  type="number"
                  value={String(settings.pauses?.sentenceMs ?? 500)}
                  onChange={(e) => updateSettings(['pauses', 'sentenceMs'], parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
              </label>
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.paragraphPause', 'Paragraph Pause')}
                </div>
                <TextInput
                  type="number"
                  value={String(settings.pauses?.paragraphMs ?? 1000)}
                  onChange={(e) => updateSettings(['pauses', 'paragraphMs'], parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
              </label>
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.chapterPause', 'Chapter Pause')}
                </div>
                <TextInput
                  type="number"
                  value={String(settings.pauses?.chapterMs ?? 3000)}
                  onChange={(e) => updateSettings(['pauses', 'chapterMs'], parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
              </label>
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.commaPause', 'Comma Pause')}
                </div>
                <TextInput
                  type="number"
                  value={String(settings.pauses?.commaMs ?? 300)}
                  onChange={(e) => updateSettings(['pauses', 'commaMs'], parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
              </label>
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.colonPause', 'Colon Pause')}
                </div>
                <TextInput
                  type="number"
                  value={String(settings.pauses?.colonMs ?? 400)}
                  onChange={(e) => updateSettings(['pauses', 'colonMs'], parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
              </label>
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.semicolonPause', 'Semi-colon Pause')}
                </div>
                <TextInput
                  type="number"
                  value={String(settings.pauses?.semicolonMs ?? 350)}
                  onChange={(e) => updateSettings(['pauses', 'semicolonMs'], parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
              </label>
            </div>
          </div>

          {/* Packaging */}
          <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border p-6">
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
          </div>

          {/* Pronunciation Map */}
          <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border p-6">
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>
              {t('project.pronunciationMap', 'Pronunciation Map')}
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              {t('project.pronunciationMapInfo', 'Customize pronunciations using IPA. Use "Suggest IPA" for automated suggestions.')}
            </p>
            <div className="space-y-2">
              {Object.entries(settings.pronunciationMap || {}).map(([word, ipa]) => (
                <div key={word} className="flex gap-2 items-center">
                  <TextInput
                    type="text"
                    value={word}
                    disabled
                    size="compact"
                    style={{ width: '128px', opacity: 0.7 }}
                  />
                  <TextInput
                    type="text"
                    value={ipa}
                    onChange={(e) => {
                      const newMap = { ...settings.pronunciationMap, [word]: e.target.value };
                      updateSettings(['pronunciationMap'], newMap);
                    }}
                    size="compact"
                    style={{ width: '192px' }}
                    placeholder={t('project.ipaPlaceholder', 'IPA notation')}
                  />
                  <Button
                    variant="secondary"
                    size="compact"
                    onClick={async () => {
                      try {
                        console.log('[IPA] Requesting IPA for word:', word);
                        const result = await projectsApi.suggestIpa(projectId, word);
                        console.log('[IPA] Received result:', result);
                        if (result.success && result.ipa) {
                          const newMap = { ...settings.pronunciationMap, [word]: result.ipa };
                          updateSettings(['pronunciationMap'], newMap);
                          if (result.examples && result.examples.length > 0) {
                            alert(`${t('project.suggestIpaConfirm', 'Suggested examples:')} ${result.examples.join(', ')}`);
                          }
                        } else {
                          console.log('[IPA] Request failed or no IPA returned:', result);
                          alert(result.error || t('project.suggestIpaError', 'Could not suggest IPA. Please enter manually.'));
                        }
                      } catch (err) {
                        console.error('[IPA] Error calling suggestIpa:', err);
                        alert(t('project.suggestIpaError', 'Could not suggest IPA. Please enter manually.'));
                      }
                    }}
                  >
                    {t('project.suggestIPA', 'Suggest IPA')}
                  </Button>
                  <Button
                    variant="danger"
                    size="compact"
                    onClick={() => {
                      const newMap = { ...settings.pronunciationMap };
                      delete newMap[word];
                      updateSettings(['pronunciationMap'], newMap);
                    }}
                  >
                    {t('project.removeWord', 'Remove')}
                  </Button>
                </div>
              ))}
              <div className="flex gap-2 items-center">
                <TextInput
                  type="text"
                  id="newPronWord"
                  size="compact"
                  style={{ width: '128px' }}
                  placeholder={t('project.wordPlaceholder', 'Word')}
                />
                <Button
                  variant="primary"
                  size="compact"
                  onClick={() => {
                    const input = document.getElementById('newPronWord') as HTMLInputElement;
                    const word = input?.value?.trim();
                    if (word && !(settings.pronunciationMap || {})[word]) {
                      const newMap = { ...(settings.pronunciationMap || {}), [word]: '' };
                      updateSettings(['pronunciationMap'], newMap);
                      input.value = '';
                    }
                  }}
                >
                  {t('project.addWord', 'Add Word')}
                </Button>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: LLM, TTS, Azure Blob Storage */}
        <div className="space-y-6">

          {/* LLM Engine */}
          <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border p-6">
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text)' }}>
              {t('project.llm', 'LLM Engine')}
            </h3>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.llmEngine', 'Engine')}
                </div>
                <Select
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
                  style={{ width: '100%' }}
                >
                  <option value="openai">OpenAI</option>
                  <option value="azure-openai">Azure OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                </Select>
              </label>
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.llmModel', 'Deployment')}
                </div>
                <TextInput
                  type="text"
                  value={settings.llm?.engine?.model || ''}
                  onChange={(e) => updateSettings(['llm', 'engine', 'model'], e.target.value)}
                  style={{ width: '100%' }}
                  placeholder="gpt-4o"
                />
              </label>
              {settings.llm?.engine?.name === 'azure-openai' && (
                <PasswordField
                  label={t('project.azureOpenaiApiKey', 'Azure OpenAI API Key')}
                  value={settings.creds?.llm?.azure?.apiKey || ''}
                  onChange={(value) => updateSettings(['creds', 'llm', 'azure', 'apiKey'], value)}
                  placeholder="••••••••"
                />
              )}
              {settings.llm?.engine?.name === 'openai' && (
                <PasswordField
                  label={t('project.openaiApiKey', 'OpenAI API Key')}
                  value={settings.creds?.llm?.openai?.apiKey || ''}
                  onChange={(value) => updateSettings(['creds', 'llm', 'openai', 'apiKey'], value)}
                  placeholder="sk-..."
                />
              )}
            </div>
            
            {/* OpenAI Credentials */}
            {settings.llm?.engine?.name === 'openai' && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <label>
                  <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                    {t('project.openaiBaseUrl', 'OpenAI Base URL (optional)')}
                  </div>
                  <TextInput
                    type="text"
                    value={settings.creds?.llm?.openai?.baseUrl || ''}
                    onChange={(e) => updateSettings(['creds', 'llm', 'openai', 'baseUrl'], e.target.value)}
                    style={{ width: '100%' }}
                    placeholder="https://api.openai.com/v1"
                  />
                </label>
              </div>
            )}
            
            {/* Azure OpenAI Credentials */}
            {settings.llm?.engine?.name === 'azure-openai' && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <label>
                  <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                    {t('project.azureOpenaiEndpoint', 'Azure OpenAI Endpoint')}
                  </div>
                  <TextInput
                    type="text"
                    value={settings.creds?.llm?.azure?.endpoint || ''}
                    onChange={(e) => updateSettings(['creds', 'llm', 'azure', 'endpoint'], e.target.value)}
                    style={{ width: '100%' }}
                    placeholder="https://your-resource.openai.azure.com"
                  />
                </label>
              </div>
            )}
          </div>

          {/* TTS Engine */}
          <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border p-6">
            <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text)' }}>
              {t('project.tts', 'TTS Engine')}
            </h3>
            <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
              {t('project.ttsCachingInfo', 'TTS caching is always enabled for optimal performance.')}
            </p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.ttsEngine', 'Engine')}
                </div>
                <Select
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
                  style={{ width: '100%' }}
                >
                  <option value="azure">Azure</option>
                  <option value="elevenlabs">ElevenLabs</option>
                  <option value="openai">OpenAI TTS</option>
                </Select>
              </label>
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.ttsVoice', 'Default Voice')}
                </div>
                <TextInput
                  type="text"
                  value={settings.tts?.engine?.voice || ''}
                  onChange={(e) => updateSettings(['tts', 'engine', 'voice'], e.target.value)}
                  style={{ width: '100%' }}
                  placeholder="es-PE-CamilaNeural"
                />
              </label>
              <label>
                <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                  {t('project.azureRegion', 'Azure Region')}
                </div>
                <TextInput
                  type="text"
                  value={settings.creds?.tts?.azure?.region || ''}
                  onChange={(e) => updateSettings(['creds', 'tts', 'azure', 'region'], e.target.value)}
                  style={{ width: '100%' }}
                  placeholder="eastus"
                />
              </label>
            </div>
            
            {/* Azure TTS Credentials */}
            {settings.tts?.engine?.name === 'azure' && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <PasswordField
                  label={t('project.azureTtsKey', 'Azure TTS Key')}
                  value={settings.creds?.tts?.azure?.key || ''}
                  onChange={(value) => updateSettings(['creds', 'tts', 'azure', 'key'], value)}
                  placeholder="••••••••"
                />
              </div>
            )}
          </div>

          {/* Azure Blob Storage Configuration */}
          <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border p-6">
            <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--text)' }}>
              {t('project.azureBlobStorage', 'Azure Blob Storage')}
            </h3>
            <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
              {t('project.blobStorageInfo', 'Configure Azure Blob Storage for voice caching and audio file storage.')}
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <label>
                  <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                    {t('project.azureStorageAccountName', 'Storage Account Name')}
                  </div>
                  <TextInput
                    type="text"
                    value={settings.creds?.storage?.azure?.accountName || ''}
                    onChange={(e) => updateSettings(['creds', 'storage', 'azure', 'accountName'], e.target.value)}
                    style={{ width: '100%' }}
                    placeholder="mystorageaccount"
                  />
                </label>
                <label>
                  <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                    {t('project.azureStorageContainerName', 'Container Name')}
                  </div>
                  <TextInput
                    type="text"
                    value={settings.creds?.storage?.azure?.containerName || ''}
                    onChange={(e) => updateSettings(['creds', 'storage', 'azure', 'containerName'], e.target.value)}
                    style={{ width: '100%' }}
                    placeholder="audio-cache"
                  />
                </label>
                <label>
                  <div className="text-sm mb-1" style={{ color: 'var(--text)' }}>
                    {t('project.azureStorageEndpoint', 'Endpoint (optional)')}
                  </div>
                  <TextInput
                    type="text"
                    value={settings.creds?.storage?.azure?.endpoint || ''}
                    onChange={(e) => updateSettings(['creds', 'storage', 'azure', 'endpoint'], e.target.value)}
                    style={{ width: '100%' }}
                    placeholder="https://mystorageaccount.blob.core.windows.net"
                  />
                </label>
              </div>
              <PasswordField
                label={t('project.azureStorageAccessKey', 'Storage Access Key')}
                value={settings.creds?.storage?.azure?.accessKey || ''}
                onChange={(value) => updateSettings(['creds', 'storage', 'azure', 'accessKey'], value)}
                placeholder="••••••••"
              />
            </div>
          </div>

        </div>
      </div>

      {/* Autosave status */}
      <div className="flex justify-end pt-2" style={{ minHeight: 24, color: 'var(--text-muted)' }}>
        {updateMutation.isPending ? t('projectProperties.saving', 'Saving...') : null}
      </div>
    </div>
  );
}
