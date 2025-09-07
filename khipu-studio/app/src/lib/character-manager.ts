// Character management types and utilities
import type { Character } from "../types/character";

export interface CharacterEdit {
  name: string;
  type?: "protagonist" | "secondary" | "minor" | "narrator";
  importance?: "primary" | "secondary" | "minor";
  gender?: "male" | "female" | "non-binary" | "unknown";
  age?: "child" | "teen" | "young_adult" | "adult" | "elderly" | "unknown";
  description?: string;
  personality?: string[];
  speaking_style?: string[];
  confidence?: number;
  has_dialogue?: boolean;
  dialogue_frequency?: "low" | "medium" | "high";
  frequency?: number;
  accent?: string;
  custom_added?: boolean;
}

export interface CharacterModifications {
  removed_characters: string[];
  added_characters: CharacterEdit[];
  modified_characters: Record<string, Partial<CharacterEdit>>;
}

export interface CharacterManagerAPI {
  listCharacters(): Promise<Character[]>;
  addCharacter(character: CharacterEdit): Promise<void>;
  removeCharacter(characterName: string): Promise<void>;
  modifyCharacter(characterName: string, modifications: Partial<CharacterEdit>): Promise<void>;
  restoreCharacter(characterName: string): Promise<void>;
  runDetection(projectRoot: string): Promise<Character[]>;
}

/**
 * Character management API - integrates with Python backend
 * For now, this uses mock implementations until we set up proper Python integration
 */
export class CharacterManager implements CharacterManagerAPI {
  constructor(private projectRoot: string) {}

  async listCharacters(): Promise<Character[]> {
    // TODO: Implement proper Python integration
    // For now, use the existing character detection function
    const { detectCharacters } = await import("./characters");
    const detection = await detectCharacters(this.projectRoot);
    return detection.characters;
  }

  async addCharacter(character: CharacterEdit): Promise<void> {
    // TODO: Implement Python integration
    console.log("Adding character:", character);
    // For now, this would need to be handled via the existing character system
  }

  async removeCharacter(characterName: string): Promise<void> {
    // TODO: Implement Python integration  
    console.log("Removing character:", characterName);
  }

  async modifyCharacter(characterName: string, modifications: Partial<CharacterEdit>): Promise<void> {
    // TODO: Implement Python integration
    console.log("Modifying character:", characterName, "with:", modifications);
    throw new Error("Character modification not yet implemented");
  }

  async restoreCharacter(characterName: string): Promise<void> {
    // TODO: Implement Python integration
    console.log("Restoring character:", characterName);
  }

  async runDetection(projectRoot: string): Promise<Character[]> {
    // Use the existing detection function
    const { detectCharacters } = await import("./characters");
    const detection = await detectCharacters(projectRoot);
    return detection.characters;
  }
}

// Utility functions for character management
export function createCharacterEdit(character: Character): CharacterEdit {
  return {
    name: character.name,
    type: character.isNarrator ? "narrator" : character.isMainCharacter ? "protagonist" : "secondary",
    importance: character.isMainCharacter ? "primary" : "secondary",
    gender: character.traits.gender === "M" ? "male" : character.traits.gender === "F" ? "female" : "unknown",
    age: character.traits.age,
    description: character.description,
    personality: character.traits.personality,
    speaking_style: character.traits.speaking_style,
    frequency: character.frequency / 100,
    accent: character.traits.accent,
    dialogue_frequency: character.frequency > 75 ? "high" : character.frequency > 40 ? "medium" : "low"
  };
}

export function convertToCharacter(edit: CharacterEdit, index: number): Character {
  return {
    id: edit.name.toLowerCase().replace(/\s+/g, '_') || `char_${index}`,
    name: edit.name,
    description: edit.description || `Character: ${edit.name}`,
    traits: {
      gender: edit.gender === 'male' ? 'M' : edit.gender === 'female' ? 'F' : 'N',
      age: edit.age === 'young_adult' ? 'adult' : edit.age as "elderly" | "adult" | "child" | "teen" || 'adult',
      register: edit.type === 'narrator' ? 'formal' : 'informal',
      energy: edit.age === 'elderly' ? 'low' : edit.age === 'child' ? 'high' : 'medium',
      personality: edit.personality || ['neutral'],
      speaking_style: edit.speaking_style || ['conversational'],
      accent: edit.accent || 'neutral',
    },
    frequency: Math.round((edit.frequency || 0.5) * 100),
    chapters: ['ch01', 'ch02', 'ch03', 'ch04', 'ch05', 'ch06', 'ch07', 'ch08', 'ch09', 'ch10', 'ch11'],
    quotes: [],
    isNarrator: edit.type === 'narrator',
    isMainCharacter: edit.type === 'protagonist' || edit.importance === 'primary',
  };
}
