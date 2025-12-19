/**
 * Audio Cache Utilities
 * 
 * Manages L1 (frontend) audio cache for raw TTS audio.
 * Provides persistent caching using IndexedDB for offline access.
 */

/**
 * Cache entry structure
 */
interface CacheEntry {
  key: string;
  data: ArrayBuffer;
  timestamp: number;
  duration: number;
  sampleRate: number;
}

/**
 * IndexedDB database name and version
 */
const DB_NAME = 'khipu-audio-cache';
const DB_VERSION = 1;
const STORE_NAME = 'audio-segments';

/**
 * Maximum cache size in bytes (500 MB)
 */
const MAX_CACHE_SIZE = 500 * 1024 * 1024;

/**
 * Maximum age for cache entries (7 days)
 */
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Audio cache manager
 */
class AudioCacheManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB
   */
  async initialize(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Get cached audio by key
   */
  async get(key: string): Promise<ArrayBuffer | null> {
    await this.initialize();
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        
        if (!entry) {
          resolve(null);
          return;
        }

        // Check if entry is expired
        const age = Date.now() - entry.timestamp;
        if (age > MAX_CACHE_AGE) {
          // Remove expired entry
          this.delete(key);
          resolve(null);
          return;
        }

        resolve(entry.data);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get cache entry: ${key}`));
      };
    });
  }

  /**
   * Store audio in cache
   */
  async set(
    key: string,
    data: ArrayBuffer,
    duration: number,
    sampleRate: number
  ): Promise<void> {
    await this.initialize();
    if (!this.db) return;

    // Check cache size and evict if necessary
    await this.evictIfNeeded(data.byteLength);

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const entry: CacheEntry = {
        key,
        data,
        timestamp: Date.now(),
        duration,
        sampleRate,
      };

      const request = store.put(entry);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to store cache entry: ${key}`));
      };
    });
  }

  /**
   * Delete cached audio by key
   */
  async delete(key: string): Promise<void> {
    await this.initialize();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to delete cache entry: ${key}`));
      };
    });
  }

  /**
   * Clear all cached audio
   */
  async clear(): Promise<void> {
    await this.initialize();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to clear cache'));
      };
    });
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    count: number;
    totalSize: number;
    oldestEntry: number | null;
  }> {
    await this.initialize();
    if (!this.db) {
      return { count: 0, totalSize: 0, oldestEntry: null };
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const entries = request.result as CacheEntry[];
        
        let totalSize = 0;
        let oldestEntry: number | null = null;

        for (const entry of entries) {
          totalSize += entry.data.byteLength;
          
          if (oldestEntry === null || entry.timestamp < oldestEntry) {
            oldestEntry = entry.timestamp;
          }
        }

        resolve({
          count: entries.length,
          totalSize,
          oldestEntry,
        });
      };

      request.onerror = () => {
        reject(new Error('Failed to get cache stats'));
      };
    });
  }

  /**
   * Evict old entries if cache size exceeds limit
   */
  private async evictIfNeeded(newEntrySize: number): Promise<void> {
    const stats = await this.getStats();
    
    if (stats.totalSize + newEntrySize <= MAX_CACHE_SIZE) {
      return; // No eviction needed
    }

    // Get all entries sorted by timestamp (oldest first)
    await this.initialize();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.openCursor();

      let freedSpace = 0;
      const targetFreedSpace = stats.totalSize + newEntrySize - MAX_CACHE_SIZE;

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        
        if (!cursor || freedSpace >= targetFreedSpace) {
          resolve();
          return;
        }

        const entry = cursor.value as CacheEntry;
        freedSpace += entry.data.byteLength;
        
        cursor.delete();
        cursor.continue();
      };

      request.onerror = () => {
        reject(new Error('Failed to evict cache entries'));
      };
    });
  }

  /**
   * Generate cache key for audio segment
   */
  static generateKey(
    projectId: string,
    chapterId: string,
    segmentId: string
  ): string {
    return `audio:${projectId}:${chapterId}:${segmentId}`;
  }

  /**
   * Parse cache key into components
   */
  static parseKey(key: string): {
    projectId: string;
    chapterId: string;
    segmentId: string;
  } | null {
    const parts = key.split(':');
    if (parts.length !== 4 || parts[0] !== 'audio') {
      return null;
    }

    return {
      projectId: parts[1],
      chapterId: parts[2],
      segmentId: parts[3],
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}

// Singleton instance
let audioCacheInstance: AudioCacheManager | null = null;

/**
 * Get global audio cache instance
 */
export function getAudioCache(): AudioCacheManager {
  if (!audioCacheInstance) {
    audioCacheInstance = new AudioCacheManager();
  }
  return audioCacheInstance;
}

/**
 * Initialize audio cache (call on app startup)
 */
export async function initializeAudioCache(): Promise<void> {
  const cache = getAudioCache();
  await cache.initialize();
}

/**
 * High-level cache operations
 */
export const audioCache = {
  /**
   * Get cached audio for segment
   */
  async getSegmentAudio(
    projectId: string,
    chapterId: string,
    segmentId: string
  ): Promise<ArrayBuffer | null> {
    const cache = getAudioCache();
    const key = AudioCacheManager.generateKey(projectId, chapterId, segmentId);
    return cache.get(key);
  },

  /**
   * Cache audio for segment
   */
  async setSegmentAudio(
    projectId: string,
    chapterId: string,
    segmentId: string,
    data: ArrayBuffer,
    duration: number,
    sampleRate: number
  ): Promise<void> {
    const cache = getAudioCache();
    const key = AudioCacheManager.generateKey(projectId, chapterId, segmentId);
    await cache.set(key, data, duration, sampleRate);
  },

  /**
   * Delete cached audio for segment
   */
  async deleteSegmentAudio(
    projectId: string,
    chapterId: string,
    segmentId: string
  ): Promise<void> {
    const cache = getAudioCache();
    const key = AudioCacheManager.generateKey(projectId, chapterId, segmentId);
    await cache.delete(key);
  },

  /**
   * Clear all cached audio for chapter
   */
  async clearChapterAudio(projectId: string, chapterId: string): Promise<void> {
    const cache = getAudioCache();
    
    // Delete all entries matching project and chapter
    const prefix = `audio:${projectId}:${chapterId}:`;

    // We need to iterate through all keys
    await cache.initialize();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (cache as any).db as IDBDatabase;
    if (!db) return;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['audio-segments'], 'readwrite');
      const store = transaction.objectStore('audio-segments');
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        
        if (!cursor) {
          resolve();
          return;
        }

        const entry = cursor.value as CacheEntry;
        if (entry.key.startsWith(prefix)) {
          cursor.delete();
        }
        
        cursor.continue();
      };

      request.onerror = () => {
        reject(new Error('Failed to clear chapter audio'));
      };
    });
  },

  /**
   * Clear all cached audio
   */
  async clearAll(): Promise<void> {
    const cache = getAudioCache();
    await cache.clear();
  },

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    count: number;
    totalSize: number;
    totalSizeMB: number;
    oldestEntry: Date | null;
  }> {
    const cache = getAudioCache();
    const stats = await cache.getStats();
    
    return {
      count: stats.count,
      totalSize: stats.totalSize,
      totalSizeMB: stats.totalSize / (1024 * 1024),
      oldestEntry: stats.oldestEntry ? new Date(stats.oldestEntry) : null,
    };
  },
};
