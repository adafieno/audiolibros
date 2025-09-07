import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Character, CharacterDetection } from "../types/character";
import { detectCharacters } from "../lib/characters";

interface RawDetectedCharacter {
  id?: string;
  name?: string;
  display_name?: string;
  bio?: string;
  description?: string;
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
    }
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
  const mounted = useRef(false);

  const safeProjectRoot = root || "";

  const load = useCallback(async () => {
    if (!safeProjectRoot) return;
    setLoading(true);
    try {
      const det = await detectCharacters(safeProjectRoot);
      setDetection(det || emptyDetection);
      setCharacters(det.characters || []);
      setDirty(false);
      setMessage(`Loaded ${det.characters.length} characters`);
    } catch (e) {
      console.warn("Failed to load characters", e);
      setDetection(emptyDetection);
      setCharacters([]);
      setMessage("Failed to load characters");
    } finally {
      setLoading(false);
    }
  }, [safeProjectRoot]);

  const reloadDetection = useCallback(async () => {
    if (!safeProjectRoot) return;
    setLoading(true);
    setMessage("Running detection...");
    try {
      // Call IPC directly
  const api = (window as unknown as WindowKhipu).khipu;
  const res: DetectionIPCResult | undefined = await api?.characters?.detect(safeProjectRoot);
      if (res?.ok && Array.isArray(res.characters)) {
        // Convert minimal structure into Character[] (reuse addCharacter mapping logic simplified)
  const mapped: Character[] = (res.characters as RawDetectedCharacter[]).map((c, i: number) => ({
          id: c.id || c.name?.toLowerCase?.().replace(/\s+/g, "_") || `char_${Date.now()}_${i}`,
          name: c.display_name || c.name || `Character ${i + 1}`,
          description: c.bio || c.description || "",
          traits: {
            gender: 'N',
            age: 'adult',
            personality: [],
            speaking_style: [],
            accent: 'neutral',
            register: 'informal',
            energy: 'medium',
          },
          frequency: 50,
          chapters: [],
          quotes: [],
          isNarrator: false,
          isMainCharacter: false,
        }));
        setCharacters(mapped);
        setDetection({ characters: mapped, detectionMethod: 'llm', confidence: 0.8, timestamp: new Date().toISOString(), sourceChapters: [] });
        setDirty(true);
        setMessage(`Detected ${mapped.length} characters`);
      } else {
        setMessage(res?.error ? `Detection failed: ${res.error}` : 'Detection returned no characters');
      }
    } catch (e) {
      console.error(e);
      setMessage("Detection crashed");
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
      await window.khipu!.call("fs:write", {
        projectRoot: safeProjectRoot,
        relPath: "dossier/characters.json",
        json: true,
        content: characters.map(c => ({
          name: c.name,
            type: c.isNarrator ? "narrator" : "character",
            importance: c.isMainCharacter ? "primary" : "secondary",
            gender: c.traits.gender === "M" ? "male" : c.traits.gender === "F" ? "female" : "unknown",
            age: c.traits.age || "adult",
            description: c.description,
            personality: c.traits.personality || [],
            speaking_style: c.traits.speaking_style || [],
            frequency: c.frequency / 100,
            accent: c.traits.accent || "neutral"
        }))
      });
      setMessage("Saved characters");
      setDirty(false);
    } catch (e) {
      console.error(e);
      setMessage("Save failed");
    } finally {
      setSaving(false);
    }
  }, [characters, safeProjectRoot]);

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

  const filtered = useMemo(() => {
    if (!filter.trim()) return characters;
    const q = filter.toLowerCase();
    return characters.filter(c => c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q));
  }, [characters, filter]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      void load();
    }
  }, [load]);

  return {
    characters: filtered,
    detection,
    loading,
    saving,
    dirty,
    message,
    filter,
    selectedIds,
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
  };
}
