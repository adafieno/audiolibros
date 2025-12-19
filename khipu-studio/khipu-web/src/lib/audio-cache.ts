import api from './api';
import type { Voice } from './api/voices';
import type { Project } from './projects';

interface CacheEntry {
  audioBlob: Blob;
  timestamp: number;
  cacheKey: string;
}

// In-memory audio cache
const audioCache = new Map<string, CacheEntry>();

// Cache configuration
const MAX_CACHE_SIZE_MB = 100;
const MAX_CACHE_AGE_MS = 30 * 60 * 1000; // 30 minutes

// Simple hash function for text content
function hashText(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}

// Generate deterministic cache key
function generateCacheKey(
  voiceId: string,
  text: string,
  style?: string,
  styledegree?: number,
  rate_pct?: number,
  pitch_pct?: number
): string {
  const textHash = hashText(text);
  const params = {
    voiceId,
    textHash,
    style: style || 'default',
    styledegree: styledegree || 1.0,
    rate_pct: rate_pct || 0,
    pitch_pct: pitch_pct || 0,
  };
  
  // Create deterministic key using JSON stringification
  return btoa(JSON.stringify(params));
}

// Get approximate size of cache entry in MB
function getCacheEntrySize(entry: CacheEntry): number {
  return entry.audioBlob.size / (1024 * 1024);
}

// Get total cache size in MB
function getTotalCacheSize(): number {
  let total = 0;
  for (const entry of audioCache.values()) {
    total += getCacheEntrySize(entry);
  }
  return total;
}

// Clean up old cache entries (LRU)
function cleanupCache(): void {
  const now = Date.now();
  
  // First, remove expired entries
  for (const [key, entry] of audioCache.entries()) {
    if (now - entry.timestamp > MAX_CACHE_AGE_MS) {
      audioCache.delete(key);
    }
  }
  
  // If still over size limit, remove oldest entries
  while (getTotalCacheSize() > MAX_CACHE_SIZE_MB && audioCache.size > 0) {
    // Find oldest entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of audioCache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      audioCache.delete(oldestKey);
    }
  }
}

// Main function to get or generate audio
export async function getOrGenerateAudio(
  params: {
    voice: Voice;
    config: Project;
    text: string;
    style?: string;
    styledegree?: number;
    rate_pct?: number;
    pitch_pct?: number;
    page?: string;
  },
  useCache: boolean = true
): Promise<Blob> {
  const cacheKey = generateCacheKey(
    params.voice.id,
    params.text,
    params.style,
    params.styledegree,
    params.rate_pct,
    params.pitch_pct
  );
  
  // Check cache if enabled
  if (useCache) {
    const cached = audioCache.get(cacheKey);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < MAX_CACHE_AGE_MS) {
        console.log('Audio cache hit:', cacheKey);
        return cached.audioBlob;
      } else {
        // Expired entry
        audioCache.delete(cacheKey);
      }
    }
  }
  
  // Generate new audio
  console.log('Audio cache miss, generating:', cacheKey);
  
  // Call API to generate audition
  const response = await api.post(
    `/projects/${params.config.id}/characters/audition`,
    {
      voice: params.voice,
      text: params.text,
      style: params.style,
      styledegree: params.styledegree,
      rate_pct: params.rate_pct,
      pitch_pct: params.pitch_pct,
      page: params.page,
    },
    { responseType: 'blob' }
  );
  
  const audioBlob = response.data;
  
  // Store in cache if enabled
  if (useCache) {
    audioCache.set(cacheKey, {
      audioBlob,
      timestamp: Date.now(),
      cacheKey,
    });
    
    // Cleanup if needed
    cleanupCache();
  }
  
  return audioBlob;
}

// Delete specific cache entry
export function deleteAudioCacheEntry(
  voiceId: string,
  text: string,
  style?: string,
  styledegree?: number,
  rate_pct?: number,
  pitch_pct?: number
): boolean {
  const cacheKey = generateCacheKey(
    voiceId,
    text,
    style,
    styledegree,
    rate_pct,
    pitch_pct
  );
  
  return audioCache.delete(cacheKey);
}

// Clear all cache entries
export function clearAudioCache(): void {
  audioCache.clear();
}

// Get cache statistics (for debugging)
export function getCacheStats() {
  return {
    size: audioCache.size,
    totalSizeMB: getTotalCacheSize(),
    maxSizeMB: MAX_CACHE_SIZE_MB,
    maxAgeMs: MAX_CACHE_AGE_MS,
  };
}
