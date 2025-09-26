import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Character, CharacterDetection, Voice, VoiceAssignment } from "../types/character";
import { loadVoiceInventory } from "../lib/voice";
import { loadProjectConfig } from "../lib/config";
import { costTrackingService } from "../lib/cost-tracking-service";

interface RawDetectedCharacter {
  id?: string;
  name?: string;
  display_name?: string;
  bio?: string;
  description?: string;
  frequency?: number;
  gender?: string;
  age?: string;
  type?: string;
  personality?: string[];
  speaking_style?: string[];
  accent?: string;
  register?: string;
  energy?: string;
  chapters?: string[];
  quotes?: string[];
  isNarrator?: boolean;
  isMainCharacter?: boolean;
  voiceAssignment?: {
    voiceId: string;
    style?: string;
    styledegree?: number;
    rate_pct?: number;
    pitch_pct?: number;
    confidence?: number;
    method?: string;
  };
}

interface SavedCharacter {
  id?: string;
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
  confidence?: number;
  has_dialogue?: boolean;
  dialogue_frequency?: string;
  voiceAssignment?: {
    voiceId: string;
    style?: string;
    styledegree?: number;
    rate_pct?: number;
    pitch_pct?: number;
    confidence?: number;
    method?: string;
  };
}
interface DetectionIPCResult {
  ok: boolean;
  characters?: RawDetectedCharacter[];
  error?: string;
}

interface WindowKhipu {
  khipu?: {
    characters?: {
      detect: (r: string) => Promise<DetectionIPCResult>
    };
    call?: (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  }
}
import { useProject } from "../store/project";

interface RawCharacterImport {
  id?: string;
  name?: string;
  description?: string;
  traits?: {
    gender?: "M" | "F" | "N";
    age?: "child" | "teen" | "adult" | "elderly";
    personality?: string[];
    speaking_style?: string[];
    accent?: string;
    register?: "formal" | "informal" | "neutral";
    energy?: "low" | "medium" | "high";
  };
  frequency?: number;
  chapters?: string[];
  quotes?: string[];
  isNarrator?: boolean;
  isMainCharacter?: boolean;
}

export interface UseCharactersState {
  characters: Character[];
  detection: CharacterDetection | null;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  message: string;
  filter: string;
  selectedIds: Set<string>;
  assignmentProgress: { current: number; total?: string } | null;
}

export interface UseCharactersApi extends UseCharactersState {
  load: () => Promise<void>;
  reloadDetection: () => Promise<void>;
  addCharacter: (partial?: Partial<Character>) => void;
  removeCharacter: (id: string) => void;
  updateCharacter: (id: string, updates: Partial<Character>) => void;
  toggleFlag: (id: string, flag: "isNarrator" | "isMainCharacter") => void;
  setFilter: (value: string) => void;
  save: () => Promise<void>;
  select: (id: string, multi?: boolean) => void;
  clearSelection: () => void;
  bulkRemove: () => void;
  ensureNarrator: () => void;
  sortByFrequency: () => void;
  exportJson: () => void;
  importJson: (file: File) => Promise<void>;
  assignVoices: () => Promise<void>;
  updateVoiceAssignment: (characterId: string, voiceId: string, style?: string, prosodyAdjustments?: Partial<VoiceAssignment>) => void;
  auditionVoice: (characterId: string) => Promise<void>;
  availableVoices: Voice[];
}

const emptyDetection: CharacterDetection = {
  characters: [],
  detectionMethod: "manual",
  confidence: 0,
  timestamp: new Date().toISOString(),
  sourceChapters: []
};

export function useCharacters(): UseCharactersApi {
  const { root } = useProject();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [detection, setDetection] = useState<CharacterDetection | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelected] = useState<Set<string>>(new Set());
  const [availableVoices, setAvailableVoices] = useState<Voice[]>([]);
  const [assignmentProgress, setAssignmentProgress] = useState<{ current: number; total?: string } | null>(null);
  const mounted = useRef(false);

  const safeProjectRoot = root || "";

