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
  lexiconHash?: string; // Hash of lexicon content for cache invalidation
}

/**
 * Generate a stable cache key from audition options
 */
/**
 * Generate a hash for the cache key to avoid Windows path length limitations
 */
export function generateCacheHash(cacheKey: string): string {
  // Simple hash function for consistent, short filenames
  let hash = 0;
  for (let i = 0; i < cacheKey.length; i++) {
    const char = cacheKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to hex and ensure positive
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export async function generateCacheKey(options: AuditionOptions): Promise<string> {
  // Load lexicon to include in cache key
  let lexiconHash = "no-lexicon";
  if (options.projectRoot) {
    try {
      const { loadPronunciationLexicon, hashLexicon } = await import('./tts-audition');
      const lexicon = await loadPronunciationLexicon(options.projectRoot);
      lexiconHash = hashLexicon(lexicon);
    } catch (error) {
      console.warn("Failed to load lexicon for cache key:", error);
    }
  }
  
  const key: CacheKey = {
    engine: options.voice.engine,
    voiceId: options.voice.id,
    text: options.text || "default-audition",
    locale: options.voice.locale,
    style: options.style,
    styledegree: options.styledegree,
    rate_pct: options.rate_pct,
    pitch_pct: options.pitch_pct,
    lexiconHash: lexiconHash, // Include lexicon version in cache key
  };
  
  // Create a deterministic string key
  const cacheKey = btoa(JSON.stringify(key, Object.keys(key).sort()));
  
  console.log(`🔑 CACHE KEY GENERATED:`, {
    voiceId: key.voiceId,
    text: key.text.substring(0, 30) + "...",
    lexiconHash: key.lexiconHash,
    cacheKey: cacheKey.substring(0, 20) + "..."
  });
  
  return cacheKey;
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
        
        // Restore valid entries using original keys from metadata
        for (const { metadata } of result.entries) {
          if (metadata.expiresAt && now < metadata.expiresAt && metadata.originalKey) {
            // Use the original key for memory cache mapping
            this.cache.set(metadata.originalKey, {
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
    
    console.log(`🔍 CACHE GET: "${cacheKey}"`);
    
    // Check memory cache first for immediate response
    const memoryEntry = this.cache.get(cacheKey);
    if (memoryEntry && memoryEntry.audioUrl) {
      // Update access time
      memoryEntry.lastAccessed = Date.now();
      console.log("💨 Memory cache hit for:", cacheKey);
      return memoryEntry.audioUrl;
    }
    
    // Check file system cache if available
    if (window.khipu) {
      try {
        const hashedKey = generateCacheHash(cacheKey);
        const result = await window.khipu.call('audioCache:read', { key: hashedKey });
        if (result.success && result.audioData) {
          console.log("📁 File system cache hit for:", cacheKey);
          
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
        } else {
          console.log("📁 File system cache miss for:", cacheKey);
        }
      } catch (error) {
        console.warn("File system cache read failed:", error);
      }
    }
    
    console.log("❌ Cache miss for:", cacheKey);
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
    } else {
      console.log("📝 File system caching skipped - khipu API or voiceOptions not available");
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
      
      // Convert array buffer to base64 safely using built-in method
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Use FileReader for safe base64 conversion (avoids call stack issues)
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix (data:application/octet-stream;base64,)
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = () => reject(reader.error);
        const blob = new Blob([uint8Array], { type: 'application/octet-stream' });
        reader.readAsDataURL(blob);
      });
      
      const now = Date.now();
      const metadata: AudioCacheMetadata = {
        voiceOptions,
        createdAt: now,
        accessedAt: now,
        expiresAt: now + this.maxAge
      };

      // Store in file system using hashed filename
      const hashedKey = generateCacheHash(cacheKey);
      const result = await window.khipu!.call('audioCache:write', { 
        key: hashedKey, 
        audioData: base64Data, 
        metadata: { ...metadata, originalKey: cacheKey } 
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
   * Delete a specific cache entry
   */
  async delete(key: string): Promise<boolean> {
    await this.init();
    
    console.log(`🗑️ CACHE DELETE REQUESTED: "${key}"`);
    
    // Get the entry to clean up its URL
    const entry = this.cache.get(key);
    if (entry) {
      cleanupAudioUrl(entry.audioUrl);
      console.log(`🗑️ Cleaned up audio URL for: "${key}"`);
    } else {
      console.log(`🗑️ No memory entry found for: "${key}"`);
    }
    
    // Delete from memory cache
    const deleted = this.cache.delete(key);
    console.log(`🗑️ Memory cache delete result: ${deleted} for: "${key}"`);
    
    // Delete from file system cache
    if (deleted && window.khipu) {
      const hashedFilename = generateCacheHash(key);
      try {
        await window.khipu.call('audioCache:delete', { key: hashedFilename + '.wav' });
        console.log(`🗑️ File system delete successful: ${key} (${hashedFilename}.wav)`);
      } catch (error) {
        console.warn(`Failed to delete file cache for ${key}:`, error);
      }
    }
    
    return deleted;
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

  const cacheKey = await generateCacheKey(options);
  console.log("🔑 Cache key generated", { cacheKey: cacheKey.substring(0, 20) + "..." });
  
  // Try to get from cache first
  try {
    const cachedUrl = await audioCache.get(cacheKey);
    if (cachedUrl) {
      console.log("✅ Found cached audio, playing");
      return {
        success: true,
        audioUrl: cachedUrl,
        wasCached: true, // Mark as cache hit
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

    if (result.success && result.audioUrl) {
      // Cache the result for future use
      try {
        const voiceOptions = {
          engine: options.voice.engine,
          id: options.voice.id,
          locale: options.voice.locale
        };
        
        await audioCache.setHybrid(cacheKey, result.audioUrl, voiceOptions);
        console.log("📝 Cached new audition for future use");
      } catch (cacheError) {
        console.warn("Failed to cache audition:", cacheError);
        // Don't fail the whole operation due to caching issues
      }
    }

    return {
      ...result,
      wasCached: false // Mark as fresh generation
    };
  } catch (error) {
    console.error("❌ Error in generateCachedAudition:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error during TTS generation"
    };
  }
}

/**
 * Delete a specific cache entry by key
 */
export async function deleteAudioCacheEntry(key: string): Promise<boolean> {
  return audioCache.delete(key);
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
