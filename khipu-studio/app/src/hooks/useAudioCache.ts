// hooks/useAudioCache.ts
import { useState, useCallback, useRef } from "react";
import { generateCachedAudition } from "../lib/audio-cache";
import { generateAuditionDirect, cleanupAudioUrl, type AuditionOptions, type AuditionResult } from "../lib/tts-audition";

export interface PlayingAudio {
  audio: HTMLAudioElement;
  cacheKey: string;
}

export interface UseAudioCacheReturn {
  // Audio state
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  playingAudio: PlayingAudio | null;
  
  // Actions
  playAudition: (options: AuditionOptions, useCache?: boolean) => Promise<void>;
  stopAudio: () => void;
  clearError: () => void;
}

/**
 * Hook for managing cached audio auditions with playback
 */
export function useAudioCache(): UseAudioCacheReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingAudio, setPlayingAudio] = useState<PlayingAudio | null>(null);
  
  // Keep track of current audio to prevent memory leaks
  const currentAudioRef = useRef<PlayingAudio | null>(null);

  const stopAudio = useCallback(() => {
    if (currentAudioRef.current) {
      const audioElement = currentAudioRef.current.audio;
      
      // Pause and reset audio first with proper error handling
      try {
        if (!audioElement.paused) {
          audioElement.pause();
        }
        if (audioElement.currentTime > 0) {
          audioElement.currentTime = 0;
        }
      } catch (e) {
        console.warn("Error stopping audio:", e);
        // Continue with cleanup even if stopping fails
      }
      
      // Clean up event listeners if cleanup function exists
      if ('cleanup' in audioElement && typeof audioElement.cleanup === 'function') {
        audioElement.cleanup();
      }
      
      // Clean up the URL after a short delay to ensure audio is stopped
      const audioUrl = audioElement.src;
      setTimeout(() => {
        cleanupAudioUrl(audioUrl);
      }, 100);
      
      currentAudioRef.current = null;
    }
    setPlayingAudio(null);
    setIsPlaying(false);
  }, []);

  const playAudition = useCallback(async (options: AuditionOptions, useCache: boolean = true) => {
    setIsLoading(true);
    setError(null);
    
    // Stop any currently playing audio and wait for cleanup
    stopAudio();
    
    // Add a small delay to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 50));
    
    try {
      // Use direct generation when caching is disabled to prevent infinite loops
      const result: AuditionResult = useCache 
        ? await generateCachedAudition(options, useCache)
        : await generateAuditionDirect(options);
      
      if (result.success && result.audioUrl) {
        let audio: HTMLAudioElement;
        try {
          audio = new Audio(result.audioUrl);
        } catch (audioError) {
          console.error("Failed to create Audio element:", audioError);
          setError("Failed to create audio player");
          setIsLoading(false);
          return;
        }
        
        const cacheKey = `${options.voice.engine}-${options.voice.id}-${options.text || 'default'}`;
        
        const playingAudioData: PlayingAudio = {
          audio,
          cacheKey
        };
        
        // Set up event handlers
        const handleEnded = () => {
          setIsPlaying(false);
          setPlayingAudio(null);
          // Note: Don't cleanup cached URLs here, let the cache manager handle it
        };
        
        const handleError = () => {
          setError("Audio playback failed");
          setIsPlaying(false);
          setPlayingAudio(null);
          cleanupAudioUrl(result.audioUrl!);
        };
        
        const handleCanPlay = () => {
          setIsLoading(false);
          setIsPlaying(true);
        };
        
        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("error", handleError);
        audio.addEventListener("canplay", handleCanPlay);
        
        // Clean up event listeners when audio is replaced
        const cleanup = () => {
          audio.removeEventListener("ended", handleEnded);
          audio.removeEventListener("error", handleError);
          audio.removeEventListener("canplay", handleCanPlay);
        };
        
        // Store reference and set up cleanup
        try {
          currentAudioRef.current = {
            ...playingAudioData,
            audio: new Proxy(audio, {
              get(target, prop) {
                if (prop === 'cleanup') return cleanup;
                try {
                  return target[prop as keyof HTMLAudioElement];
                } catch (e) {
                  console.warn(`Error accessing audio property ${String(prop)}:`, e);
                  return undefined;
                }
              }
            }) as HTMLAudioElement
          };
        } catch (proxyError) {
          console.warn("Error creating audio proxy:", proxyError);
          // Fallback to direct assignment
          currentAudioRef.current = playingAudioData;
          // Manually attach cleanup function
          Object.defineProperty(currentAudioRef.current.audio, 'cleanup', {
            value: cleanup,
            writable: false,
            enumerable: false
          });
        }
        
        setPlayingAudio(currentAudioRef.current);
        
        // Start playback with proper binding to avoid "Illegal invocation" error
        const playPromise = audio.play();
        if (playPromise) {
          playPromise.catch((playError) => {
            console.error("Audio play failed:", playError);
            setError("Audio playback failed");
            setIsPlaying(false);
            setPlayingAudio(null);
            cleanup();
            cleanupAudioUrl(result.audioUrl!);
          });
        }
        
      } else {
        setError(result.error || "Failed to generate audio");
        setIsLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
      setIsLoading(false);
    }
  }, [stopAudio]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Cleanup on unmount
  // Note: This will be handled by the component using the hook
  
  return {
    isPlaying,
    isLoading,
    error,
    playingAudio,
    playAudition,
    stopAudio,
    clearError,
  };
}
