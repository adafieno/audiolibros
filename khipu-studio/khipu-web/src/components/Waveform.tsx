/**
 * Waveform Visualization Component
 * 
 * Displays audio waveform and allows visual navigation/editing.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { getAudioProcessor } from '../services/audioProcessor';

interface WaveformProps {
  /** Audio data as ArrayBuffer */
  audioData: ArrayBuffer | null;
  /** Width of waveform canvas */
  width?: number;
  /** Height of waveform canvas */
  height?: number;
  /** Waveform color */
  waveColor?: string;
  /** Progress color */
  progressColor?: string;
  /** Current playback position (0-1) */
  currentPosition?: number;
  /** Callback when user clicks on waveform */
  onSeek?: (position: number) => void;
  /** Show loading state */
  isLoading?: boolean;
  /** Custom class name */
  className?: string;
}

export function Waveform({
  audioData,
  width = 800,
  height = 128,
  waveColor = '#4a5568',
  progressColor = '#3b82f6',
  currentPosition = 0,
  onSeek,
  isLoading = false,
  className = '',
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformData, setWaveformData] = useState<Float32Array | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Process audio data to extract waveform samples
   */
  const processWaveform = useCallback(async () => {
    if (!audioData) return;

    setIsProcessing(true);
    try {
      const processor = getAudioProcessor();
      await processor.initialize();
      
      const audioBuffer = await processor.decodeAudio(audioData);
      
      // Extract samples for waveform (downsample to width)
      const samples = extractWaveformSamples(audioBuffer, width);
      setWaveformData(samples);
    } catch (error) {
      console.error('Failed to process waveform:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [audioData, width]);

  /**
   * Extract downsampled waveform data from audio buffer
   */
  const extractWaveformSamples = (
    audioBuffer: AudioBuffer,
    targetWidth: number
  ): Float32Array => {
    const samples = new Float32Array(targetWidth);
    const rawData = audioBuffer.getChannelData(0); // Use first channel
    const blockSize = Math.floor(rawData.length / targetWidth);

    for (let i = 0; i < targetWidth; i++) {
      const start = i * blockSize;
      let sum = 0;
      
      // Calculate RMS (Root Mean Square) for each block
      for (let j = 0; j < blockSize; j++) {
        sum += rawData[start + j] ** 2;
      }
      
      samples[i] = Math.sqrt(sum / blockSize);
    }

    return samples;
  };

  /**
   * Draw waveform on canvas
   */
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size (accounting for device pixel ratio)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const barWidth = width / waveformData.length;
    const halfHeight = height / 2;
    const progressWidth = width * currentPosition;

    // Draw waveform bars
    for (let i = 0; i < waveformData.length; i++) {
      const x = i * barWidth;
      const barHeight = (waveformData[i] * halfHeight) * 0.9; // Scale to 90% of half height

      // Use progress color for played portion, wave color for unplayed
      ctx.fillStyle = x < progressWidth ? progressColor : waveColor;

      // Draw bar (centered vertically)
      ctx.fillRect(
        x,
        halfHeight - barHeight / 2,
        barWidth - 1, // Gap between bars
        barHeight
      );
    }

    // Draw center line
    ctx.strokeStyle = '#cbd5e0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, halfHeight);
    ctx.lineTo(width, halfHeight);
    ctx.stroke();

    // Draw progress indicator line
    if (currentPosition > 0) {
      ctx.strokeStyle = progressColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(progressWidth, 0);
      ctx.lineTo(progressWidth, height);
      ctx.stroke();
    }
  }, [waveformData, width, height, currentPosition, waveColor, progressColor]);

  /**
   * Handle canvas click for seeking
   */
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek || !waveformData) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const position = x / width;

    onSeek(Math.max(0, Math.min(1, position)));
  }, [onSeek, width, waveformData]);

  /**
   * Process waveform when audio data changes
   */
  useEffect(() => {
    if (audioData) {
      processWaveform();
    } else {
      setWaveformData(null);
    }
  }, [audioData, processWaveform]);

  /**
   * Redraw waveform when data or position changes
   */
  useEffect(() => {
    if (waveformData) {
      drawWaveform();
    }
  }, [waveformData, drawWaveform]);

  return (
    <div className={`waveform ${className}`}>
      {(isLoading || isProcessing) && (
        <div className="waveform-loading">
          <div className="loading-spinner" />
          <span>Loading waveform...</span>
        </div>
      )}

      {!isLoading && !isProcessing && (
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{ cursor: onSeek ? 'pointer' : 'default' }}
          className="waveform-canvas"
        />
      )}

      {!audioData && !isLoading && !isProcessing && (
        <div className="waveform-empty" style={{ width, height }}>
          <span>No audio data</span>
        </div>
      )}
    </div>
  );
}

/**
 * Mini waveform component for compact displays
 */
export function MiniWaveform({
  audioData,
  currentPosition = 0,
  className = '',
}: {
  audioData: ArrayBuffer | null;
  currentPosition?: number;
  className?: string;
}) {
  return (
    <Waveform
      audioData={audioData}
      width={200}
      height={40}
      currentPosition={currentPosition}
      className={`mini-waveform ${className}`}
    />
  );
}
