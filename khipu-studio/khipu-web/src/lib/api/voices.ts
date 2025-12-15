import api from '../api';
import comprehensiveVoices from '../../data/comprehensive-azure-voices.json';

export type TtsEngine = "azure" | "elevenlabs" | "openai" | "google" | "local";

export interface Voice {
  id: string;
  engine: TtsEngine;
  locale: string;
  gender: "M" | "F" | "N"; // Male, Female, Neutral
  age_hint: "child" | "teen" | "adult" | "elderly";
  accent_tags: string[];
  styles: string[];
  description?: string;
}

export interface VoiceInventory {
  voices: Voice[];
  selectedVoiceIds?: string[]; // Track which voices are selected for the project
}

export interface ProjectVoiceSettings {
  selectedVoiceIds: string[];
  selectedLanguages?: string[];
  ttsEngine?: TtsEngine;
}

export const voicesApi = {
  // Get available voices (comprehensive inventory)
  getAvailableVoices: async (): Promise<VoiceInventory> => {
    try {
      const response = await api.get(`/voices`);
      // If backend returns empty voices, use local inventory as fallback
      if (!response.data.voices || response.data.voices.length === 0) {
        console.log('Backend returned empty voices, using local inventory');
        return comprehensiveVoices as VoiceInventory;
      }
      return response.data;
    } catch (error: unknown) {
      // If endpoint doesn't exist yet, use local comprehensive voice inventory
      console.warn('Voices API not available, using local inventory:', error);
      return comprehensiveVoices as VoiceInventory;
    }
  },

  // Get project's voice settings
  getProjectVoiceSettings: async (projectId: string): Promise<ProjectVoiceSettings> => {
    try {
      const response = await api.get(`/projects/${projectId}/voices`);
      return response.data;
    } catch (error: unknown) {
      // Fallback to localStorage if endpoint doesn't exist
      console.warn('Project voices API not available, using localStorage:', error);
      const stored = localStorage.getItem(`project_${projectId}_voices`);
      if (stored) {
        return JSON.parse(stored);
      }
      return { selectedVoiceIds: [] };
    }
  },

  // Update project's voice settings
  updateProjectVoiceSettings: async (
    projectId: string,
    settings: Partial<ProjectVoiceSettings>
  ): Promise<ProjectVoiceSettings> => {
    try {
      const response = await api.put(`/projects/${projectId}/voices`, settings);
      return response.data;
    } catch (error: unknown) {
      // Fallback to localStorage if endpoint doesn't exist
      console.warn('Project voices API not available, using localStorage:', error);
      const stored = localStorage.getItem(`project_${projectId}_voices`);
      const current = stored ? JSON.parse(stored) : { selectedVoiceIds: [] };
      const updated = { ...current, ...settings };
      localStorage.setItem(`project_${projectId}_voices`, JSON.stringify(updated));
      return updated;
    }
  },

  // Audition a voice (generate preview audio)
  auditionVoice: async (
    projectId: string,
    voiceId: string,
    text?: string,
    ratePct?: number,
    pitchPct?: number
  ): Promise<Blob> => {
    try {
      const response = await api.post(
        `/projects/${projectId}/voices/${voiceId}/audition`,
        { text, rate_pct: ratePct, pitch_pct: pitchPct },
        { responseType: 'blob' }
      );
      return response.data;
    } catch (error: unknown) {
      // If endpoint doesn't exist, throw error to show message to user
      console.warn('Voice audition API not available:', error);
      throw new Error('Voice audition requires TTS backend. Please configure Azure TTS credentials in the server to enable audio preview.');
    }
  }
};
