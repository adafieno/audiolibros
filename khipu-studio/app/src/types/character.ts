export interface Character {
  id: string;
  name: string;
  description?: string;
  traits: CharacterTraits;
  frequency: number; // How often they appear in the manuscript
  chapters: string[]; // Chapter IDs where they appear
  quotes: string[]; // Sample quotes/dialogue
  isNarrator?: boolean;
  isMainCharacter?: boolean;
}

export interface CharacterTraits {
  gender?: "M" | "F" | "N";
  age?: "child" | "teen" | "adult" | "elderly";
  personality?: string[];
  speaking_style?: string[];
  accent?: string;
  register?: "formal" | "informal" | "neutral";
  energy?: "low" | "medium" | "high";
}

export interface CharacterDetection {
  characters: Character[];
  detectionMethod: "llm" | "regex" | "manual";
  confidence: number;
  timestamp: string;
  sourceChapters: string[];
}

export interface CharacterVoiceAssignment {
  characterId: string;
  voiceId: string;
  style?: string;
  confidence: number;
  prosodyAdjustments?: ProsodyAdjustments;
}

export interface ProsodyAdjustments {
  rate?: number; // -50 to 50
  pitch?: number; // -50 to 50
  volume?: number; // -50 to 50
  styleDegree?: number; // 0.1 to 1.0
}

export interface CharacterCasting {
  assignments: CharacterVoiceAssignment[];
  defaultNarrator?: CharacterVoiceAssignment;
  timestamp: string;
  version: number;
}
