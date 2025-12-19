import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { charactersApi, type Character, type VoiceAssignment, type CharacterUpdateRequest } from '../lib/api/characters';
import { voicesApi } from '../lib/api/voices';
import { projectsApi } from '../lib/projects';
import { Button } from '../components/Button';
import { ProgressBar } from '../components/ProgressBar';
import { useAudioCache } from '../hooks/useAudioCache';

export const Route = createFileRoute('/projects/$projectId/characters')({
  component: CharactersPage,
});

function CharactersPage() {
  const { t } = useTranslation();
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  
  // Fetch project
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  });
  
  // Fetch characters
  const { data: characters = [], isLoading } = useQuery({
    queryKey: ['characters', projectId],
    queryFn: () => charactersApi.getCharacters(projectId),
  });

  // Fetch available voices
  const { data: voiceInventory } = useQuery({
    queryKey: ['voices'],
    queryFn: () => voicesApi.getAvailableVoices(),
  });

  // Filter to only selected voices from casting module
  const selectedVoiceIds = (project?.settings?.voices as { selectedVoiceIds?: string[] } | undefined)?.selectedVoiceIds || [];
  const availableVoices = (voiceInventory?.voices || []).filter(
    voice => selectedVoiceIds.includes(voice.id)
  );

  const [editingFields, setEditingFields] = useState<Set<string>>(new Set());
  const [isDetecting, setIsDetecting] = useState(false);
  const [isAssigningVoices, setIsAssigningVoices] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState('');
  const [assignmentProgress, setAssignmentProgress] = useState('');
  const [playingCharacterId, setPlayingCharacterId] = useState<string | null>(null);
  
  // Audio cache for voice auditions
  const { isPlaying, isLoading: isLoadingAudio, playAudition, stopAudio } = useAudioCache();
  
  // Local state for characters to enable immediate updates
  const [localCharacters, setLocalCharacters] = useState<Character[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Sync local state with fetched characters
  useEffect(() => {
    if (characters.length > 0) {
      setLocalCharacters(characters);
    }
  }, [characters]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: () => charactersApi.createCharacter(projectId, { name: t('characters.newCharacter', 'New Character') }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters', projectId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ characterId, data }: { characterId: string; data: CharacterUpdateRequest }) =>
      charactersApi.updateCharacter(projectId, characterId, data),
    onMutate: async ({ characterId, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['characters', projectId] });
      
      // Snapshot the previous value
      const previousCharacters = queryClient.getQueryData(['characters', projectId]);
      
      // Optimistically update to the new value
      queryClient.setQueryData(['characters', projectId], (old: Character[] | undefined) => {
        if (!old) return old;
        return old.map((char: Character) => 
          char.id === characterId ? { ...char, ...data } : char
        );
      });
      
      return { previousCharacters };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousCharacters) {
        queryClient.setQueryData(['characters', projectId], context.previousCharacters);
      }
    },
    onSettled: () => {
      // Refetch after mutation completes (success or error)
      queryClient.invalidateQueries({ queryKey: ['characters', projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (characterId: string) =>
      charactersApi.deleteCharacter(projectId, characterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters', projectId] });
    },
  });

  // Check if all characters are assigned and update workflow completion
  useEffect(() => {
    if (!project || !localCharacters || localCharacters.length === 0 || hasUnsavedChanges) return;

    const allAssigned = localCharacters.every(c => c.voiceAssignment?.voiceId);
    const currentlyComplete = project.workflow_completed?.characters || false;

    // Update workflow completion if status changed
    if (allAssigned !== currentlyComplete) {
      projectsApi.update(projectId, {
        workflow_completed: {
          ...project.workflow_completed,
          characters: allAssigned,
        },
      })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['project', projectId] });
        })
        .catch(error => console.error('Failed to update workflow completion:', error));
    }
  }, [localCharacters, hasUnsavedChanges, project, projectId, queryClient]);

  // Detection handler
  const handleDetection = async () => {
    setIsDetecting(true);
    setDetectionProgress('Analyzing manuscript with AI...');
    try {
      const result = await charactersApi.detectCharacters(projectId);
      setDetectionProgress(`Found ${result.count} characters`);
      console.log(`Detected ${result.count} characters`);
      // Refresh the character list
      await queryClient.invalidateQueries({ queryKey: ['characters', projectId] });
      setTimeout(() => setDetectionProgress(''), 2000);
    } catch (error: unknown) {
      console.error('Character detection failed:', error);
      setDetectionProgress('');
      const errorMessage = error && typeof error === 'object' && 'response' in error 
        ? (error.response as { data?: { detail?: string } })?.data?.detail 
        : undefined;
      alert(errorMessage || 'Character detection failed. Please ensure chapters are uploaded and OpenAI API key is configured.');
    } finally {
      setIsDetecting(false);
    }
  };

  // Voice assignment handler
  const handleAssignVoices = async () => {
    setIsAssigningVoices(true);
    setAssignmentProgress('Matching characters to voices with AI...');
    try {
      const result = await charactersApi.assignVoices(projectId);
      setAssignmentProgress(`Assigned voices to ${result.count} characters`);
      console.log(`Assigned voices to ${result.count} characters`);
      // Refresh the character list
      await queryClient.invalidateQueries({ queryKey: ['characters', projectId] });
      
      // Auto-complete workflow if all characters have voice assignments
      const allAssigned = result.characters.every(c => c.voiceAssignment?.voiceId);
      if (allAssigned && project) {
        await projectsApi.update(projectId, {
          workflow_completed: {
            ...project.workflow_completed,
            characters: true,
          },
        });
        await queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      }
      
      setTimeout(() => setAssignmentProgress(''), 2000);
    } catch (error: unknown) {
      console.error('Voice assignment failed:', error);
      setAssignmentProgress('');
      const errorMessage = error && typeof error === 'object' && 'response' in error 
        ? (error.response as { data?: { detail?: string } })?.data?.detail 
        : undefined;
      alert(errorMessage || 'Voice assignment failed. Please ensure characters are detected first.');
    } finally {
      setIsAssigningVoices(false);
    }
  };

  // Audition handler
  const handleAudition = async (character: Character) => {
    if (!character.voiceAssignment?.voiceId || !project) {
      alert('Please assign a voice to this character first');
      return;
    }

    // Stop any currently playing audio
    if (isPlaying) {
      stopAudio();
      setPlayingCharacterId(null);
      return;
    }

    setPlayingCharacterId(character.id);

    try {
      // Use character description or a default text
      const auditionText = character.description || `Hola, soy ${character.name}`;
      
      // Find the voice object
      const voice = availableVoices.find(v => v.id === character.voiceAssignment?.voiceId);
      if (!voice) {
        throw new Error('Voice not found');
      }

      // Play audition using cached audio
      await playAudition({
        voice,
        config: project,
        text: auditionText,
        style: character.voiceAssignment.style,
        styledegree: character.voiceAssignment.styledegree,
        rate_pct: character.voiceAssignment.rate_pct ?? 0,
        pitch_pct: character.voiceAssignment.pitch_pct ?? 0,
        page: 'characters',
      });
      
      // Clear playing state when done
      setPlayingCharacterId(null);
    } catch (error: unknown) {
      console.error('Audition failed:', error);
      setPlayingCharacterId(null);
      const errorMessage = error instanceof Error ? error.message : 'Voice audition failed. Please ensure TTS is configured.';
      alert(errorMessage);
    }
  };

  // Inline editing helpers
  const startEditing = (fieldId: string) => {
    setEditingFields(prev => new Set(prev).add(fieldId));
  };

  const stopEditing = (fieldId: string) => {
    setEditingFields(prev => {
      const newSet = new Set(prev);
      newSet.delete(fieldId);
      return newSet;
    });
  };

  const isEditing = (fieldId: string) => editingFields.has(fieldId);

  const handleFieldUpdate = (characterId: string, field: string, value: string) => {
    updateMutation.mutate({ characterId, data: { [field]: value } });
    stopEditing(`${characterId}-${field}`);
  };

  const handleKeyPress = (
    event: React.KeyboardEvent,
    characterId: string,
    field: string,
    value: string
  ) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      handleFieldUpdate(characterId, field, value);
    } else if (event.key === 'Escape') {
      stopEditing(`${characterId}-${field}`);
    }
  };

  const handleVoiceAssignment = (characterId: string, voiceId: string) => {
    setLocalCharacters(prev => prev.map(char => {
      if (char.id === characterId) {
        return {
          ...char,
          voiceAssignment: {
            voiceId,
            style: undefined,
            styledegree: 1.0,
            rate_pct: 0,
            pitch_pct: 0,
            method: 'manual' as const,
          }
        };
      }
      return char;
    }));
    setHasUnsavedChanges(true);
  };

  const handleProsodyUpdate = (
    characterId: string,
    character: Character,
    updates: Partial<VoiceAssignment>
  ) => {
    if (!character.voiceAssignment) return;
    
    setLocalCharacters(prev => prev.map(char => {
      if (char.id === characterId) {
        return {
          ...char,
          voiceAssignment: {
            ...character.voiceAssignment!,
            ...updates,
          }
        };
      }
      return char;
    }));
    setHasUnsavedChanges(true);
  };
  
  const saveChanges = async () => {
    try {
      // Save all characters with voice assignments
      await Promise.all(
        localCharacters
          .filter(char => char.voiceAssignment)
          .map(char => 
            charactersApi.updateCharacter(projectId, char.id, {
              voiceAssignment: char.voiceAssignment
            })
          )
      );
      
      // Refresh data
      await queryClient.invalidateQueries({ queryKey: ['characters', projectId] });
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to save changes:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div style={{ color: 'var(--text-muted)' }}>{t('common.loading', 'Loading...')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="rounded-lg border shadow mb-6 p-6" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text)', margin: 0 }}>
                {t('characters.title', 'Characters')}
              </h1>
              {project?.workflow_completed?.characters && (
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
              {t('characters.description', 'Manage character voices and assignments')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
            <Button
              variant="primary"
              onClick={handleDetection}
              disabled={isDetecting}
              loading={isDetecting}
            >
              {t('characters.detectRefresh', 'Detect / Refresh')}
            </Button>
            
            {localCharacters.length > 0 && (
              <Button
                variant="primary"
                onClick={handleAssignVoices}
                disabled={isAssigningVoices || localCharacters.length === 0}
                loading={isAssigningVoices}
              >
                {t('characters.assignVoices', 'Assign Voices')}
              </Button>
            )}
            
            {hasUnsavedChanges && (
              <Button
                variant="primary"
                onClick={saveChanges}
              >
                {t('common.save', 'Save Changes')}
              </Button>
            )}
            
            <Button
              variant="primary"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              loading={createMutation.isPending}
            >
              {t('characters.add', 'Add Character')}
            </Button>
            
            {localCharacters.length > 0 && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const sorted = [...localCharacters].sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
                    setLocalCharacters(sorted);
                  }}
                  disabled={localCharacters.length === 0}
                >
                  {t('characters.sortByProbability', 'Sort by Probability')}
                </Button>
                
                <Button
                  variant="secondary"
                  onClick={() => {
                    const sorted = [...localCharacters].sort((a, b) => a.name.localeCompare(b.name));
                    setLocalCharacters(sorted);
                  }}
                  disabled={localCharacters.length === 0}
                >
                  {t('characters.sortAlphabetically', 'Sort Alphabetically')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Progress indicator */}
      {(detectionProgress || assignmentProgress) && (
        <ProgressBar 
          message={detectionProgress || assignmentProgress}
          currentStep={0}
          totalSteps={1}
        />
      )}

      {/* Characters grid */}
      {localCharacters.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-lg" style={{ borderColor: 'var(--border)' }}>
          <p className="text-lg mb-2" style={{ color: 'var(--text)' }}>
            {t('characters.noCharactersYet', 'No characters yet')}
          </p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            {t('characters.addManually', 'Click "Detect / Refresh" to automatically extract characters from your manuscript, or add them manually')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {localCharacters.map((character) => (
            <div
              key={character.id}
              className="border rounded-lg p-4 space-y-3"
              style={{
                background: 'var(--panel)',
                borderColor: 'var(--border)',
              }}
            >
              {/* Character name */}
              <div>
                {isEditing(`${character.id}-name`) ? (
                  <input
                    type="text"
                    defaultValue={character.name}
                    autoFocus
                    onBlur={(e) => handleFieldUpdate(character.id, 'name', e.target.value)}
                    onKeyDown={(e) =>
                      handleKeyPress(e, character.id, 'name', e.currentTarget.value)
                    }
                    className="w-full px-2 py-1 text-lg font-semibold border rounded"
                    style={{
                      background: 'var(--input)',
                      color: 'var(--text)',
                      borderColor: 'var(--border)',
                    }}
                  />
                ) : (
                  <h3
                    onClick={() => startEditing(`${character.id}-name`)}
                    className="text-lg font-semibold cursor-pointer"
                    style={{ color: 'var(--text)' }}
                    title={t('common.clickToEdit', 'Click to edit')}
                  >
                    {character.name || t('characters.unnamedCharacter', 'Unnamed Character')}
                  </h3>
                )}
              </div>

              {/* Probability */}
              {character.frequency !== undefined && character.frequency > 0 && (
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t('characters.probability', 'Probability')}: {character.frequency.toFixed(1)}%
                </div>
              )}

              {/* Basic traits */}
              {character.traits && (
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {character.traits.gender === 'M' ? t('casting.male', 'Male') : character.traits.gender === 'F' ? t('casting.female', 'Female') : t('casting.neutral', 'Neutral')} •{' '}
                  {character.traits.age || 'adult'}
                </div>
              )}

              {/* Description */}
              <div>
                {isEditing(`${character.id}-description`) ? (
                  <textarea
                    defaultValue={character.description || ''}
                    autoFocus
                    onBlur={(e) =>
                      handleFieldUpdate(character.id, 'description', e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        handleFieldUpdate(
                          character.id,
                          'description',
                          e.currentTarget.value
                        );
                      } else if (e.key === 'Escape') {
                        stopEditing(`${character.id}-description`);
                      }
                    }}
                    className="w-full px-2 py-1 text-sm border rounded min-h-[60px] resize-vertical"
                    style={{
                      background: 'var(--input)',
                      color: 'var(--text)',
                      borderColor: 'var(--border)',
                    }}
                    placeholder={t('characters.addDescriptionPlaceholder', 'Add description...')}
                  />
                ) : (
                  <p
                    onClick={() => startEditing(`${character.id}-description`)}
                    className="text-sm cursor-pointer min-h-[20px]"
                    style={{
                      color: character.description ? 'var(--text)' : 'var(--text-muted)',
                      fontStyle: character.description ? 'normal' : 'italic',
                    }}
                    title={t('common.clickToEdit', 'Click to edit')}
                  >
                    {character.description || t('characters.clickToAddDescription', 'Click to add description')}
                  </p>
                )}
              </div>

              {/* Voice Assignment */}
              <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
                <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  {t('characters.voiceAssignment', 'Voice Assignment')}
                </div>
                
                {/* Voice Selection */}
                <select
                  value={character.voiceAssignment?.voiceId || ''}
                  onChange={(e) => handleVoiceAssignment(character.id, e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border rounded"
                  style={{
                    background: 'var(--panel)',
                    color: 'var(--text)',
                    borderColor: 'var(--border)',
                  }}
                >
                  <option value="">{t('characters.selectVoice', 'Select Voice')}</option>
                  {availableVoices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.id} ({voice.gender}, {voice.locale})
                    </option>
                  ))}                </select>

                {/* Style Selection (if voice supports styles) */}
                {character.voiceAssignment?.voiceId && availableVoices.find(v => v.id === character.voiceAssignment?.voiceId)?.styles && availableVoices.find(v => v.id === character.voiceAssignment?.voiceId)!.styles.length > 0 && (
                    <select
                      value={character.voiceAssignment?.style || 'default'}
                      onChange={(e) =>
                        handleProsodyUpdate(character.id, character, {
                          style: e.target.value,
                        })
                      }
                      className="w-full px-2 py-1.5 text-sm border rounded"
                      style={{
                        background: 'var(--panel)',
                        color: 'var(--text)',
                        borderColor: 'var(--border)',
                      }}
                    >
                      <option value="">{t('characters.defaultStyle', 'Default Style')}</option>
                      {availableVoices.find(v => v.id === character.voiceAssignment?.voiceId)!.styles.map((style) => (
                        <option key={style} value={style}>
                          {style.charAt(0).toUpperCase() + style.slice(1)}
                        </option>
                      ))}
                    </select>
                )}

                {/* Prosody Controls - Side by Side */}
                {character.voiceAssignment?.voiceId && (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {/* Rate */}
                      <div>
                        <label style={{ color: 'var(--text-muted)' }}>
                          {t('characters.rate', 'Rate')}: {character.voiceAssignment.rate_pct ?? 0}%
                        </label>
                        <input
                          type="range"
                          min="-50"
                          max="50"
                          value={character.voiceAssignment.rate_pct ?? 0}
                          onChange={(e) => {
                            const value = parseInt(e.target.value, 10);
                            handleProsodyUpdate(character.id, character, {
                              rate_pct: value,
                            });
                          }}
                          className="w-full"
                        />
                      </div>

                      {/* Pitch */}
                      <div>
                        <label style={{ color: 'var(--text-muted)' }}>
                          {t('characters.pitch', 'Pitch')}: {character.voiceAssignment.pitch_pct ?? 0}%
                        </label>
                        <input
                          type="range"
                          min="-50"
                          max="50"
                          value={character.voiceAssignment.pitch_pct ?? 0}
                          onChange={(e) => {
                            const value = parseInt(e.target.value, 10);
                            handleProsodyUpdate(character.id, character, {
                              pitch_pct: value,
                            });
                          }}
                          className="w-full"
                        />
                      </div>
                    </div>

                    {/* Style Degree - only show if style is selected */}
                    {character.voiceAssignment?.style && (
                      <div className="text-xs mt-2">
                        <label style={{ color: 'var(--text-muted)' }}>
                          {t('characters.intensity', 'Intensity')}: {Math.round((character.voiceAssignment?.styledegree || 0.6) * 100)}%
                        </label>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={Math.round((character.voiceAssignment?.styledegree || 0.6) * 100)}
                          onChange={(e) => {
                            const value = parseInt(e.target.value, 10) / 100;
                            handleProsodyUpdate(character.id, character, {
                              styledegree: value,
                            });
                          }}
                          className="w-full"
                        />
                      </div>
                    )}

                    {/* Method indicator */}
                    <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                      {t('characters.method', 'Method')}: {character.voiceAssignment?.method === 'llm_auto' ? t('characters.methodAutoAssigned', 'Auto-assigned') : t('characters.methodManual', 'Manual')}
                    </div>
                  </>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                {character.voiceAssignment?.voiceId && (
                  <Button
                    variant="secondary"
                    size="compact"
                    onClick={() => handleAudition(character)}
                    disabled={isLoadingAudio && playingCharacterId === character.id}
                    loading={isLoadingAudio && playingCharacterId === character.id}
                  >
                    {isPlaying && playingCharacterId === character.id 
                      ? t('characters.stop', '⏹ Stop')
                      : t('characters.audition', '▶ Audition')
                    }
                  </Button>
                )}
                <Button
                  variant="danger"
                  size="compact"
                  onClick={() => deleteMutation.mutate(character.id)}
                  disabled={deleteMutation.isPending}
                  loading={deleteMutation.isPending}
                >
                  {t('characters.remove', 'Remove')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
