import type { Character, CharacterDetection, CharacterCasting, CharacterVoiceAssignment } from "../types/character";
import type { Voice } from "../types/voice";

/**
 * Detect characters from manuscript using saved results or Python script fallback
 */
export async function detectCharacters(projectRoot: string): Promise<CharacterDetection> {
  console.log("🔍 STARTING CHARACTER DETECTION");
  console.log("📁 Project root received:", projectRoot);
  
  // Quick test: if no project root, return minimal detection
  if (!projectRoot) {
    console.log("❌ No project root provided, returning minimal detection");
    return {
      characters: [{
        id: "no_project",
        name: "No Project Loaded",
        description: "Please load a project first",
        traits: {
          gender: "N",
          age: "adult",
          register: "formal",
          energy: "medium",
          personality: ["neutral"],
          speaking_style: ["informative"],
          accent: "neutral"
        },
        frequency: 100,
        chapters: [],
        quotes: [],
        isNarrator: false,
        isMainCharacter: false
      }],
      detectionMethod: "manual",
      confidence: 0,
      timestamp: new Date().toISOString(),
      sourceChapters: []
    };
  }

  try {
    console.log("🔍 Starting character detection...");
    console.log("🔄 Loading character data from project files...");
    
    // Try to load from characters.json (Python detection results)
    try {
      console.log(`🔍 Loading from: ${projectRoot}/dossier/characters.json`);
      const charactersResult = await window.khipu!.call("fs:read", {
        projectRoot,
        relPath: "dossier/characters.json",
        json: true,
      });
      
      if (Array.isArray(charactersResult) && charactersResult.length > 0) {
        console.log(`✅ Loaded ${charactersResult.length} characters from your project`);
        
        // Convert to frontend format
        const formattedCharacters: Character[] = charactersResult.map((char: {
          name?: string;
          type?: string;
          importance?: string;
          gender?: string;
          age?: string;
          description?: string;
          personality?: string[];
          speaking_style?: string[];
          frequency?: number;
          accent?: string;
        }, index: number) => {
          const mapAge = (age: string): "elderly" | "adult" | "child" | "teen" => {
            switch (age?.toLowerCase()) {
              case 'elderly': return 'elderly';
              case 'child': return 'child';
              case 'teenager': case 'teen': return 'teen';
              case 'young_adult': case 'adult': 
              default: return 'adult';
            }
          };

          const mapGender = (gender: string): "M" | "F" | "N" => {
            switch (gender?.toLowerCase()) {
              case 'male': return 'M';
              case 'female': return 'F';
              default: return 'N';
            }
          };

          return {
            id: char.name?.toLowerCase().replace(/\s+/g, '_') || `char_${index}`,
            name: char.name || `Character ${index + 1}`,
            description: char.description || `Character: ${char.name}`,
            traits: {
              gender: mapGender(char.gender || 'unknown'),
              age: mapAge(char.age || 'adult'),
              register: char.type === 'narrator' ? 'formal' : 'informal',
              energy: char.age === 'elderly' ? 'low' : char.age === 'child' ? 'high' : 'medium',
              personality: char.personality || ['neutral'],
              speaking_style: char.speaking_style || ['conversational'],
              accent: char.accent || 'neutral',
            },
            frequency: Math.round((char.frequency || 0.5) * 100),
            chapters: [], // We don't have chapter info in this format
            quotes: [],
            isNarrator: char.type === 'narrator',
            isMainCharacter: char.type === 'protagonist' || char.importance === 'primary',
          };
        });

        const detection: CharacterDetection = {
          characters: formattedCharacters,
          detectionMethod: "llm",
          confidence: 0.99,
          timestamp: new Date().toISOString(),
          sourceChapters: [],
        };
        
        console.log("✅ Character detection complete!");
        return detection;
      }
    } catch (error) {
      console.warn("⚠️ Could not load characters.json:", error);
    }
    
    // If no characters.json, need to run fresh detection
    console.log("🔄 No characters.json found. Need to run Python detection.");
    console.log("💡 Instructions:");
    console.log("1. Open terminal in project root");  
    console.log("2. Run: python py/dossier/build_from_manuscript.py");
    console.log("3. Click 'Detect Characters' again");
    
    // Return empty detection to show instructions
    return {
      characters: [],
      detectionMethod: "manual",
      confidence: 0,
      timestamp: new Date().toISOString(),
      sourceChapters: [],
    };

  } catch (error) {
    console.error("❌ Error in character detection:", error);
    return {
      characters: [],
      detectionMethod: "manual",
      confidence: 0,
      timestamp: new Date().toISOString(),
      sourceChapters: [],
    };
  }
}

