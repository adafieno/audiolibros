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

export interface CharacterVoiceMapping {
  character: string;
  voiceId: string;
  style?: string;
  role?: string;
}

export interface CastingConfig {
  selectedVoices: string[]; // Array of voice IDs
  characterMappings: CharacterVoiceMapping[];
  defaultNarratorVoice?: string;
}
