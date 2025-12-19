import { useState, useCallback, useRef } from 'react';
import { getOrGenerateAudio } from '../lib/audio-cache';
import type { Voice } from '../lib/api/voices';
import type { Project } from '../lib/projects';

export function useAudioCache() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const playAudition = useCallback(async (
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
  ) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      
      // Get or generate audio
      const audioBlob = await getOrGenerateAudio(params, useCache);
      
      // Create audio element and play
      const audio = new Audio(URL.createObjectURL(audioBlob));
      audioRef.current = audio;
      
      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => {
        setIsPlaying(false);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setError('Failed to play audio');
        setIsPlaying(false);
        audioRef.current = null;
      };
      
      await audio.play();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Audio playback error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
    }
  }, []);
  
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  return {
    isPlaying,
    isLoading,
    error,
    playAudition,
    stopAudio,
    clearError,
  };
}
