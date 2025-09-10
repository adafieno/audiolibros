// lib/audio-cache.ts
import { cleanupAudioUrl, type AuditionOptions, type AuditionResult } from "./tts-audition";
import type { AudioCacheMetadata } from "../global";

// Re-export types for convenience
export type { AuditionOptions, AuditionResult } from "./tts-audition";

export interface CacheEntry {
  audioUrl: string;
  createdAt: number;
  lastAccessed: number;
  size?: number; // Optional: blob size for cache management
}

export interface CacheKey {
  engine: string;
  voiceId: string;
  text: string;
  locale?: string;
  style?: string;
  styledegree?: number;
  rate_pct?: number;
  pitch_pct?: number;
}

/**
 * Generate a stable cache key from audition options
 */
export function generateCacheKey(options: AuditionOptions): string {
  const key: CacheKey = {
    engine: options.voice.engine,
    voiceId: options.voice.id,
    text: options.text || "default-audition",
    locale: options.voice.locale,
    style: options.style,
    styledegree: options.styledegree,
    rate_pct: options.rate_pct,
    pitch_pct: options.pitch_pct,
  };
  
  // Create a deterministic string key
  return btoa(JSON.stringify(key, Object.keys(key).sort()));
}

/**
 * Audio cache manager for TTS auditions
 * Provides persistent file-based caching with size limits and LRU eviction
 */
class AudioCacheManager {
  private cache = new Map<string, CacheEntry>();
  private maxCacheSize = 100; // Maximum number of entries
  private maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  private initialized = false;

  /**
   * Initialize cache from file system
   */
  private async init() {
    if (this.initialized) return;
    
    try {
      if (!window.khipu) {
        console.warn("Khipu API not available, cache disabled");
        this.initialized = true;
        return;
      }

      const result = await window.khipu.call('audioCache:list', undefined);
      if (result.success && result.entries) {
        const now = Date.now();
        
        // Restore valid entries
        for (const { key, metadata } of result.entries) {
          if (metadata.expiresAt && now < metadata.expiresAt) {
            this.cache.set(key, {
              audioUrl: '', // Will be loaded on demand
              createdAt: metadata.createdAt,
              lastAccessed: metadata.accessedAt,
            });
          }
        }
      }
    } catch (error) {
      console.warn("Failed to restore audio cache from file system:", error);
    }
    
    this.initialized = true;
  }

  /**
   * Get cached audio URL - memory first, then file system
   */
  async get(cacheKey: string): Promise<string | null> {
    await this.init();
    
    // Check memory cache first for immediate response
    const memoryEntry = this.cache.get(cacheKey);
    if (memoryEntry && memoryEntry.audioUrl) {
      // Update access time
      memoryEntry.lastAccessed = Date.now();
      console.log("💨 Memory cache hit");
      return memoryEntry.audioUrl;
    }
    
    // Check file system cache if available
    if (window.khipu) {
      try {
        const result = await window.khipu.call('audioCache:read', { key: cacheKey });
        if (result.success && result.audioData) {
          console.log("📁 File system cache hit");
          
          // Convert base64 audio data to blob URL
          const audioBuffer = Uint8Array.from(atob(result.audioData), c => c.charCodeAt(0));
          const blob = new Blob([audioBuffer], { type: 'audio/wav' });
          const audioUrl = URL.createObjectURL(blob);

          // Store in memory cache for next time
          this.cache.set(cacheKey, {
            audioUrl,
            createdAt: result.metadata?.createdAt || Date.now(),
            lastAccessed: Date.now()
          });
          
          return audioUrl;
        }
      } catch (error) {
        console.warn("File system cache read failed:", error);
      }
    }
    
    return null;
  }

