import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { voicesApi, type Voice, type VoiceInventory } from '../lib/api/voices';
import { projectsApi } from '../lib/projects';
import { setStepCompleted } from '../store/project';
import {
  getLanguageFromLocale,
  getAvailableLanguages,
  filterVoicesByEngine,
  filterVoicesByLanguage,
  filterVoicesByGender,
  filterVoicesByLocale,
} from '../lib/voice-utils';

export const Route = createFileRoute('/projects/$projectId/casting')({
  component: CastingPage,
});

function CastingPage() {
  const { t } = useTranslation();
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();

  // State
  const [selectedVoices, setSelectedVoices] = useState<Set<string>>(new Set());
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [selectedLocales, setSelectedLocales] = useState<string[]>([]);
  const [auditioningVoices, setAuditioningVoices] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [audioCache] = useState(new Map<string, string>());

  // Queries
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.getById(projectId),
  });

  const { data: voiceInventory, isLoading: isLoadingVoices } = useQuery({
    queryKey: ['voices'],
    queryFn: () => voicesApi.getAvailableVoices(),
  });

  const { data: projectVoiceSettings } = useQuery({
    queryKey: ['projectVoices', projectId],
    queryFn: () => voicesApi.getProjectVoiceSettings(projectId),
  });

  // Initialize selected voices from project settings
  useEffect(() => {
    if (projectVoiceSettings?.selectedVoiceIds) {
      setSelectedVoices(new Set(projectVoiceSettings.selectedVoiceIds));
    }
  }, [projectVoiceSettings]);

  // Initialize selected languages with project language
  useEffect(() => {
    if (project?.language && selectedLanguages.length === 0) {
      const primaryLang = getLanguageFromLocale(project.language);
      setSelectedLanguages([primaryLang]);
    }
  }, [project, selectedLanguages.length]);

  // Auto-save mutation
  const saveVoicesMutation = useMutation({
    mutationFn: (voiceIds: string[]) =>
      voicesApi.updateProjectVoiceSettings(projectId, {
        selectedVoiceIds: voiceIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectVoices', projectId] });
    },
  });

  // Auto-save when selection changes (debounced)
  useEffect(() => {
    if (selectedVoices.size === 0) return;

    const timeoutId = setTimeout(() => {
      saveVoicesMutation.mutate(Array.from(selectedVoices));
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [selectedVoices]); // eslint-disable-line react-hooks/exhaustive-deps

  // Complete workflow mutation
  const completeWorkflowMutation = useMutation({
    mutationFn: async () => {
      const updated = await projectsApi.update(projectId, {
        workflow_completed: {
          ...project?.workflow_completed,
          casting: true,
        },
      });
      setStepCompleted('casting', true);
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      setMessage(t('casting.completed', 'Casting completed!'));
      setTimeout(() => setMessage(''), 3000);
    },
  });

  // Handlers
  const handleAudition = async (voice: Voice) => {
    if (auditioningVoices.has(voice.id)) return;

    setAuditioningVoices(prev => new Set(prev).add(voice.id));

    try {
      // Check cache first
      let audioUrl = audioCache.get(voice.id);
      
      if (!audioUrl) {
        // Don't pass text - let backend select locale-specific text
        const blob = await voicesApi.auditionVoice(projectId, voice.id);
        audioUrl = URL.createObjectURL(blob);
        audioCache.set(voice.id, audioUrl);
      }

      const audio = new Audio(audioUrl);
      audio.play();

      audio.onended = () => {
        setAuditioningVoices(prev => {
          const newSet = new Set(prev);
          newSet.delete(voice.id);
          return newSet;
        });
      };

      audio.onerror = () => {
        setMessage(t('casting.auditionFailed', 'Failed to play audio'));
        setTimeout(() => setMessage(''), 5000);
        setAuditioningVoices(prev => {
          const newSet = new Set(prev);
          newSet.delete(voice.id);
          return newSet;
        });
      };
    } catch (error) {
      console.error('Audition error:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : t('casting.auditionFailed', 'Audition failed');
      setMessage(errorMessage);
      setTimeout(() => setMessage(''), 5000);
      setAuditioningVoices(prev => {
        const newSet = new Set(prev);
        newSet.delete(voice.id);
        return newSet;
      });
    }
  };

  const handleVoiceToggle = (voiceId: string) => {
    const newSelected = new Set(selectedVoices);
    if (newSelected.has(voiceId)) {
      newSelected.delete(voiceId);
    } else {
      newSelected.add(voiceId);
    }
    setSelectedVoices(newSelected);
  };

  const handleSelectAll = (voices: Voice[]) => {
    const newSelected = new Set(selectedVoices);
    voices.forEach(voice => newSelected.add(voice.id));
    setSelectedVoices(newSelected);
  };

  const handleDeselectAll = (voices: Voice[]) => {
    const newSelected = new Set(selectedVoices);
    voices.forEach(voice => newSelected.delete(voice.id));
    setSelectedVoices(newSelected);
  };

  if (isLoadingVoices) {
    return (
      <div className="p-6" style={{ color: 'var(--text)' }}>
        {t('casting.loading', 'Loading voices...')}
      </div>
    );
  }

  if (!voiceInventory || !project) {
    return (
      <div className="p-6" style={{ color: 'var(--text)' }}>
        {t('casting.loadError', 'Failed to load casting data')}
      </div>
    );
  }

  // Get project's TTS engine from settings
  const projectEngine = project.settings?.tts?.engine?.name || 'azure';

  // Filter voices
  let availableVoices = filterVoicesByEngine(voiceInventory.voices, projectEngine);
  availableVoices = filterVoicesByLanguage(availableVoices, selectedLanguages);
  availableVoices = filterVoicesByGender(availableVoices, selectedGenders);
  availableVoices = filterVoicesByLocale(availableVoices, selectedLocales);

  // Get filter options
  const availableLanguageOptions = getAvailableLanguages(
    filterVoicesByEngine(voiceInventory.voices, projectEngine)
  );
  const availableGenders = [
    ...new Set(
      filterVoicesByEngine(voiceInventory.voices, projectEngine).map(v => v.gender)
    ),
  ];
  const availableLocales = [
    ...new Set(
      filterVoicesByLanguage(
        filterVoicesByEngine(voiceInventory.voices, projectEngine),
        selectedLanguages
      ).map(v => v.locale)
    ),
  ].sort();

  return (
    <div className="p-6">
      {/* Header */}
      <div
        className="rounded-lg border shadow mb-6 p-6"
        style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
      >
        <div className="flex justify-between items-start">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)', margin: 0 }}>
              {t('casting.title', 'Casting')}
            </h1>
            {project?.workflow_completed?.casting && (
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 500,
                  backgroundColor: 'var(--success)',
                  color: 'white',
                }}
              >
                ✓ {t('workflow.completed', 'Completed')}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {/* Language Selector */}
            <select
              value=""
              onChange={e => {
                if (e.target.value && !selectedLanguages.includes(e.target.value)) {
                  setSelectedLanguages([...selectedLanguages, e.target.value]);
                }
                e.target.value = '';
              }}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                backgroundColor: 'var(--panel)',
                color: 'var(--text)',
                fontSize: '14px',
              }}
            >
              <option value="">
                {t('casting.addLanguage', '+ Add Language')}
              </option>
              {availableLanguageOptions
                .filter(lang => !selectedLanguages.includes(lang))
                .map(lang => (
                  <option key={lang} value={lang}>
                    {t(`languages.${lang}`, lang.toUpperCase())}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <p className="text-sm mt-2" style={{ color: 'var(--text-muted)', margin: '8px 0 0 0' }}>
          {t('casting.description', 'Select voices for characters and narration.')}
        </p>
      </div>

      {/* Voice Count and Filters */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>
              {t('casting.availableVoices', 'Available Voices')} ({availableVoices.length})
            </h3>
            
            {/* Filter Tags */}
            {(selectedLanguages.length > 0 || selectedGenders.length > 0 || selectedLocales.length > 0) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                {selectedLanguages.map(lang => (
                  <span
                    key={`lang-${lang}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 8px',
                      backgroundColor: 'var(--accent)',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                  >
                    {t(`languages.${lang}`, lang.toUpperCase())}
                    <button
                      onClick={() => setSelectedLanguages(selectedLanguages.filter(l => l !== lang))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '14px',
                        padding: '0',
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {selectedGenders.map(gender => (
                  <span
                    key={`gender-${gender}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 8px',
                      backgroundColor: 'var(--accent)',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                  >
                    {gender === 'M'
                      ? t('casting.male', 'Male')
                      : gender === 'F'
                      ? t('casting.female', 'Female')
                      : t('casting.neutral', 'Neutral')}
                    <button
                      onClick={() => setSelectedGenders(selectedGenders.filter(g => g !== gender))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '14px',
                        padding: '0',
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {selectedLocales.map(locale => (
                  <span
                    key={`locale-${locale}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 8px',
                      backgroundColor: 'var(--accent)',
                      color: 'white',
                      borderRadius: '4px',
                      fontSize: '12px',
                    }}
                  >
                    {locale}
                    <button
                      onClick={() => setSelectedLocales(selectedLocales.filter(l => l !== locale))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '14px',
                        padding: '0',
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filters Row */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginBottom: '16px' }}>
        {/* Gender Filter */}
        <select
          value=""
          onChange={e => {
            if (e.target.value && !selectedGenders.includes(e.target.value)) {
              setSelectedGenders([...selectedGenders, e.target.value]);
            }
            e.target.value = '';
          }}
          style={{
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            backgroundColor: 'var(--panel)',
            color: 'var(--text)',
            fontSize: '14px',
          }}
        >
          <option value="">
            {t('casting.filterGender', 'Filter Gender')}
          </option>
          {availableGenders
            .filter(gender => !selectedGenders.includes(gender))
            .map(gender => (
              <option key={gender} value={gender}>
                {gender === 'M'
                  ? t('casting.male', 'Male')
                  : gender === 'F'
                  ? t('casting.female', 'Female')
                  : t('casting.neutral', 'Neutral')}
              </option>
            ))}
        </select>

        {/* Locale Filter */}
        <select
          value=""
          onChange={e => {
            if (e.target.value && !selectedLocales.includes(e.target.value)) {
              setSelectedLocales([...selectedLocales, e.target.value]);
            }
            e.target.value = '';
          }}
          style={{
            padding: '8px 12px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            backgroundColor: 'var(--panel)',
            color: 'var(--text)',
            fontSize: '14px',
          }}
        >
          <option value="">
            {t('casting.filterLocale', 'Filter Locale')}
          </option>
          {availableLocales
            .filter(locale => !selectedLocales.includes(locale))
            .map(locale => (
              <option key={locale} value={locale}>
                {locale}
              </option>
            ))}
        </select>
        
        <button
          onClick={() => handleSelectAll(availableVoices)}
          style={{
            padding: '8px 16px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            backgroundColor: 'var(--panel)',
            color: 'var(--text)',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          {t('casting.selectAll', 'Select All')}
        </button>

        <button
          onClick={() => handleDeselectAll(availableVoices)}
          style={{
            padding: '8px 16px',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            backgroundColor: 'var(--panel)',
            color: 'var(--text)',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          {t('casting.deselectAll', 'Deselect All')}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div
          style={{
            padding: '16px',
            marginBottom: '16px',
            borderRadius: '8px',
            backgroundColor: message.toLowerCase().includes('requires') || message.toLowerCase().includes('configure')
              ? 'var(--warning-subtle)'
              : 'var(--error-subtle)',
            color: message.toLowerCase().includes('requires') || message.toLowerCase().includes('configure')
              ? 'var(--warning)'
              : 'var(--error)',
            fontSize: '14px',
            border: '1px solid',
            borderColor: message.toLowerCase().includes('requires') || message.toLowerCase().includes('configure')
              ? 'var(--warning)'
              : 'var(--error)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
            <span style={{ fontSize: '18px', lineHeight: '1' }}>
              {message.toLowerCase().includes('requires') || message.toLowerCase().includes('configure') ? '⚠️' : '❌'}
            </span>
            <div style={{ flex: 1 }}>
              {message}
            </div>
          </div>
        </div>
      )}

      {/* Voice Grid */}
      <div style={{ marginBottom: '24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text)', margin: 0 }}>
            {t('casting.voicesTitle', 'Available Voices')} ({availableVoices.length})
          </h3>
          {selectedVoices.size > 0 && (
            <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              {t('casting.selectedCount', '{{count}} voices selected', {
                count: selectedVoices.size,
              })}
            </span>
          )}
        </div>

        {availableVoices.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {t('casting.noVoicesForEngine', 'No voices available for the selected filters')}
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
            }}
          >
            {availableVoices.map(voice => (
              <div
                key={voice.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '16px',
                  backgroundColor: selectedVoices.has(voice.id)
                    ? 'var(--accent-subtle)'
                    : 'var(--panel)',
                }}
              >
                <label
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={selectedVoices.has(voice.id)}
                    onChange={() => handleVoiceToggle(voice.id)}
                    style={{ marginTop: '2px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500', marginBottom: '4px', color: 'var(--text)' }}>
                      {voice.id}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      {voice.locale} •{' '}
                      {voice.gender === 'M'
                        ? t('casting.male', 'Male')
                        : voice.gender === 'F'
                        ? t('casting.female', 'Female')
                        : t('casting.neutral', 'Neutral')}{' '}
                      • {t(`casting.age.${voice.age_hint}`, voice.age_hint)}
                    </div>
                    {voice.description && (
                      <div
                        style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}
                      >
                        {voice.description}
                      </div>
                    )}
                    {voice.styles.length > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {t('casting.styles', 'Styles')}: {voice.styles.join(', ')}
                      </div>
                    )}
                    {voice.accent_tags.length > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {t('casting.accents', 'Accents')}: {voice.accent_tags.join(', ')}
                      </div>
                    )}

                    {/* Audition Button */}
                    <div style={{ marginTop: '12px' }}>
                      <button
                        onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAudition(voice);
                        }}
                        disabled={auditioningVoices.has(voice.id)}
                        className="px-3 py-1 rounded text-sm"
                        style={{
                          backgroundColor: 'var(--accent)',
                          color: 'white',
                          border: 'none',
                          cursor: auditioningVoices.has(voice.id) ? 'wait' : 'pointer',
                          opacity: auditioningVoices.has(voice.id) ? 0.6 : 1,
                        }}
                      >
                        {auditioningVoices.has(voice.id)
                          ? t('casting.audition.loading', 'Playing...')
                          : t('casting.audition.button', '▶ Audition')}
                      </button>
                    </div>
                  </div>
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