  const load = useCallback(async () => {
    if (!safeProjectRoot) return;
    setLoading(true);
    try {
      // Check if characters file exists first
      const api = window.khipu;
      if (!api?.fileExists) {
        throw new Error("File existence check not available");
      }
      
      const charactersPath = `${safeProjectRoot}/dossier/characters.json`;
      const exists = await api.fileExists(charactersPath);
      
      if (exists) {
        // Load existing characters from file
        console.log("📖 Loading existing characters from:", charactersPath);
        
        // Load characters data (handle both array and dictionary formats)
        const charactersResult = await window.khipu!.call("fs:read", {
          projectRoot: safeProjectRoot,
          relPath: "dossier/characters.json",
          json: true,
        });
        
        // Handle both formats: direct array or dictionary with "characters" key
        let charactersArray: SavedCharacter[] = [];
        if (Array.isArray(charactersResult)) {
          // Direct array format
          charactersArray = charactersResult;
        } else if (charactersResult && typeof charactersResult === 'object' && 'characters' in charactersResult) {
          // Dictionary format with "characters" key
          const charactersData = charactersResult as Record<string, unknown>;
          const characters = charactersData.characters;
          if (Array.isArray(characters)) {
            charactersArray = characters;
          }
        }
        
        if (Array.isArray(charactersArray) && charactersArray.length > 0) {
          console.log(`✅ Loaded ${charactersArray.length} characters from file`);
          
          // Convert to frontend format
          const formattedCharacters: Character[] = charactersArray
            .map((char: SavedCharacter, index: number) => {
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
                  case 'neutral': return 'N';
                  default: return 'N';
                }
              };

              // Add safety check and debug info for mapping
              if (!char || typeof char !== 'object') {
                console.warn('Invalid character object:', char);
                return null;
              }

              console.log('Processing character:', char.name, 'with fields:', Object.keys(char));

              return {
                id: char.id || char.name?.toLowerCase().replace(/\s+/g, '_') || `char_${index}`,
                name: char.name || `Character ${index + 1}`,
                description: char.description || `Character: ${char.name}`,
                traits: {
                  gender: mapGender(char.gender || 'unknown'),
                  age: mapAge(char.age || 'adult'),
                  register: char.type === 'narrator' ? 'formal' as const : 'informal' as const,
                  energy: char.age === 'elderly' ? 'low' as const : char.age === 'child' ? 'high' as const : 'medium' as const,
                  personality: char.personality || ['neutral'],
                  speaking_style: char.speaking_style || ['conversational'],
                  accent: char.accent || 'neutral',
                },
                frequency: Math.round((char.frequency || 0.5) * 100),
                chapters: [],
                quotes: [],
                isNarrator: char.type === 'narrator',
                isMainCharacter: char.importance === 'primary',
                voiceAssignment: char.voiceAssignment ? {
                  voiceId: char.voiceAssignment.voiceId,
                  style: char.voiceAssignment.style,
                  styledegree: char.voiceAssignment.styledegree || 0.6,
                  rate_pct: char.voiceAssignment.rate_pct || 0,
                  pitch_pct: char.voiceAssignment.pitch_pct || 0,
                  confidence: char.voiceAssignment.confidence || 0.9,
                  method: (char.voiceAssignment.method as "llm_auto" | "manual") || "llm_auto"
                } : undefined,
              };
            })
            .filter((char) => char !== null) as Character[];
          
          setCharacters(formattedCharacters);
          setDetection({
            characters: formattedCharacters,
            detectionMethod: "llm",
            confidence: 0.9,
            timestamp: new Date().toISOString(),
            sourceChapters: []
          });
          setDirty(false);
          // Characters loaded successfully - no need for message
        } else {
          // Empty or invalid file
          console.log("📭 Characters file is empty or invalid");
          setDetection(emptyDetection);
          setCharacters([]);
          setDirty(false);
          setMessage("Characters file is empty");
        }
      } else {
        // No characters file exists, set empty state
        console.log("📭 No characters file found, setting empty state");
        setDetection(emptyDetection);
        setCharacters([]);
        setDirty(false);
        setMessage("No characters found. Click 'Detect/Refresh' to scan your manuscript.");
      }
    } catch (e) {
      console.warn("Failed to load characters", e);
      setDetection(emptyDetection);
      setCharacters([]);
      setMessage("Failed to load characters");
    } finally {
      setLoading(false);
    }
  }, [safeProjectRoot]);

  const loadVoices = useCallback(async () => {
    if (!safeProjectRoot) return;
    
    try {
      console.log("🎤 Loading voice inventory...");
      const [inventory, config] = await Promise.all([
        loadVoiceInventory(safeProjectRoot),
        loadProjectConfig(safeProjectRoot)
      ]);
      
      if (inventory && inventory.voices) {
        // Filter voices for the project
        const projectLanguage = config?.language || "es-PE";
        const selectedVoiceIds = inventory.selectedVoiceIds || [];
        
        // Filter by selected voices first, then by locale
        let filteredVoices = inventory.voices;
        
        // If there are selected voices, only use those
        if (selectedVoiceIds.length > 0) {
          filteredVoices = filteredVoices.filter(voice => 
            selectedVoiceIds.includes(voice.id)
          );
        }
        
        // Then filter by language
        filteredVoices = filteredVoices
          .filter(voice => 
            voice.locale.startsWith(projectLanguage.split('-')[0]) // Match language
          )
          .map(voice => ({
            id: voice.id,
            engine: voice.engine || "azure" as const, // Default to azure if not specified
            locale: voice.locale,
            gender: voice.gender as "M" | "F" | "N", // Keep original gender including N for neutral
            age_hint: voice.age_hint,
            accent_tags: voice.accent_tags,
            styles: voice.styles,
          }));
        
        console.log(`🎤 Loaded ${filteredVoices.length} voices for ${projectLanguage} (${selectedVoiceIds.length} selected)`);
        setAvailableVoices(filteredVoices);
      } else {
        console.log("🎤 No voice inventory found");
        setAvailableVoices([]);
      }
    } catch (error) {
      console.warn("Failed to load voice inventory:", error);
      setAvailableVoices([]);
    }
  }, [safeProjectRoot]);

  const reloadDetection = useCallback(async () => {
    if (!safeProjectRoot) return;
    setLoading(true);
    setMessage("Running detection...");
    
    try {
      console.log("🚀 Starting IPC character detection for:", safeProjectRoot);
      
      // Initialize cost tracking for this project
      try {
        await costTrackingService.setProjectRoot(safeProjectRoot);
      } catch (costError) {
        console.warn('Failed to initialize cost tracking for character detection:', costError);
      }
      
      // Call the IPC method directly - this will run the Python script
      const api = (window as unknown as WindowKhipu).khipu;
      if (!api?.characters?.detect) {
        throw new Error("IPC detection method not available");
      }
      
      const res: DetectionIPCResult = await costTrackingService.trackAutomatedOperation(
        'character_detection',
        async () => {
          if (!api.characters?.detect) throw new Error("IPC detection method not available");
          return await api.characters.detect(safeProjectRoot);
        },
        {
          page: 'characters',
          projectId: safeProjectRoot.split('/').pop() || 'unknown'
        }
      );
      
      // Track LLM cost for character detection
      try {
        // Estimate token usage for character detection
        const estimatedInputTokens = 3000; // Typical input for character analysis prompts
        const estimatedOutputTokens = 2000; // Typical output with character data
        
        costTrackingService.trackLlmUsage({
          provider: 'openai-gpt4o', // Default assumption
          operation: 'character_detection',
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
          wasCached: false,
          cacheHit: false,
          page: 'characters',
          projectId: safeProjectRoot.split('/').pop() || 'unknown'
        });
        
        console.log(`📊 Tracked character detection LLM usage: ${estimatedInputTokens + estimatedOutputTokens} tokens`);
      } catch (costError) {
        console.warn('Failed to track character detection cost:', costError);
      }
      
      console.log("📡 IPC detection result:", res);
      console.log("📡 Characters data:", res.characters);
      console.log("📡 Characters count:", res.characters?.length);
      console.log("📡 res.ok:", res.ok);
      console.log("📡 Is characters array?", Array.isArray(res.characters));
      
      if (res?.ok && Array.isArray(res.characters)) {
        console.log("🔄 Starting character mapping for", res.characters.length, "characters");
        
        // Convert detection results into Character[] format
        const mapped: Character[] = (res.characters as RawDetectedCharacter[]).map((c, i: number) => {
          console.log(`🔄 Mapping character ${i + 1}:`, c.name, c);
          
          const mapGender = (gender?: string): "M" | "F" | "N" => {
            switch (gender?.toLowerCase()) {
              case 'male': case 'm': return 'M';
              case 'female': case 'f': return 'F';
              default: return 'N';
            }
          };

          const mapAge = (age?: string): "child" | "teen" | "adult" | "elderly" => {
            switch (age?.toLowerCase()) {
              case 'child': return 'child';
              case 'teenager': case 'teen': case 'young': return 'teen';
              case 'elderly': case 'old': return 'elderly';
              default: return 'adult';
            }
          };

          const mapRegister = (register?: string): "formal" | "informal" | "neutral" => {
            switch (register?.toLowerCase()) {
              case 'formal': return 'formal';
              case 'neutral': return 'neutral';
              default: return 'informal';
            }
          };

          const mapEnergy = (energy?: string): "low" | "medium" | "high" => {
            switch (energy?.toLowerCase()) {
              case 'low': return 'low';
              case 'high': return 'high';
              default: return 'medium';
            }
          };

          const mappedCharacter = {
            id: c.id || c.name?.toLowerCase?.().replace(/\s+/g, "_") || `char_${Date.now()}_${i}`,
            name: c.name || `Character ${i + 1}`,
            description: c.description || c.bio || "",
            traits: {
              gender: mapGender(c.gender),
              age: mapAge(c.age),
              personality: Array.isArray(c.personality) ? c.personality : [],
              speaking_style: Array.isArray(c.speaking_style) ? c.speaking_style : [],
              accent: c.accent || 'neutral',
              register: mapRegister(c.register),
              energy: mapEnergy(c.energy),
            },
            frequency: typeof c.frequency === 'number' ? Math.round(c.frequency * 100) : 50,
            chapters: Array.isArray(c.chapters) ? c.chapters : [],
            quotes: Array.isArray(c.quotes) ? c.quotes : [],
            isNarrator: c.type === 'narrator' || c.isNarrator === true,
            isMainCharacter: c.type === 'protagonist' || c.type === 'primary' || c.isMainCharacter === true,
            voiceAssignment: c.voiceAssignment ? {
              voiceId: c.voiceAssignment.voiceId,
              style: c.voiceAssignment.style,
              styledegree: c.voiceAssignment.styledegree || 0.6,
              rate_pct: c.voiceAssignment.rate_pct || 0,
              pitch_pct: c.voiceAssignment.pitch_pct || 0,
              confidence: c.voiceAssignment.confidence || 0.9,
              method: (c.voiceAssignment.method as "llm_auto" | "manual") || "llm_auto"
            } : undefined,
          };
          
          console.log(`✅ Mapped character ${i + 1}:`, mappedCharacter.name, mappedCharacter);
          return mappedCharacter;
        });
        
        console.log(`🎯 Final mapped array:`, mapped);
        console.log(`🎯 Final mapped count:`, mapped.length);
        
        console.log(`✅ Mapped ${mapped.length} characters from detection`);
        
        setCharacters(mapped);
        setDetection({ 
          characters: mapped, 
          detectionMethod: 'llm', 
          confidence: 0.8, 
          timestamp: new Date().toISOString(), 
          sourceChapters: [] 
        });
        setDirty(true);
        setMessage(`Successfully detected ${mapped.length} characters`);
        
        console.log(`🎯 Characters set in state:`, mapped.length);
        console.log(`🎯 First character:`, mapped[0]?.name);
      } else {
        const errorMsg = res?.error || 'Detection returned no characters';
        setMessage(`Detection failed: ${errorMsg}`);
        console.error('🚫 Detection failed:', res);
      }
    } catch (e) {
      console.error('💥 Detection crashed:', e);
      setMessage(`Detection error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [safeProjectRoot]);

  const addCharacter = useCallback((partial?: Partial<Character>) => {
    const base: Character = {
      id: `char_${Date.now()}`,
      name: partial?.name || "New Character",
      description: partial?.description || "",
      traits: {
        gender: partial?.traits?.gender || "N",
        age: partial?.traits?.age || "adult",
        personality: partial?.traits?.personality || [],
        speaking_style: partial?.traits?.speaking_style || [],
        accent: partial?.traits?.accent || "neutral",
        register: partial?.traits?.register || "informal",
        energy: partial?.traits?.energy || "medium",
      },
      frequency: partial?.frequency ?? 50,
      chapters: partial?.chapters || [],
      quotes: partial?.quotes || [],
      isNarrator: partial?.isNarrator || false,
      isMainCharacter: partial?.isMainCharacter || false,
    };
    setCharacters(prev => [...prev, base]);
    setDirty(true);
  }, []);

  const removeCharacter = useCallback((id: string) => {
    setCharacters(prev => prev.filter(c => c.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    setDirty(true);
  }, []);

  const updateCharacter = useCallback((id: string, updates: Partial<Character>) => {
    setCharacters(prev => prev.map(c => c.id === id ? { ...c, ...updates, traits: { ...c.traits, ...(updates.traits || {}) } } : c));
    setDirty(true);
  }, []);

  const toggleFlag = useCallback((id: string, flag: "isNarrator" | "isMainCharacter") => {
    setCharacters(prev => prev.map(c => c.id === id ? { ...c, [flag]: !c[flag] } : c));
    setDirty(true);
  }, []);

  const select = useCallback((id: string, multi = false) => {
    setSelected(prev => {
      if (!multi) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const bulkRemove = useCallback(() => {
    if (selectedIds.size === 0) return;
    setCharacters(prev => prev.filter(c => !selectedIds.has(c.id)));
    setSelected(new Set());
    setDirty(true);
  }, [selectedIds]);

  const ensureNarrator = useCallback(() => {
    setCharacters(prev => {
      if (prev.some(c => c.isNarrator)) return prev;
      if (prev.length === 0) return prev;
      const [first, ...rest] = prev;
      return [{ ...first, isNarrator: true, traits: { ...first.traits, register: "formal" } }, ...rest];
    });
    setDirty(true);
  }, []);

  const sortByFrequency = useCallback(() => {
    setCharacters(prev => [...prev].sort((a, b) => b.frequency - a.frequency));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!safeProjectRoot) return;
    setSaving(true);
    try {
      // Save in the same format as the Python detection script
      // This maintains compatibility with both manual edits and detection results
      const savedCharacters = characters.map(c => ({
        id: c.id, // Include ID for voice assignment tracking
        name: c.name,
        type: c.isNarrator ? "narrator" : "character",
        importance: c.isMainCharacter ? "primary" : "secondary",
        gender: c.traits.gender === "M" ? "male" : c.traits.gender === "F" ? "female" : "unknown",
        age: c.traits.age || "adult",
        description: c.description,
        personality: c.traits.personality || [],
        speaking_style: c.traits.speaking_style || [],
        frequency: c.frequency / 100,
        accent: c.traits.accent || "neutral",
        confidence: 1.0,
        has_dialogue: true,
        dialogue_frequency: "medium",
        // CRITICAL: Preserve voice assignment data
        ...(c.voiceAssignment && { voiceAssignment: c.voiceAssignment })
      }));

      // Save in dictionary format (same format as Python voice assignment script expects)
      await window.khipu!.call("fs:write", {
        projectRoot: safeProjectRoot,
        relPath: "dossier/characters.json",
        json: true,
        content: { characters: savedCharacters }
      });
      
      // Characters saved successfully - no need for message
      setDirty(false);
    } catch (e) {
      console.error(e);
      setMessage("Save failed");
    } finally {
      setSaving(false);
    }
  }, [characters, safeProjectRoot]);

  // Auto-save when characters change and are marked as dirty (debounced)
  useEffect(() => {
    if (!dirty || !safeProjectRoot || characters.length === 0) return;
    
    const timeoutId = setTimeout(async () => {
      try {
        console.log('💾 Auto-saving characters:', characters.length);
        
        // Save in the same format as the Python detection script
        const savedCharacters = characters.map(c => ({
          id: c.id,
          name: c.name,
          type: c.isNarrator ? "narrator" : "character",
          importance: c.isMainCharacter ? "primary" : "secondary",
          gender: c.traits.gender === "M" ? "male" : c.traits.gender === "F" ? "female" : "unknown",
          age: c.traits.age || "adult",
          description: c.description,
          personality: c.traits.personality || [],
          speaking_style: c.traits.speaking_style || [],
          frequency: c.frequency / 100,
          accent: c.traits.accent || "neutral",
          confidence: 1.0,
          has_dialogue: true,
          dialogue_frequency: "medium",
          // CRITICAL: Preserve voice assignment data
          ...(c.voiceAssignment && { voiceAssignment: c.voiceAssignment })
        }));

        await window.khipu!.call("fs:write", {
          projectRoot: safeProjectRoot,
          relPath: "dossier/characters.json",
          json: true,
          content: { characters: savedCharacters }
        });
        
        setDirty(false);
        console.log('💾 Auto-saved characters');
      } catch (error) {
        console.warn('Auto-save failed:', error);
        // Don't show error to user for auto-save failures, just log them
      }
    }, 2000); // Debounce: save 2 seconds after last change

    return () => clearTimeout(timeoutId);
  }, [characters, dirty, safeProjectRoot]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(characters, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "characters-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [characters]);

  const importJson = useCallback(async (file: File) => {
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error("Invalid format");
      // minimal mapping
      const mapped: Character[] = data.map((c: RawCharacterImport, i: number) => ({
        id: c.id || c.name?.toLowerCase().replace(/\s+/g, "_") || `char_${Date.now()}_${i}`,
        name: c.name || `Character ${i + 1}`,
        description: c.description || "",
        traits: {
          gender: c.traits?.gender || "N",
          age: c.traits?.age || "adult",
          personality: c.traits?.personality || [],
          speaking_style: c.traits?.speaking_style || [],
          accent: c.traits?.accent || "neutral",
          register: c.traits?.register || "informal",
          energy: c.traits?.energy || "medium",
        },
        frequency: c.frequency || 50,
        chapters: c.chapters || [],
        quotes: c.quotes || [],
        isNarrator: !!c.isNarrator,
        isMainCharacter: !!c.isMainCharacter,
      }));
      setCharacters(mapped);
      setDirty(true);
      setMessage(`Imported ${mapped.length} characters`);
    } catch (e) {
      console.error(e);
      setMessage("Import failed: invalid JSON");
    }
  }, []);

  const assignVoices = useCallback(async () => {
    if (!safeProjectRoot) return;
    setLoading(true);
    setAssignmentProgress(null);
    setMessage("Assigning voices...");
    
    try {
      // Use IPC to call voice assignment Python script
      const api = (window as unknown as WindowKhipu).khipu;
      if (!api?.call) {
        throw new Error("IPC method not available");
      }

      // Track LLM usage for voice assignment operation
      costTrackingService.trackLlmUsage({
        provider: 'openai-gpt4o', // Default assumption
        operation: 'characters:assignVoices',
        inputTokens: 1800, // estimated input tokens (character data + voice inventory)
        outputTokens: 1200, // estimated output tokens (assignment decisions)
        page: 'casting'
      });
      
      // Call voice assignment through IPC and track automation time
      const result = await costTrackingService.trackAutomatedOperation(
        'characters:assignVoices',
        async () => {
          if (!api.call) throw new Error("IPC method not available");
          return await api.call("characters:assignVoices", {
            projectRoot: safeProjectRoot
          });
        },
        {
          page: 'casting',
          projectId: safeProjectRoot.split('/').pop() || 'unknown'
        }
      ) as { success?: boolean; characters?: Character[]; availableVoices?: Voice[]; message?: string; error?: string };
      
      if (result.success) {
        // Update characters in UI state with assignments (don't auto-save)
        if (result.characters && Array.isArray(result.characters)) {
          const updatedCharacters = (result.characters as (SavedCharacter & { chapters?: string[]; quotes?: string[] })[]).map((char) => ({
            id: char.id || "",
            name: char.name || "",
            type: char.type || "character",
            importance: char.importance || "secondary", 
            gender: char.gender || "unknown",
            age: char.age || "adult",
            description: char.description || "",
            personality: char.personality || [],
            speaking_style: char.speaking_style || [],
            frequency: char.frequency || 0.5,
            accent: char.accent || "neutral",
            confidence: char.confidence || 0.9,
            has_dialogue: char.has_dialogue !== false,
            dialogue_frequency: char.dialogue_frequency || "medium",
            traits: {
              gender: char.gender as "M" | "F" | "unknown" || "unknown",
              age: char.age || "adult",
              personality: char.personality || [],
              speaking_style: char.speaking_style || [],
              accent: char.accent || "neutral",
              register: "neutral" as const,
              energy: "medium" as const
            },
            chapters: char.chapters || [],
            quotes: char.quotes || [],
            voiceAssignment: char.voiceAssignment ? {
              voiceId: char.voiceAssignment.voiceId,
              style: char.voiceAssignment.style,
              styledegree: char.voiceAssignment.styledegree || 0.6,
              rate_pct: char.voiceAssignment.rate_pct || 0,
              pitch_pct: char.voiceAssignment.pitch_pct || 0,
              confidence: char.voiceAssignment.confidence || 0.9,
              method: char.voiceAssignment.method as "llm_auto" | "manual" || "llm_auto"
            } : undefined
          })) as Character[];
          
          setCharacters(updatedCharacters);
          setDirty(true); // Mark as dirty so user can save when ready
        }
        setMessage(result.message || "Voices assigned successfully");
      } else {
        setMessage(result.error || "Voice assignment failed");
      }
    } catch (e) {
      console.error(e);
      setMessage("Voice assignment failed");
    } finally {
      setLoading(false);
      setAssignmentProgress(null);
    }
  }, [safeProjectRoot]);

  const updateVoiceAssignment = useCallback((characterId: string, voiceId: string, style?: string, prosodyAdjustments?: Partial<VoiceAssignment>) => {
    setCharacters(prev => prev.map(char => {
      if (char.id === characterId) {
        return {
          ...char,
          voiceAssignment: {
            voiceId,
            style,
            styledegree: prosodyAdjustments?.styledegree || 0.6,
            rate_pct: prosodyAdjustments?.rate_pct || 0,
            pitch_pct: prosodyAdjustments?.pitch_pct || 0,
            confidence: 0.9,
            method: "manual"
          }
        };
      }
      return char;
    }));
    setDirty(true);
  }, []);

  const auditionVoice = useCallback(async (characterId: string) => {
    if (!safeProjectRoot) return;
    
    const character = characters.find(c => c.id === characterId);
    if (!character?.voiceAssignment) {
      setMessage("No voice assigned to this character");
      return;
    }

    try {
      setMessage("Playing voice sample...");
      
      // Use IPC to play voice sample
      const api = (window as unknown as WindowKhipu).khipu;
      if (!api?.call) {
        throw new Error("IPC method not available");
      }

      // Track TTS usage for voice audition (this is a TTS operation)
      const auditionText = character.quotes?.[0] || character.description || `Hello, my name is ${character.name}.`;
      costTrackingService.trackTtsUsage({
        provider: 'azure-tts', // Default assumption - should be determined by voice config
        operation: 'characters:auditionVoice',
        charactersProcessed: auditionText.length,
        page: 'casting'
      });
      
      // Call voice audition through IPC and track automation time
      console.log(`🎯 About to track voice audition automation for character: ${character.name}`);
      await costTrackingService.trackAutomatedOperation(
        'characters:auditionVoice',
        async () => {
          console.log(`🎯 Executing voice audition IPC call...`);
          if (!api.call) throw new Error("IPC method not available");
          const result = await api.call("characters:auditionVoice", {
            projectRoot: safeProjectRoot,
            characterId: characterId,
            voiceId: character.voiceAssignment?.voiceId || '',
            style: character.voiceAssignment?.style || '',
            sampleText: auditionText
          });
          console.log(`🎯 Voice audition IPC call completed`);
          return result;
        },
        {
          page: 'casting',
          projectId: safeProjectRoot.split('/').pop() || 'unknown'
        }
      );
      console.log(`🎯 Voice audition automation tracking completed`);
      
      setMessage("Voice sample played");
    } catch (e) {
      console.error(e);
      setMessage("Failed to play voice sample");
    }
  }, [safeProjectRoot, characters]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return characters;
    const q = filter.toLowerCase();
    return characters.filter(c => c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q));
  }, [characters, filter]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      void load();
      void loadVoices();
    }
  }, [load, loadVoices]);

  // Listen for assignment progress updates
  useEffect(() => {
    const handleAssignmentProgress = (progress: { current: number; total?: string }) => {
      setAssignmentProgress(progress);
    };

    let unsub: (() => void) | undefined;
    if (window.khipu?.characters?.onAssignmentProgress) {
      const maybe = window.khipu.characters.onAssignmentProgress(handleAssignmentProgress) as unknown;
      if (typeof maybe === 'function') unsub = maybe as () => void;
    }

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  return {
    characters: filtered,
    detection,
    loading,
    saving,
    dirty,
    message,
    filter,
    selectedIds,
    assignmentProgress,
    load,
    reloadDetection,
    addCharacter,
    removeCharacter,
    updateCharacter,
    toggleFlag,
    setFilter,
    save,
    select,
    clearSelection,
    bulkRemove,
    ensureNarrator,
    sortByFrequency,
    exportJson,
    importJson,
    assignVoices,
    updateVoiceAssignment,
    auditionVoice,
    availableVoices,
  };
}
