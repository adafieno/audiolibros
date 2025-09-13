// Audio Preview Hook
// React hook for managing audio preview state and controls

import { useEffect, useState, useCallback } from 'react';
import { audioPreviewService, type PreviewOptions, type PlaybackState } from '../lib/audio-preview-service-simple';
import type { AudioProcessingChain } from '../types/audio-production';
import type { Segment } from '../types/plan';
import type { Character } from '../types/character';
import type { ProjectConfig } from '../types/config';

export interface UseAudioPreviewResult {
  // Playback state
  playbackState: PlaybackState;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  
  // Preview controls
  preview: (
    segmentId: string, 
    processingChain: AudioProcessingChain, 
    startTime?: number, 
    duration?: number,
    ttsData?: {
      segment?: Segment;
      character?: Character;
      projectConfig?: ProjectConfig;
    }
  ) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  
  // Status
  isLoading: boolean;
  error: string | null;
  isAvailable: boolean;
}

/**
 * Hook for managing audio preview functionality
 */
export function useAudioPreview(): UseAudioPreviewResult {
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);

  // Initialize audio preview availability
  useEffect(() => {
    const checkAvailability = async () => {
      const available = await audioPreviewService.isAvailable();
      setIsAvailable(available);
    };
    
    checkAvailability();
  }, []);

  // Subscribe to playback state changes
  useEffect(() => {
    const unsubscribe = audioPreviewService.onPlaybackStateChange((state: PlaybackState) => {
      setPlaybackState(state);
    });

    // Get initial state
    setPlaybackState(audioPreviewService.getPlaybackState());

    return unsubscribe;
  }, []);

  // Preview a segment with processing chain
  // Preview a segment with processing chain
  const preview = useCallback(async (
    segmentId: string, 
    processingChain: AudioProcessingChain, 
    startTime?: number, 
    duration?: number,
    ttsData?: {
      segment?: Segment;
      character?: Character;
      projectConfig?: ProjectConfig;
    }
  ) => {
    if (!isAvailable) {
      setError('Audio preview not available');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (!ttsData?.segment || !ttsData?.character || !ttsData?.projectConfig) {
        setError('Missing required TTS data (segment, character, or project config)');
        return;
      }

      const options: PreviewOptions = {
        segmentId,
        processingChain,
        startTime,
        duration,
        segment: ttsData.segment,
        character: ttsData.character,
        projectConfig: ttsData.projectConfig
      };

      await audioPreviewService.preview(options);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Preview failed';
      setError(errorMessage);
      console.error('Audio preview error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isAvailable]);

  // Play current audio
  const play = useCallback(async () => {
    if (!isAvailable) return;

    try {
      setError(null);
      if (playbackState.isPlaying) {
        await audioPreviewService.pause();
      } else {
        await audioPreviewService.resume();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Playback failed';
      setError(errorMessage);
    }
  }, [isAvailable, playbackState.isPlaying]);

  // Pause playback
  const pause = useCallback(async () => {
    if (!isAvailable) return;

    try {
      setError(null);
      await audioPreviewService.pause();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Pause failed';
      setError(errorMessage);
    }
  }, [isAvailable]);

  // Stop playback
  const stop = useCallback(async () => {
    if (!isAvailable) return;

    try {
      setError(null);
      await audioPreviewService.stop();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Stop failed';
      setError(errorMessage);
    }
  }, [isAvailable]);

  return {
    // Playback state
    playbackState,
    isPlaying: playbackState.isPlaying,
    currentTime: playbackState.currentTime,
    duration: playbackState.duration,
    
    // Controls
    preview,
    play,
    pause,
    stop,
    
    // Status
    isLoading,
    error,
    isAvailable
  };
}