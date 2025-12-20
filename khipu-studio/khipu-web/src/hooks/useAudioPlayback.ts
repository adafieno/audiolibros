/**
 * Unified Audio Playback Hook
 * 
 * Handles audio playback with optional processing chain for all modules.
 * - Checks if audio exists on segment
 * - If not, generates via TTS
 * - Optionally applies processing chain
 * - Manages HTML Audio element playback
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { voicesApi } from '../lib/api/voices';
import { getAudioProcessor, initializeAudioProcessor } from '../services/audioProcessor';
import type { AudioProcessingChain } from '../types/audio-production';

interface AudioSegment {
  segment_id?: string;
  id?: string;
  has_audio?: boolean;
  raw_audio_url?: string;
  text: string;
  voice?: string;
}

interface UseAudioPlaybackOptions {
  projectId: string;
  processingChain?: AudioProcessingChain | null;
}

export function useAudioPlayback({ projectId, processingChain }: UseAudioPlaybackOptions) {
  const [audioCache] = useState(new Map<string, string>());
  const [audioElements] = useState(new Map<string, HTMLAudioElement>());
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1.0); // Track volume independently (0.0 to 1.0)
  const volumeRef = useRef(1.0); // Ref to avoid stale closures
  const animationFrameRef = useRef<number | null>(null);

  // Keep volumeRef in sync with volume state
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      audioElements.forEach(audio => {
        audio.pause();
        audio.currentTime = 0;
      });
    };
  }, [audioElements]);

  const playSegment = useCallback(async (
    segment: AudioSegment,
    voiceId?: string
  ) => {
    const segmentId = segment.segment_id || segment.id;
    if (!segmentId) return;

    // Stop if already playing this segment
    if (isPlaying && playingSegmentId === segmentId) {
      const audio = audioElements.get(segmentId);
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      setIsPlaying(false);
      setPlayingSegmentId(null);
      setCurrentTime(0);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    // Stop any other playing audio
    audioElements.forEach((audio, id) => {
      if (id !== segmentId) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    setPlayingSegmentId(segmentId);
    setIsLoadingAudio(true);

    try {
      // Step 1: Get raw audio from cache or generate (cache by segment ID only)
      let rawAudioUrl = audioCache.get(segmentId);

      if (!rawAudioUrl) {
        console.log('[AudioPlayback] Fetching/generating raw audio for segment:', segmentId);

        let rawAudioBlob: Blob;
        
        // Check if segment has audio URL (prioritize blob storage)
        if (segment.raw_audio_url) {
          // Fetch from blob storage
          console.log('[AudioPlayback] Fetching from storage:', segment.raw_audio_url);
          const response = await fetch(segment.raw_audio_url);
          if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
          rawAudioBlob = await response.blob();
        } else {
          // Generate via TTS only if no audio URL exists
          if (!voiceId) {
            throw new Error('Voice ID required to generate audio');
          }
          console.log('[AudioPlayback] No audio URL found, generating TTS for segment:', segmentId, 'voice:', voiceId);
          rawAudioBlob = await voicesApi.auditionVoice(projectId, voiceId, segment.text);
        }

        rawAudioUrl = URL.createObjectURL(rawAudioBlob);
        audioCache.set(segmentId, rawAudioUrl);
        console.log('[AudioPlayback] Raw audio cached for segment:', segmentId);
      }

      // Step 2: Apply processing chain if provided (on-the-fly, not cached)
      let finalAudioUrl = rawAudioUrl;
      if (processingChain) {
        console.log('[AudioPlayback] Applying processing chain on-the-fly...');
        await initializeAudioProcessor();
        const processor = getAudioProcessor();

        // Fetch the raw audio blob from the cached URL
        const response = await fetch(rawAudioUrl);
        const rawAudioBlob = await response.blob();
        const arrayBuffer = await rawAudioBlob.arrayBuffer();
        const audioBuffer = await processor.decodeAudio(arrayBuffer);
        
        const processed = await processor.processAudio(audioBuffer, processingChain);
        const processedBlob = await processor.encodeToBlob(processed.buffer);
        
        finalAudioUrl = URL.createObjectURL(processedBlob);
        console.log('[AudioPlayback] Processing complete (not cached)');
      }

      // Step 3: Play audio
      let audio = audioElements.get(segmentId);
      if (!audio) {
        audio = new Audio(finalAudioUrl);
        audio.volume = volumeRef.current; // Apply current volume setting
        audio.onended = () => {
          setIsPlaying(false);
          setPlayingSegmentId(null);
          setCurrentTime(0);
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
          }
        };
        audio.onerror = (e) => {
          console.error('Failed to play audio for segment:', segmentId, e);
          setIsPlaying(false);
          setPlayingSegmentId(null);
          setIsLoadingAudio(false);
        };
        audioElements.set(segmentId, audio);
      } else {
        // If processing chain changed, update the audio source
        audio.src = finalAudioUrl;
        audio.volume = volumeRef.current; // Ensure volume is applied
      }

      audio.onloadedmetadata = () => {
        setDuration(audio.duration);
      };

      // Update current time during playback
      const updateTime = () => {
        if (audio && !audio.paused && !audio.ended) {
          setCurrentTime(audio.currentTime);
          animationFrameRef.current = requestAnimationFrame(updateTime);
        }
      };

      setIsPlaying(true);
      setIsLoadingAudio(false);
      await audio.play();
      updateTime();

    } catch (error) {
      console.error('Playback failed:', error);
      setPlayingSegmentId(null);
      setIsPlaying(false);
      setIsLoadingAudio(false);
      throw error;
    }
  }, [projectId, processingChain, audioCache, audioElements, isPlaying, playingSegmentId]);

  const stopPlayback = useCallback(() => {
    if (playingSegmentId) {
      const audio = audioElements.get(playingSegmentId);
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      setIsPlaying(false);
      setPlayingSegmentId(null);
      setCurrentTime(0);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  }, [playingSegmentId, audioElements]);

  const seek = useCallback((time: number) => {
    if (playingSegmentId) {
      const audio = audioElements.get(playingSegmentId);
      if (audio) {
        audio.currentTime = time;
        setCurrentTime(time);
      }
    }
  }, [playingSegmentId, audioElements]);

  const setVolume = useCallback((vol: number) => {
    volumeRef.current = vol; // Update ref immediately
    setVolumeState(vol);
    // Apply to currently playing audio if any
    if (playingSegmentId) {
      const audio = audioElements.get(playingSegmentId);
      if (audio) {
        audio.volume = vol;
      }
    }
  }, [playingSegmentId, audioElements]);

  const clearCache = useCallback((segmentId?: string) => {
    if (segmentId) {
      // Clear cache for specific segment (raw audio only)
      const url = audioCache.get(segmentId);
      if (url) {
        URL.revokeObjectURL(url);
        audioCache.delete(segmentId);
      }
    } else {
      // Clear all cache
      audioCache.forEach(url => URL.revokeObjectURL(url));
      audioCache.clear();
    }
  }, [audioCache]);

  return {
    isPlaying,
    isLoadingAudio,
    playingSegmentId,
    currentTime,
    duration,
    volume,
    playSegment,
    stopPlayback,
    seek,
    setVolume,
    clearCache,
  };
}
