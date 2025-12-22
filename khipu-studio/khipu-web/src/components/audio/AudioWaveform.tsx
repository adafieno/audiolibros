/**
 * Audio Waveform Visualizer
 * 
 * Displays the complete audio segment waveform with playback cursor
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface AudioWaveformProps {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  width?: number;
  height?: number;
  onSeek?: (time: number) => void;
}

export function AudioWaveform({ audioElement, isPlaying, width = 800, height = 80, onSeek }: AudioWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformData, setWaveformData] = useState<Float32Array | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentElementRef = useRef<HTMLAudioElement | null>(null);
  const waveformCacheRef = useRef<Map<string, Float32Array>>(new Map());

  // Build waveform data from audio element
  useEffect(() => {
    if (!audioElement || audioElement === currentElementRef.current) return;

    const audioSrc = audioElement.src;
    if (!audioSrc) return;

    // Check cache first
    const cached = waveformCacheRef.current.get(audioSrc);
    if (cached) {
      setWaveformData(cached);
      currentElementRef.current = audioElement;
      return;
    }

    // Build waveform from audio
    const buildWaveform = async () => {
      setIsProcessing(true);
      
      try {
        // Create dedicated audio context for waveform only (not connected to output)
        if (!audioContextRef.current) {
          const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AudioContextClass) {
            console.error('AudioContext not supported');
            setIsProcessing(false);
            return;
          }
          audioContextRef.current = new AudioContextClass();
        }

        // Fetch audio data
        const response = await fetch(audioSrc);
        const arrayBuffer = await response.arrayBuffer();
        
        // Decode audio
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        
        // Extract waveform samples with higher resolution
        const samples = new Float32Array(width * 2); // 2x resolution for zoom
        const rawData = audioBuffer.getChannelData(0);
        const blockSize = Math.floor(rawData.length / (width * 2));

        for (let i = 0; i < width * 2; i++) {
          const start = i * blockSize;
          let sum = 0;
          
          // Calculate RMS for each block
          for (let j = 0; j < blockSize; j++) {
            sum += rawData[start + j] ** 2;
          }
          
          samples[i] = Math.sqrt(sum / blockSize);
        }

        // Cache and set
        waveformCacheRef.current.set(audioSrc, samples);
        setWaveformData(samples);
        currentElementRef.current = audioElement;
        setIsProcessing(false);
      } catch (error) {
        console.error('Failed to build waveform:', error);
        setIsProcessing(false);
      }
    };

    buildWaveform();
  }, [audioElement, width]);

  // Draw waveform with playback cursor
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      // Clear canvas
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);

      if (isProcessing) {
        // Show loading state
        ctx.fillStyle = '#666';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Processing waveform...', width / 2, height / 2);
        return;
      }

      if (!waveformData) {
        // Show empty state
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        return;
      }

      // Get current playback position
      const currentTime = audioElement?.currentTime || 0;
      const duration = audioElement?.duration || 0;
      const progress = duration > 0 ? currentTime / duration : 0;

      // Draw full waveform (zoomed 2x with higher detail)
      const barWidth = width / waveformData.length;
      const halfHeight = height / 2;
      const amplitudeScale = 1.8; // Zoom in vertically for better visibility

      // Draw waveform bars
      for (let i = 0; i < waveformData.length; i++) {
        const x = i * barWidth;
        const barHeight = Math.min((waveformData[i] * halfHeight) * amplitudeScale, halfHeight * 0.95);
        const progressPos = progress * waveformData.length;

        // Color based on progress
        ctx.fillStyle = i < progressPos ? '#4a9eff' : '#444';

        // Draw bar centered
        ctx.fillRect(
          x,
          halfHeight - barHeight / 2,
          Math.max(barWidth - 0.5, 1),
          barHeight
        );
      }

      // Draw time reference markers every second
      if (duration > 0) {
        ctx.font = '10px monospace';
        ctx.fillStyle = '#666';
        ctx.textAlign = 'center';
        
        const secondsPerMarker = duration > 10 ? 1 : 0.5;
        for (let t = 0; t <= duration; t += secondsPerMarker) {
          const x = (t / duration) * width;
          
          // Draw tick
          ctx.strokeStyle = '#444';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 8);
          ctx.stroke();
          
          // Draw time label every second
          if (t % 1 === 0) {
            ctx.fillText(`${t.toFixed(0)}s`, x, height - 4);
          }
        }
      }

      // Draw center line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, halfHeight);
      ctx.lineTo(width, halfHeight);
      ctx.stroke();

      // Draw playback cursor with time display
      if (progress > 0 && progress < 1) {
        const cursorX = progress * width;
        
        ctx.strokeStyle = '#ff6b35';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cursorX, 0);
        ctx.lineTo(cursorX, height - 16);
        ctx.stroke();
        
        // Draw current time
        ctx.fillStyle = '#ff6b35';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = cursorX > width / 2 ? 'right' : 'left';
        ctx.fillText(`${currentTime.toFixed(1)}s`, cursorX + (cursorX > width / 2 ? -4 : 4), 12);
      }
    };

    draw();

    // Redraw during playback
    let animationId: number | null = null;
    if (isPlaying) {
      const animate = () => {
        draw();
        animationId = requestAnimationFrame(animate);
      };
      animate();
    }

    return () => {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [audioElement, waveformData, isProcessing, isPlaying, width, height]);

  // Handle canvas click for seeking
  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!audioElement || !onSeek) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    // Use actual rendered width, not canvas width
    const clickProgress = x / rect.width;
    const seekTime = clickProgress * audioElement.duration;

    if (!isNaN(seekTime) && isFinite(seekTime)) {
      onSeek(seekTime);
    }
  }, [audioElement, onSeek]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onClick={handleCanvasClick}
      style={{
        width: '100%',
        height: `${height}px`,
        borderRadius: '4px',
        background: '#0a0a0a',
        cursor: onSeek && waveformData ? 'pointer' : 'default',
      }}
    />
  );
}