  /**
   * Hybrid cache method - immediate memory storage with background file persistence
   */
  async setHybrid(cacheKey: string, audioUrl: string, voiceOptions?: { engine: string; id: string; locale?: string }): Promise<void> {
    await this.init();
    
    const now = Date.now();
    const entry: CacheEntry = {
      audioUrl,
      createdAt: now,
      lastAccessed: now,
    };

    // Immediate memory cache for fast access
    if (this.cache.size >= this.maxCacheSize) {
      // Simple LRU eviction for memory cache
      let oldestKey: string | null = null;
      let oldestTime = Date.now();

      for (const [key, entry] of this.cache.entries()) {
        if (entry.lastAccessed < oldestTime) {
          oldestTime = entry.lastAccessed;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        const oldEntry = this.cache.get(oldestKey);
        if (oldEntry) {
          cleanupAudioUrl(oldEntry.audioUrl);
          this.cache.delete(oldestKey);
        }
      }
    }
    
    // Store in memory immediately
    this.cache.set(cacheKey, entry);
    console.log("✅ Cached in memory successfully");
    
    // Background file system persistence (non-blocking)
    if (window.khipu && voiceOptions) {
      this.persistToFileSystem(cacheKey, audioUrl, voiceOptions).catch(error => {
        console.warn("Background file system cache failed:", error);
        // Don't throw - memory cache is working fine
      });
    }
  }

  /**
   * Background file system persistence (async, non-blocking)
   */
  private async persistToFileSystem(cacheKey: string, audioUrl: string, voiceOptions: { engine: string; id: string; locale?: string }): Promise<void> {
    try {
      // Convert blob URL to base64 for storage
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      
      // Convert array buffer to base64 safely (handle large files)
      const uint8Array = new Uint8Array(arrayBuffer);
      let base64 = '';
      const chunkSize = 8192; // Process in chunks to avoid call stack overflow
      
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        base64 += String.fromCharCode(...chunk);
      }
      
      const base64Data = btoa(base64);
      
      const now = Date.now();
      const metadata: AudioCacheMetadata = {
        voiceOptions,
        createdAt: now,
        accessedAt: now,
        expiresAt: now + this.maxAge
      };

      // Store in file system
      const result = await window.khipu!.call('audioCache:write', { 
        key: cacheKey, 
        audioData: base64Data, 
        metadata 
      });
      
      if (result.success) {
        console.log("💾 Background file cache successful");
      } else {
        console.warn("💾 Background file cache failed:", result.error);
      }
    } catch (error) {
      console.warn("💾 Background file cache error:", error);
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    await this.init();
    
    // Clean up all blob URLs in memory
    for (const entry of this.cache.values()) {
      cleanupAudioUrl(entry.audioUrl);
    }
    
    this.cache.clear();
    
    // Clear file system cache
    if (window.khipu) {
      try {
        await window.khipu.call('audioCache:clear', undefined);
      } catch (error) {
        console.warn("Failed to clear file system cache:", error);
      }
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    size: number;
    maxSize: number;
    oldestEntry?: number;
    newestEntry?: number;
  }> {
    await this.init();
    
    let oldest = Date.now();
    let newest = 0;
    
    for (const entry of this.cache.values()) {
      if (entry.createdAt < oldest) oldest = entry.createdAt;
      if (entry.createdAt > newest) newest = entry.createdAt;
    }
    
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      oldestEntry: this.cache.size > 0 ? oldest : undefined,
      newestEntry: this.cache.size > 0 ? newest : undefined,
    };
  }
}

// Global cache manager instance
const audioCache = new AudioCacheManager();

/**
 * Generate audition with caching support
 * Checks cache first, generates and caches if not found
 */
export async function generateCachedAudition(
  options: AuditionOptions,
  useCache: boolean = true
): Promise<AuditionResult> {
  console.log("🎯 generateCachedAudition called", { 
    voice: options.voice.id, 
    engine: options.voice.engine,
    useCache,
    text: options.text || "default" 
  });

  // If caching is disabled, generate directly
  if (!useCache) {
    console.log("🚫 Cache disabled, generating directly");
    const { generateAuditionDirect } = await import('./tts-audition');
    return generateAuditionDirect(options);
  }

  const cacheKey = generateCacheKey(options);
  console.log("🔑 Cache key generated", { cacheKey: cacheKey.substring(0, 20) + "..." });
  
  // Try to get from cache first
  try {
    const cachedUrl = await audioCache.get(cacheKey);
    if (cachedUrl) {
      console.log("✅ Found cached audio, playing");
      return {
        success: true,
        audioUrl: cachedUrl,
      };
    }
  } catch (cacheError) {
    console.warn("⚠️ Cache retrieval failed:", cacheError);
    // Continue to generation
  }

  console.log("🔄 Cache miss, generating new audition");
  
  try {
    // Generate new audition - use direct function to avoid infinite recursion
    const { generateAuditionDirect } = await import('./tts-audition');
    const result = await generateAuditionDirect(options);
    
    console.log("🎤 TTS Result:", { 
      success: result.success, 
      hasAudioUrl: !!result.audioUrl, 
      error: result.error 
    });
    
    // Cache successful results only
    if (result.success && result.audioUrl) {
      console.log("💾 Caching successful result");
      
      // Store in memory cache with background file system persistence
      try {
        await audioCache.setHybrid(cacheKey, result.audioUrl, {
          engine: options.voice.engine,
          id: options.voice.id,
          locale: options.voice.locale
        });
        
      } catch (cacheError) {
        console.warn("⚠️ Failed to cache result:", cacheError);
        // Continue execution even if caching fails
      }
    } else {
      console.error("❌ TTS generation failed:", result.error);
    }
    
    return result;
  } catch (error) {
    console.error("❌ Error in generateCachedAudition:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error in audio generation"
    };
  }
}

/**
 * Clear the audio cache
 */
export async function clearAudioCache(): Promise<void> {
  return audioCache.clear();
}

/**
 * Get cache statistics
 */
export async function getAudioCacheStats() {
  return audioCache.getStats();
}
