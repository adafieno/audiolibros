import api from '../api';

export interface CharacterTraits {
  gender?: 'M' | 'F' | 'N';
  age?: 'child' | 'teen' | 'adult' | 'elderly';
  personality?: string[];
  speaking_style?: string[];
}

export interface VoiceAssignment {
  voiceId: string;
  style?: string;
  styledegree?: number;
  rate_pct?: number;
  pitch_pct?: number;
  method?: 'manual' | 'llm_auto';
}

export interface Character {
  id: string;
  name: string;
  description?: string;
  frequency?: number;
  traits?: CharacterTraits;
  quotes?: string[];
  isNarrator?: boolean;
  isMainCharacter?: boolean;
  voiceAssignment?: VoiceAssignment;
}

export interface CharacterCreateRequest {
  name?: string;
  description?: string;
  traits?: CharacterTraits;
}

export interface CharacterUpdateRequest {
  name?: string;
  description?: string;
  frequency?: number;
  traits?: CharacterTraits;
  quotes?: string[];
  isNarrator?: boolean;
  isMainCharacter?: boolean;
  voiceAssignment?: VoiceAssignment;
}

export const charactersApi = {
  // Get all characters for a project
  getCharacters: async (projectId: string): Promise<Character[]> => {
    const response = await api.get(`/projects/${projectId}/characters`);
    return response.data;
  },

  // Create a new character
  createCharacter: async (
    projectId: string,
    data: CharacterCreateRequest
  ): Promise<Character> => {
    const response = await api.post(`/projects/${projectId}/characters`, data);
    return response.data;
  },

  // Update a character
  updateCharacter: async (
    projectId: string,
    characterId: string,
    data: CharacterUpdateRequest
  ): Promise<Character> => {
    const response = await api.put(
      `/projects/${projectId}/characters/${characterId}`,
      data
    );
    return response.data;
  },

  // Delete a character
  deleteCharacter: async (
    projectId: string,
    characterId: string
  ): Promise<void> => {
    await api.delete(`/projects/${projectId}/characters/${characterId}`);
  }
};
