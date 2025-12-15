import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { voicesApi, type Voice, type VoiceInventory } from '../lib/api/voices';
import { projectsApi } from '../lib/projects';
import { setStepCompleted } from '../store/project';
import { Button } from '../components/Button';
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
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [auditioningVoices, setAuditioningVoices] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [audioCache] = useState(new Map<string, string>());
  const [isInitialized, setIsInitialized] = useState(false);

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

  // Auto-update language filters based on selected voices
  useEffect(() => {
    if (!voiceInventory || !project) return;
    
    // Get book's default language
    const bookLanguage = project.language ? getLanguageFromLocale(project.language) : null;
    
    // Get languages of all selected voices
    const selectedVoiceLanguages = new Set<string>();
    selectedVoices.forEach(voiceId => {
      const voice = voiceInventory.voices.find(v => v.id === voiceId);
      if (voice) {
        const voiceLang = getLanguageFromLocale(voice.locale);
        selectedVoiceLanguages.add(voiceLang);
      }
    });
    
    // Build new language list: book language + languages with selections + manually added languages
    const newLanguages = new Set(selectedLanguages);
    
    // Always include book language
    if (bookLanguage) {
      newLanguages.add(bookLanguage);
    }
    
    // Add languages that have selected voices
    selectedVoiceLanguages.forEach(lang => newLanguages.add(lang));
    
    const newLanguageArray = Array.from(newLanguages);
    
    // Only update if changed to avoid infinite loops
    if (JSON.stringify(newLanguageArray.sort()) !== JSON.stringify(selectedLanguages.sort())) {
      setSelectedLanguages(newLanguageArray);
    }
  }, [selectedVoices, voiceInventory, project]); // Don't include selectedLanguages in deps

  // Initialize selected voices and languages from project settings
  useEffect(() => {
    // Only initialize once
    if (isInitialized) return;
    if (!project || !projectVoiceSettings) return;
    
    console.log('Initializing from project settings:', projectVoiceSettings);
    
    if (projectVoiceSettings.selectedVoiceIds) {
      console.log('Loading voices:', projectVoiceSettings.selectedVoiceIds);
      setSelectedVoices(new Set(projectVoiceSettings.selectedVoiceIds));
    }
    
    if (projectVoiceSettings.selectedLanguages && projectVoiceSettings.selectedLanguages.length > 0) {
      console.log('Loading languages:', projectVoiceSettings.selectedLanguages);
      setSelectedLanguages(projectVoiceSettings.selectedLanguages);
    } else if (project.language) {
      // Only set default project language if no saved languages
      const primaryLang = getLanguageFromLocale(project.language);
      console.log('No saved languages, using project default:', primaryLang);
      setSelectedLanguages([primaryLang]);
    }
    
    setIsInitialized(true);
  }, [projectVoiceSettings, project, isInitialized]);

  // Auto-save mutation
  const saveVoicesMutation = useMutation({
    mutationFn: ({ voiceIds, languages }: { voiceIds: string[], languages: string[] }) => {
      console.log('Mutation starting with:', { voiceIds, languages });
      return voicesApi.updateProjectVoiceSettings(projectId, {
        selectedVoiceIds: voiceIds,
        selectedLanguages: languages,
      });
    },
    onSuccess: (data) => {
      console.log('Save successful, response:', data);
      // Don't invalidate query here to prevent re-initialization race condition
      // The local state is already the source of truth
    },
    onError: (error) => {
      console.error('Save failed:', error);
    },
  });

  // Auto-save when selection changes (debounced)
  useEffect(() => {
    // Don't save during initial load
    if (!isInitialized) return;
    
    console.log('Auto-save triggered:', {
      voiceCount: selectedVoices.size,
      languages: selectedLanguages
    });
    
    // Save even if arrays are empty (user might have cleared selections)
    const timeoutId = setTimeout(() => {
      console.log('Saving voice settings...');
      saveVoicesMutation.mutate({
        voiceIds: Array.from(selectedVoices),
        languages: selectedLanguages
      });
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [selectedVoices, selectedLanguages, isInitialized]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-complete when at least one voice from book's main language is selected
  useEffect(() => {
    if (!project?.language || !voiceInventory || !isInitialized) return;
    
    const bookLanguage = getLanguageFromLocale(project.language);
    
    // Check if at least one voice from book's language is selected
    const hasBookLanguageVoice = Array.from(selectedVoices).some(voiceId => {
      const voice = voiceInventory.voices.find(v => v.id === voiceId);
      if (!voice) return false;
      const voiceLang = getLanguageFromLocale(voice.locale);
      return voiceLang === bookLanguage;
    });
    
    // Auto-complete if condition is met and not already completed
    if (hasBookLanguageVoice && !project.workflow_completed?.casting) {
      completeWorkflowMutation.mutate();
    }
  }, [selectedVoices, project, voiceInventory, isInitialized]); // eslint-disable-line react-hooks/exhaustive-deps

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
      console.log('Deselecting voice:', voiceId);
      newSelected.delete(voiceId);
    } else {
      console.log('Selecting voice:', voiceId);
      newSelected.add(voiceId);
    }
    console.log('New voice count:', newSelected.size);
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
        {t('casting.loadError', 'Failed to load voice casting data')}
      </div>
    );
  }

  // Get project's TTS engine from settings
  const projectEngine = project.settings?.tts?.engine?.name || 'azure';

  // Filter voices
  let availableVoices = filterVoicesByEngine(voiceInventory.voices, projectEngine);
  
  // When showing selected only, don't filter by language - show all selected voices
  if (!showSelectedOnly) {
    availableVoices = filterVoicesByLanguage(availableVoices, selectedLanguages);
  }
  
  availableVoices = filterVoicesByGender(availableVoices, selectedGenders);
  availableVoices = filterVoicesByLocale(availableVoices, selectedLocales);
  
  // Filter by selection status
  if (showSelectedOnly) {
    availableVoices = availableVoices.filter(v => selectedVoices.has(v.id));
  }

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
  
  // Get book's default language
  const bookLanguage = project.language ? getLanguageFromLocale(project.language) : null;
  
  // Get languages that have selected voices (cannot be removed)
  const languagesWithSelections = new Set<string>();
  selectedVoices.forEach(voiceId => {
    const voice = voiceInventory.voices.find(v => v.id === voiceId);
    if (voice) {
      const voiceLang = getLanguageFromLocale(voice.locale);
      languagesWithSelections.add(voiceLang);
    }
  });
  
  // Function to check if a language can be removed
  const canRemoveLanguage = (lang: string) => {
    return lang !== bookLanguage && !languagesWithSelections.has(lang);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div
        className="rounded-lg border shadow mb-6 p-6"
        style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text)', margin: 0 }}>
                {t('casting.title', 'Voice Casting')}
              </h1>
              {project?.workflow_completed?.casting && (
                <span style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  padding: '0.25rem 0.75rem', 
                  borderRadius: '9999px', 
                  fontSize: '0.875rem', 
                  fontWeight: 500,
                  boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
                  background: '#22c55e', 
                  color: '#052e12' 
                }}>
                  {t('project.completed', 'Completed')}
                </span>
              )}
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)', margin: 0 }}>
              {t('casting.description', 'Select voices for characters and narration.')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
            {/* Select/Deselect All Buttons */}
            <Button
              variant="secondary"
              onClick={() => handleSelectAll(availableVoices)}
            >
              {t('casting.selectAll', 'Select All')}
            </Button>

            <Button
              variant="secondary"
              onClick={() => handleDeselectAll(availableVoices)}
            >
              {t('casting.deselectAll', 'Deselect All')}
            </Button>
            
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
            
            {/* Language Selector */}
            <select
              value=""
              onChange={e => {
                if (e.target.value && !selectedLanguages.includes(e.target.value)) {
                  console.log('Adding language:', e.target.value);
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
      </div>

      {/* Language Filter Tags */}
      {(selectedLanguages.length > 0 || selectedGenders.length > 0 || selectedLocales.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
          {selectedLanguages.map(lang => {
            const isRemovable = canRemoveLanguage(lang);
            return (
              <span
                key={`lang-${lang}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 12px',
                  backgroundColor: isRemovable ? 'var(--accent)' : 'var(--success)',
                  color: 'white',
                  borderRadius: '16px',
                  fontSize: '13px',
                  fontWeight: 500,
                }}
              >
                {t(`languages.${lang}`, lang.toUpperCase())}
                {isRemovable && (
                  <button
                    onClick={() => setSelectedLanguages(selectedLanguages.filter(l => l !== lang))}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '0',
                      lineHeight: '1',
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })}
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            {/* Show Selected Toggle */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                color: 'var(--text)',
              }}
            >
              <input
                type="checkbox"
                checked={showSelectedOnly}
                onChange={(e) => setShowSelectedOnly(e.target.checked)}
                style={{
                  width: '16px',
                  height: '16px',
                  cursor: 'pointer',
                }}
              />
              {t('casting.showSelectedOnly', 'Show selected only')} ({selectedVoices.size})
            </label>
            {selectedVoices.size > 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                {t('casting.selectedCount', '{{count}} voices selected', {
                  count: selectedVoices.size,
                })}
              </span>
            )}
          </div>
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
                      <Button
                        variant="primary"
                        size="compact"
                        onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAudition(voice);
                        }}
                        disabled={auditioningVoices.has(voice.id)}
                        loading={auditioningVoices.has(voice.id)}
                      >
                        {t('casting.audition.button', '▶ Audition')}
                      </Button>
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

