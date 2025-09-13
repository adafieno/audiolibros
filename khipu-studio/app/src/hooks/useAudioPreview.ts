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
  previewWithExaggeratedEffects: (
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
  playAllAsPlaylist: (segments: Array<{
    segmentId: string;
    processingChain: AudioProcessingChain;
    segment: Segment;
    character: Character;
    projectConfig: ProjectConfig;
  }>, onProgress?: (currentSegmentIndex: number, segmentDurations: number[]) => void) => Promise<void>;
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
    console.log('🎧 [AudioHook] Setting up playback state change subscription');
    
    const unsubscribe = audioPreviewService.onPlaybackStateChange((state: PlaybackState) => {
      console.log('🎧 [AudioHook] Received playback state change:', {
        isPlaying: state.isPlaying,
        currentTime: state.currentTime,
        duration: state.duration,
        segmentId: state.segmentId
      });
      console.log('🎧 [AudioHook] Applying state update to React state...');
      setPlaybackState(state);
      console.log('🎧 [AudioHook] React state updated with isPlaying:', state.isPlaying);
    });

    // Get initial state
    const initialState = audioPreviewService.getPlaybackState();
    console.log('🎧 [AudioHook] Setting initial playback state:', initialState);
    setPlaybackState(initialState);

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

  // Preview with exaggerated effects for comparison
  const previewWithExaggeratedEffects = useCallback(async (
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
    if (!isAvailable || !ttsData?.segment || !ttsData?.character || !ttsData?.projectConfig) return;

    try {
      setIsLoading(true);
      setError(null);

      const options: PreviewOptions = {
        segmentId,
        processingChain,
        startTime,
        duration,
        segment: ttsData.segment,
        character: ttsData.character,
        projectConfig: ttsData.projectConfig
      };

      await audioPreviewService.previewWithExaggeratedEffects(options);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Preview with exaggerated effects failed';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isAvailable]);

  // Play All as Playlist implementation
  const playAllAsPlaylist = useCallback(async (segments: Array<{
    segmentId: string;
    processingChain: AudioProcessingChain;
    segment: Segment;
    character: Character;
    projectConfig: ProjectConfig;
  }>, onProgress?: (currentSegmentIndex: number, segmentDurations: number[]) => void) => {
    if (!isAvailable || segments.length === 0) return;

    try {
      setIsLoading(true);
      setError(null);

      await audioPreviewService.playAllAsPlaylist(segments, onProgress);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Play All playlist failed';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isAvailable]);

  // Return hook interface
  const result = {
    // Playback state
    playbackState,
    isPlaying: playbackState.isPlaying,
    currentTime: playbackState.currentTime,
    duration: playbackState.duration,
    
    // Controls
    preview,
    previewWithExaggeratedEffects,
    playAllAsPlaylist,
    play,
    pause,
    stop,
    
    // Status
    isLoading,
    error,
    isAvailable
  };

  // Debug: Log what the hook is actually returning every time the component re-renders
  console.log('🎧 [AudioHook] HOOK RETURN VALUES:', {
    isPlaying: result.isPlaying,
    playbackStateIsPlaying: playbackState.isPlaying,
    duration: result.duration,
    segmentId: playbackState.segmentId,
    timestamp: Date.now()
  });

  return result;
}