/**
 * Save character detection results to project
 */
export async function saveCharacterDetection(projectRoot: string, detection: CharacterDetection): Promise<void> {
  try {
    await window.khipu!.call("fs:write", {
      projectRoot,
      relPath: "dossier/character_detection.json",
      json: true,
      content: detection,
    });
  } catch (error) {
    console.warn("Could not save character detection:", error);
  }
}

/**
 * Load existing character detection from project
 */
export async function loadCharacterDetection(projectRoot: string): Promise<CharacterDetection | null> {
  try {
    const result = await window.khipu!.call("fs:read", {
      projectRoot,
      relPath: "dossier/characters.json",
      json: true,
    });
    
    return result as CharacterDetection | null;
  } catch (error) {
    console.warn("No existing character detection found:", error);
    return null;
  }
}

/**
 * Trigger a fresh character detection by running the Python script
 */
export async function refreshCharacterDetection(projectRoot: string): Promise<CharacterDetection> {
  console.log("🔄 Refreshing character detection...");
  
  // Clear any cached detection first
  try {
    await window.khipu!.call("fs:write", {
      projectRoot,
      relPath: "dossier/character_detection.json",
      json: true,
      content: null,
    });
  } catch {
    // File might not exist, that's ok
  }
  
  // Show instructions to user
  console.log("📋 To refresh character detection, run this command in terminal:");
  console.log(`cd ${projectRoot}`);
  console.log("python py/dossier/build_from_manuscript.py");
  console.log("Then click 'Detect Characters' again to load the fresh results.");
  
  // For now, show a message to the user
  alert("To refresh character detection:\n\n1. Open terminal in project root\n2. Run: python py/dossier/build_from_manuscript.py\n3. Click 'Detect Characters' again\n\nThis will be automated in a future update.");
  
  // Return current detection (this will prompt user to run the script)
  return detectCharacters(projectRoot);
}

// Rest of the character management functions would go here...
// For now, I'll just add the essential ones

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function loadCharacterCasting(_projectRoot: string): Promise<CharacterCasting> {
  // Implementation for loading character casting
  return { assignments: [], timestamp: new Date().toISOString(), version: 1 };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getCharacterCasting(_projectRoot: string): Promise<CharacterCasting> {
  // Implementation for character casting
  return { assignments: [], timestamp: new Date().toISOString(), version: 1 };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function saveCharacterCasting(_projectRoot: string, _casting: CharacterCasting): Promise<void> {
  // Implementation for saving character casting
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function generateVoiceAssignments(_projectRoot: string, _characters: Character[], _voices: Voice[]): Promise<CharacterVoiceAssignment[]> {
  // Implementation for generating voice assignments
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function filterVoicesForCharacter(_character: Character, _voices: Voice[]): Voice[] {
  // Implementation for filtering voices for character
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function calculateVoiceCompatibility(_character: Character, _voice: Voice): number {
  // Implementation for calculating voice compatibility
  return 0.5;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function testCharacterVoice(_character: Character, _voice: Voice, _config?: unknown): Promise<{ success: boolean; audioUrl?: string; error?: string }> {
  // Implementation for testing character voice
  console.log("Testing voice for character:", _character.name);
  return { success: false, error: "Voice testing not implemented yet" };
}
