// hooks/useAudioCache.ts
import { useState, useCallback, useRef } from "react";
import { generateCachedAudition } from "../lib/audio-cache";
import { generateAuditionDirect, type AuditionOptions, type AuditionResult } from "../lib/tts-audition";

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
      
      // Pause and reset audio with safe error handling
      try {
        // Check if audioElement is valid
        if (audioElement && audioElement instanceof HTMLAudioElement) {
          // Use safer approach without method binding
          if (!audioElement.paused) {
            try {
              audioElement.pause();
            } catch (pauseError) {
              console.warn("Could not pause audio:", pauseError);
            }
          }
          
          // Reset time safely
          try {
            if (audioElement.currentTime > 0) {
              audioElement.currentTime = 0;
            }
          } catch (timeError) {
            console.warn("Could not reset currentTime:", timeError);
          }
        }
      } catch (e) {
        console.warn("Error stopping audio:", e);
        // Continue with cleanup even if stopping fails
      }
      
      // Clean up event listeners if cleanup function exists
      try {
        if ('cleanup' in audioElement && typeof (audioElement as HTMLAudioElement & { cleanup?: () => void }).cleanup === 'function') {
          (audioElement as HTMLAudioElement & { cleanup: () => void }).cleanup();
        }
      } catch (cleanupError) {
        console.warn("Error during cleanup:", cleanupError);
      }
      
      // Don't cleanup URLs - they may be reused by cache
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
          // Set consistent volume for all auditions to prevent volume fluctuation
          audio.volume = 0.8; // Set to 80% to provide consistent experience
          // Optional: Add volume normalization via gain
          // This helps ensure consistent volume across different TTS engines
          if ('webkitAudioContext' in window || 'AudioContext' in window) {
            try {
              const AudioContext = (window as Window & typeof globalThis & { 
                AudioContext?: typeof window.AudioContext;
                webkitAudioContext?: typeof window.AudioContext;
              }).AudioContext || (window as Window & typeof globalThis & { 
                webkitAudioContext?: typeof window.AudioContext;
              }).webkitAudioContext;
              if (AudioContext) {
                const audioContext = new AudioContext();
                const source = audioContext.createMediaElementSource(audio);
                const gainNode = audioContext.createGain();
                gainNode.gain.value = 1.0; // Unity gain, can be adjusted for normalization
                source.connect(gainNode);
                gainNode.connect(audioContext.destination);
              }
            } catch (webAudioError) {
              // Web Audio API setup failed, continue with basic volume control
              console.debug("Web Audio API setup failed, using basic volume control:", webAudioError);
            }
          }
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
          // Don't cleanup cached URLs on error - they may be needed for retry
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
        
        // Store reference with simple cleanup function attachment
        currentAudioRef.current = playingAudioData;
        
        // Attach cleanup function directly without proxy
        try {
          Object.defineProperty(currentAudioRef.current.audio, 'cleanup', {
            value: cleanup,
            writable: false,
            enumerable: false,
            configurable: true
          });
        } catch (defineError) {
          console.warn("Could not attach cleanup function:", defineError);
          // Continue without cleanup attachment - it's not critical
        }
        
        setPlayingAudio(currentAudioRef.current);
        
        // Start playback with safe error handling
        try {
          const playPromise = audio.play();
          if (playPromise && typeof playPromise.then === 'function') {
            playPromise.catch((playError) => {
              console.error("Audio play failed:", playError);
              setError("Audio playback failed");
              setIsLoading(false);
              setIsPlaying(false);
              setPlayingAudio(null);
              cleanup();
            });
          }
        } catch (playError) {
          console.error("Audio play error:", playError);
          setError("Audio playback failed");
          setIsLoading(false);
          setIsPlaying(false);
          setPlayingAudio(null);
          cleanup();
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
