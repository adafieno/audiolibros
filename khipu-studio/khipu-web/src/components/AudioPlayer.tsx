/**
 * Audio Player Component
 * 
 * Plays audio segments with processing chain effects applied in real-time.
 * Uses Web Audio API for client-side processing.
 */

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { getAudioProcessor, initializeAudioProcessor } from '../services/audioProcessor';
import type { AudioProcessingChain } from '../types/audio-production';

// Add keyframes animation for spinner
const spinnerStyle = document.createElement('style');
spinnerStyle.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
if (typeof document !== 'undefined' && !document.head.querySelector('[data-spinner-style]')) {
  spinnerStyle.setAttribute('data-spinner-style', 'true');
  document.head.appendChild(spinnerStyle);
}

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
  /** Callback when audio is ready to play */
  onAudioReady?: (duration: number) => void;
  /** Auto-play when audio data changes */
  autoPlay?: boolean;
  /** Show playback controls */
  showControls?: boolean;
  /** Hide transport controls (play/stop buttons) */
  hideTransportControls?: boolean;
  /** Custom class name */
  className?: string;
}

export interface AudioPlayerHandle {
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => Promise<void>;
  setVolume: (volume: number) => void;
}

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(({
  audioData,
  processingChain,
  onPlay,
  onPause,
  onEnded,
  onTimeUpdate,  onAudioReady,  autoPlay = false,
  showControls = true,
  hideTransportControls = false,
  className = '',
}, ref) => {
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
      
      // Clone the ArrayBuffer to avoid detachment issues
      const clonedBuffer = audioData.slice(0);
      
      const processor = getAudioProcessor();
      
      // Decode audio
      const audioBuffer = await processor.decodeAudio(clonedBuffer);
      
      // Apply processing chain if provided
      let finalBuffer = audioBuffer;
      if (processingChain) {
        const processed = await processor.processAudio(audioBuffer, processingChain);
        finalBuffer = processed.buffer;
      }
      
      processedBufferRef.current = finalBuffer;
      setDuration(finalBuffer.duration);
      setIsLoading(false);

      // Notify that audio is ready
      onAudioReady?.(finalBuffer.duration);

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
   * Expose methods via ref
   */
  useImperativeHandle(ref, () => ({
    play,
    pause,
    stop,
    seek,
    setVolume: changeVolume,
  }), [play, pause, stop, seek, changeVolume]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioData, processingChain, stop]);

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
    <div className={`audio-player ${className}`} style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      width: '100%',
      minHeight: '40px',
    }}>
      {isLoading && (
        <div style={{
          padding: '12px',
          textAlign: 'center',
          color: '#4a9eff',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ 
            display: 'inline-block',
            width: '16px',
            height: '16px',
            border: '2px solid #4a9eff',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          Processing audio with effects...
        </div>
      )}

      {!isLoading && processedBufferRef.current && (
        <>
          {!hideTransportControls && (
            <>
              {/* Play/Pause Button */}
              <button
                onClick={togglePlayPause}
                disabled={!processedBufferRef.current}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: isPlaying ? '#4a9eff' : '#333',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                }}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>

              {/* Stop Button */}
              <button
                onClick={stop}
                disabled={!isPlaying && currentTime === 0}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '4px',
                  background: '#333',
                  border: 'none',
                  color: '#fff',
                  cursor: (!isPlaying && currentTime === 0) ? 'not-allowed' : 'pointer',
                  opacity: (!isPlaying && currentTime === 0) ? 0.5 : 1,
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
                aria-label="Stop"
              >
                ⏹
              </button>
            </>
          )}

          {/* Time Display */}
          <span style={{
            fontSize: '11px',
            color: '#999',
            fontVariantNumeric: 'tabular-nums',
            minWidth: '70px',
            flexShrink: 0,
          }}>
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
            style={{
              flex: 1,
              height: '4px',
              borderRadius: '2px',
              background: `linear-gradient(to right, #4a9eff 0%, #4a9eff ${(currentTime / duration) * 100}%, #333 ${(currentTime / duration) * 100}%, #333 100%)`,
              outline: 'none',
              cursor: 'pointer',
            }}
            aria-label="Seek"
          />

          {/* Volume Control */}
          <span style={{ fontSize: '14px', flexShrink: 0 }}>🔊</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            style={{
              width: '100px',
              height: '4px',
              borderRadius: '2px',
              background: `linear-gradient(to right, #4a9eff 0%, #4a9eff ${volume * 100}%, #333 ${volume * 100}%, #333 100%)`,
              outline: 'none',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            aria-label="Volume"
          />
        </>
      )}

      {!audioData && !isLoading && (
        <div style={{
          padding: '12px',
          textAlign: 'center',
          color: '#666',
          fontSize: '11px',
        }}>
          No audio loaded
        </div>
      )}
    </div>
  );
});

AudioPlayer.displayName = 'AudioPlayer';
