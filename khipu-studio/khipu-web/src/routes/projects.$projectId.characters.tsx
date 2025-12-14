import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { charactersApi, type Character, type VoiceAssignment } from '../lib/api/characters';
import { voicesApi } from '../lib/api/voices';

export const Route = createFileRoute('/projects/$projectId/characters')({
  component: CharactersPage,
});

function CharactersPage() {
  const { t } = useTranslation();
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  
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

  const availableVoices = voiceInventory?.voices || [];

  // State for inline editing
  const [editingFields, setEditingFields] = useState<Set<string>>(new Set());

  // Mutations
  const createMutation = useMutation({
    mutationFn: () => charactersApi.createCharacter(projectId, { name: t('characters.newCharacter', 'New Character') }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['characters', projectId] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ characterId, data }: { characterId: string; data: any }) =>
      charactersApi.updateCharacter(projectId, characterId, data),
    onSuccess: () => {
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

  const handleFieldUpdate = (characterId: string, field: string, value: any) => {
    updateMutation.mutate({ characterId, data: { [field]: value } });
    stopEditing(`${characterId}-${field}`);
  };

  const handleKeyPress = (
    event: React.KeyboardEvent,
    characterId: string,
    field: string,
    value: any
  ) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      handleFieldUpdate(characterId, field, value);
    } else if (event.key === 'Escape') {
      stopEditing(`${characterId}-${field}`);
    }
  };

  const handleVoiceAssignment = (characterId: string, voiceId: string) => {
    const voiceAssignment: VoiceAssignment = {
      voiceId,
      style: undefined,
      styledegree: 1.0,
      rate_pct: 0,
      pitch_pct: 0,
      method: 'manual',
    };
    updateMutation.mutate({ characterId, data: { voiceAssignment } });
  };

  const handleProsodyUpdate = (
    characterId: string,
    character: Character,
    updates: Partial<VoiceAssignment>
  ) => {
    if (!character.voiceAssignment) return;
    
    const voiceAssignment: VoiceAssignment = {
      ...character.voiceAssignment,
      ...updates,
    };
    updateMutation.mutate({ characterId, data: { voiceAssignment } });
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
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)', margin: 0 }}>
            {t('characters.title', 'Characters')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)', margin: 0 }}>
            {t('characters.description', 'Manage character voices and assignments')}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mb-6 flex gap-2">
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="px-4 py-2 rounded-md font-medium transition-colors disabled:opacity-50"
          style={{
            background: 'var(--accent)',
            color: 'var(--text)',
          }}
        >
          {createMutation.isPending ? t('common.adding', 'Adding...') : t('characters.add', 'Add Character')}
        </button>
        
        {/* Coming soon buttons */}
        <button
          disabled
          className="px-4 py-2 rounded-md font-medium transition-colors opacity-50 cursor-not-allowed"
          style={{
            background: 'var(--muted)',
            color: 'var(--text-muted)',
          }}
          title="Character detection is available in the desktop version"
        >
          {t('characters.detectRefresh', 'Detect / Refresh')}
        </button>
      </div>

      {/* Characters grid */}
      {characters.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-lg" style={{ borderColor: 'var(--border)' }}>
          <p className="text-lg mb-2" style={{ color: 'var(--text)' }}>
            {t('characters.noCharactersYet', 'No characters yet')}
          </p>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            {t('characters.addManually', 'Add characters manually using the button above')}
          </p>
          <p className="text-xs px-8" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Note: Automatic character detection from manuscript is available in the desktop version of Khipu Studio
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {characters.map((character) => (
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

              {/* Frequency */}
              {character.frequency !== undefined && character.frequency > 0 && (
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {t('characters.frequency', 'Frequency')}: {character.frequency.toFixed(1)}%
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
                  ))}
                </select>

                {/* Prosody Controls */}
                {character.voiceAssignment?.voiceId && (
                  <div className="space-y-2 pt-2">
                    {/* Rate */}
                    <div>
                      <label className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {t('characters.rate', 'Rate')}: {character.voiceAssignment.rate_pct || 0}%
                      </label>
                      <input
                        type="range"
                        min="-50"
                        max="50"
                        value={character.voiceAssignment.rate_pct || 0}
                        onChange={(e) =>
                          handleProsodyUpdate(character.id, character, {
                            rate_pct: parseInt(e.target.value),
                          })
                        }
                        className="w-full"
                      />
                    </div>

                    {/* Pitch */}
                    <div>
                      <label className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {t('characters.pitch', 'Pitch')}: {character.voiceAssignment.pitch_pct || 0}%
                      </label>
                      <input
                        type="range"
                        min="-50"
                        max="50"
                        value={character.voiceAssignment.pitch_pct || 0}
                        onChange={(e) =>
                          handleProsodyUpdate(character.id, character, {
                            pitch_pct: parseInt(e.target.value),
                          })
                        }
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => deleteMutation.mutate(character.id)}
                  disabled={deleteMutation.isPending}
                  className="px-3 py-1.5 text-sm rounded transition-colors disabled:opacity-50"
                  style={{
                    background: 'var(--error)',
                    color: 'white',
                  }}
                >
                  {t('characters.remove', 'Remove')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
