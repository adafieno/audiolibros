// store/useAudioStore.ts
import { create } from "zustand";
import { getAudioCacheStats, clearAudioCache } from "../lib/audio-cache";

export interface AudioCacheStats {
  size: number;
  maxSize: number;
  oldestEntry?: number;
  newestEntry?: number;
}

interface AudioStoreState {
  // Cache stats
  cacheStats: AudioCacheStats | null;
  
  // Actions
  refreshCacheStats: () => Promise<void>;
  clearCache: () => Promise<void>;
}

export const useAudioStore = create<AudioStoreState>((set, get) => ({
  cacheStats: null,
  
  refreshCacheStats: async () => {
    try {
      const stats = await getAudioCacheStats();
      set({ cacheStats: stats });
    } catch (error) {
      console.error("Failed to refresh cache stats:", error);
    }
  },
  
  clearCache: async () => {
    try {
      await clearAudioCache();
      set({ cacheStats: null });
      // Refresh stats after clearing
      get().refreshCacheStats();
    } catch (error) {
      console.error("Failed to clear audio cache:", error);
    }
  },
}));
