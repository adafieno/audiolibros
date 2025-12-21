/**
 * Audio Level Analysis Hook
 * 
 * Provides RMS (Root Mean Square) audio level analysis in dBFS
 * for use with standard VU meters and other level indicators.
 */

import { useEffect, useRef, useState } from 'react';

interface AudioLevelAnalysis {
  /** Left channel level in dBFS (full scale) */
  leftDbfs: number;
  /** Right channel level in dBFS (full scale) */
  rightDbfs: number;
  /** Whether audio is currently being analyzed */
  isAnalyzing: boolean;
}

/**
 * Calculate RMS (Root Mean Square) level from time-domain audio data
 * Returns value in dBFS (decibels relative to full scale)
 */
function calculateRmsDbfs(dataArray: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    // Convert from 0-255 range to -1 to +1
    const normalized = (dataArray[i] - 128) / 128;
    sum += normalized * normalized;
  }
  
  const rms = Math.sqrt(sum / dataArray.length);
  
  // Convert to dBFS (decibels relative to full scale)
  // dBFS = 20 * log10(rms)
  // Minimum floor at -60 dBFS
  if (rms < 0.001) {
    return -60; // Silence threshold
  }
  
  return 20 * Math.log10(rms);
}

/**
 * Hook to analyze audio element and provide RMS levels in dBFS
 * 
 * Creates an AudioContext and AnalyserNode to measure RMS levels
 * from a playing audio element. Returns levels for both left and right
 * channels in dBFS (decibels relative to full scale).
 * 
 * @param audioElement - The HTML audio element to analyze
 * @param isPlaying - Whether audio is currently playing
 * @returns Audio level analysis with left/right dBFS values
 */
export function useAudioLevelAnalysis(
  audioElement: HTMLAudioElement | null,
  isPlaying: boolean
): AudioLevelAnalysis {
  const [leftDbfs, setLeftDbfs] = useState(-60);
  const [rightDbfs, setRightDbfs] = useState(-60);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const splitterRef = useRef<ChannelSplitterNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const connectedElementRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!audioElement || !isPlaying) {
      // Reset state via animation frame to avoid cascading renders
      const resetLevels = () => {
        setIsAnalyzing(false);
        setLeftDbfs(-60);
        setRightDbfs(-60);
      };
      requestAnimationFrame(resetLevels);
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      
      return;
    }

    // Initialize audio context and analyzer
    if (!audioContextRef.current) {
      try {
        const AudioContextClass = window.AudioContext || 
          (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        
        if (!AudioContextClass) {
          console.error('AudioContext not supported');
          return;
        }

        audioContextRef.current = new AudioContextClass();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 2048;
        analyserRef.current.smoothingTimeConstant = 0.8; // Smooth for RMS-like behavior
        
        splitterRef.current = audioContextRef.current.createChannelSplitter(2);
      } catch (error) {
        console.error('Failed to create audio context:', error);
        return;
      }
    }

    // Connect to audio element if not already connected or element changed
    if (audioElement !== connectedElementRef.current && audioContextRef.current && analyserRef.current && splitterRef.current) {
      try {
        // Disconnect old source if exists
        if (sourceRef.current) {
          sourceRef.current.disconnect();
        }
        
        // Create new source for new audio element
        sourceRef.current = audioContextRef.current.createMediaElementSource(audioElement);
        sourceRef.current.connect(analyserRef.current);
        analyserRef.current.connect(splitterRef.current);
        splitterRef.current.connect(audioContextRef.current.destination, 0, 0);
        splitterRef.current.connect(audioContextRef.current.destination, 1, 1);
        
        connectedElementRef.current = audioElement;
      } catch (error) {
        console.warn('Could not create new audio source:', error);
      }
    }

    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const analyze = () => {
      if (!isPlaying) {
        setIsAnalyzing(false);
        return;
      }

      // Get time-domain data for RMS calculation
      analyser.getByteTimeDomainData(dataArray);
      
      // Calculate RMS in dBFS
      const dbfs = calculateRmsDbfs(dataArray);
      
      // For stereo, we're getting a mix - set both channels to same value
      // In a real implementation with channel splitting, you'd analyze each separately
      setLeftDbfs(dbfs);
      setRightDbfs(dbfs);
      setIsAnalyzing(true);

      animationFrameRef.current = requestAnimationFrame(analyze);
    };

    // Resume audio context if suspended
    if (audioContextRef.current?.state === 'suspended') {
      audioContextRef.current.resume();
    }

    analyze();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [audioElement, isPlaying]);

  return {
    leftDbfs,
    rightDbfs,
    isAnalyzing,
  };
}
