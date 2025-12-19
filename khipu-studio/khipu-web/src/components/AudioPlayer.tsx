/**
 * Audio Player Component
 * 
 * Plays audio segments with processing chain effects applied in real-time.
 * Uses Web Audio API for client-side processing.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { getAudioProcessor, initializeAudioProcessor } from '../services/audioProcessor';
import type { AudioProcessingChain } from '../types/audio-production';

interface AudioPlayerProps {
  /** Audio data as ArrayBuffer */
  audioData: ArrayBuffer | null;
  /** Processing chain to apply */
  processingChain?: AudioProcessingChain;
  /** Callback when playback starts */
  onPlay?: () => void;
  /** Callback when playback pauses */
  onPause?: () => void;
  /** Callback when playback ends */
  onEnded?: () => void;
  /** Callback for time updates */
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  /** Auto-play when audio data changes */
  autoPlay?: boolean;
  /** Show playback controls */
  showControls?: boolean;
  /** Custom class name */
  className?: string;
}

export function AudioPlayer({
  audioData,
  processingChain,
  onPlay,
  onPause,
  onEnded,
  onTimeUpdate,
  autoPlay = false,
  showControls = true,
  className = '',
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);

  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const processedBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  /**
   * Initialize audio context on first user interaction
   */
  const initialize = useCallback(async () => {
    if (!isInitialized) {
      await initializeAudioProcessor();
      setIsInitialized(true);
    }
  }, [isInitialized]);

  /**
   * Stop playback and reset
   */
  const stop = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    
    setIsPlaying(false);
    setCurrentTime(0);
    pauseTimeRef.current = 0;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  /**
   * Update current time during playback
   */
  const updateTime = useCallback(function update() {
    if (!isPlaying || !processedBufferRef.current) return;

    const processor = getAudioProcessor();
    const elapsed = processor.getCurrentTime() - startTimeRef.current;
    setCurrentTime(elapsed);
    onTimeUpdate?.(elapsed, duration);

    animationFrameRef.current = requestAnimationFrame(update);
  }, [isPlaying, duration, onTimeUpdate]);

  /**
   * Start or resume playback
   */
  const play = useCallback(async () => {
    if (!processedBufferRef.current) return;

    await initialize();

    // Stop current playback if any
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current.disconnect();
    }

    const processor = getAudioProcessor();
    const source = processor.createSource(processedBufferRef.current);
    
    // Create gain node for volume control
    const gainNode = processor.getContext().createGain();
    gainNode.gain.value = volume;
    
    source.connect(gainNode);
    gainNode.connect(processor.getContext().destination);

    // Calculate offset for resume
    const offset = pauseTimeRef.current;
    startTimeRef.current = processor.getCurrentTime() - offset;

    // Handle playback end
    source.onended = () => {
      if (isPlaying) { // Only trigger if not manually stopped
        setIsPlaying(false);
        setCurrentTime(0);
        pauseTimeRef.current = 0;
        onEnded?.();
      }
    };

    source.start(0, offset);
    sourceRef.current = source;
    gainNodeRef.current = gainNode;
    
    setIsPlaying(true);
    onPlay?.();

    // Start time updates
    updateTime();
  }, [volume, isPlaying, onPlay, onEnded, initialize, updateTime]);

  /**
   * Process audio data with effects
   */
  const processAudio = useCallback(async () => {
    if (!audioData) return;

    setIsLoading(true);
    try {
      await initialize();
      
      const processor = getAudioProcessor();
      
      // Decode audio
      const audioBuffer = await processor.decodeAudio(audioData);
      
      // Apply processing chain if provided
      let finalBuffer = audioBuffer;
      if (processingChain) {
        const processed = await processor.processAudio(audioBuffer, processingChain);
        finalBuffer = processed.buffer;
      }
      
      processedBufferRef.current = finalBuffer;
      setDuration(finalBuffer.duration);
      setIsLoading(false);

      // Auto-play if enabled
      if (autoPlay) {
        await play();
      }
    } catch (error) {
      console.error('Failed to process audio:', error);
      setIsLoading(false);
    }
  }, [audioData, processingChain, autoPlay, initialize, play]);

  /**
   * Pause playback
   */
  const pause = useCallback(() => {
    if (sourceRef.current && isPlaying) {
      const processor = getAudioProcessor();
      const elapsed = processor.getCurrentTime() - startTimeRef.current;
      pauseTimeRef.current = elapsed;
      
      sourceRef.current.stop();
      sourceRef.current.disconnect();
      sourceRef.current = null;
      
      setIsPlaying(false);
      onPause?.();

      // Cancel time updates
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
  }, [isPlaying, onPause]);

  /**
   * Seek to specific time
   */
  const seek = useCallback(async (time: number) => {
    const wasPlaying = isPlaying;
    
    // Stop current playback
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    pauseTimeRef.current = time;
    setCurrentTime(time);

    // Resume if was playing
    if (wasPlaying) {
      await play();
    }
  }, [isPlaying, play]);

  /**
   * Update volume
   */
  const changeVolume = useCallback((newVolume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    setVolume(clampedVolume);
    
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = clampedVolume;
    }
  }, []);

  /**
   * Process audio when data or processing chain changes
   */
  useEffect(() => {
    if (audioData) {
      stop(); // Stop current playback
      processAudio();
    }

    return () => {
      stop();
    };
  }, [audioData, stop, processAudio]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      stop();
    };
  }, [stop]);

  /**
   * Toggle play/pause
   */
  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  /**
   * Format time as MM:SS
   */
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Handle seek bar change
   */
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    seek(newTime);
  };

  /**
   * Handle volume change
   */
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    changeVolume(newVolume);
  };

  if (!showControls) {
    return null; // Headless mode, controlled externally
  }

  return (
    <div className={`audio-player ${className}`}>
      {isLoading && (
        <div className="audio-player-loading">
          Processing audio...
        </div>
      )}

      {!isLoading && processedBufferRef.current && (
        <div className="audio-player-controls">
          {/* Play/Pause Button */}
          <button
            onClick={togglePlayPause}
            disabled={!processedBufferRef.current}
            className="audio-player-play-button"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          {/* Stop Button */}
          <button
            onClick={stop}
            disabled={!isPlaying && currentTime === 0}
            className="audio-player-stop-button"
            aria-label="Stop"
          >
            ⏹
          </button>

          {/* Time Display */}
          <span className="audio-player-time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Seek Bar */}
          <input
            type="range"
            min="0"
            max={duration}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            className="audio-player-seek"
            aria-label="Seek"
          />

          {/* Volume Control */}
          <span className="audio-player-volume-label">🔊</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="audio-player-volume"
            aria-label="Volume"
          />
        </div>
      )}

      {!audioData && !isLoading && (
        <div className="audio-player-empty">
          No audio loaded
        </div>
      )}
    </div>
  );
}
