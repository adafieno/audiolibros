// Audio Preview Service
// Handles audio playback with Web Audio API integration and processing chain preview

import { audioProcessor } from './audio-processor-frontend';
import type { AudioProcessingChain } from '../types/audio-production';

export interface PreviewOptions {
  segmentId: string;
  processingChain: AudioProcessingChain;
  startTime?: number;
  duration?: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  segmentId?: string;
}

/**
 * Audio preview service that handles playback with processing chain preview
 */
export class AudioPreviewService {
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentBuffer: AudioBuffer | null = null;
  private startTime = 0;
  private pauseTime = 0;
  private isPlaying = false;
  private playbackStateCallbacks: ((state: PlaybackState) => void)[] = [];
  private currentSegmentId: string | null = null;

  constructor() {
    this.initializeAudioContext();
  }

  /**
   * Initialize Web Audio API context
   */
  private async initializeAudioContext() {
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextClass();
      
      // Handle audio context state changes
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
    }
  }

  /**
   * Subscribe to playback state changes
   */
  onPlaybackStateChange(callback: (state: PlaybackState) => void) {
    this.playbackStateCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.playbackStateCallbacks.indexOf(callback);
      if (index > -1) {
        this.playbackStateCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of playback state changes
   */
  private notifyStateChange() {
    const state: PlaybackState = {
      isPlaying: this.isPlaying,
      currentTime: this.getCurrentTime(),
      duration: this.currentBuffer?.duration || 0,
      segmentId: this.currentSegmentId || undefined
    };

    this.playbackStateCallbacks.forEach(callback => callback(state));
  }

  /**
   * Get current playback time
   */
  private getCurrentTime(): number {
    if (!this.audioContext || !this.currentBuffer) return 0;
    
    if (this.isPlaying) {
      return this.audioContext.currentTime - this.startTime;
    } else {
      return this.pauseTime;
    }
  }

  /**
   * Load and decode audio file
   */
  private async loadAudioFile(filePath: string): Promise<AudioBuffer> {
    if (!this.audioContext) {
      throw new Error('Audio context not available');
    }

    try {
      // Get file data via Electron IPC
      const arrayBuffer = await window.khipu!.call('fs:readAudioFile', filePath);
      
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer;
    } catch (error) {
      console.error('Failed to load audio file:', error);
      throw new Error('Failed to load audio file');
    }
  }

  /**
   * Preview audio with processing chain applied
   */
  async preview(options: PreviewOptions): Promise<void> {
    try {
      // Stop any current playback
      await this.stop();

      if (!this.audioContext) {
        await this.initializeAudioContext();
        if (!this.audioContext) {
          throw new Error('Audio context not available');
        }
      }

      this.currentSegmentId = options.segmentId;

      // First check if the base segment audio exists
      // This is the TTS-generated audio that we'll apply processing to
      const baseAudioPath = `audio/segments/${options.segmentId}.wav`;
      
      // Check if base audio file exists
      let hasBaseAudio = false;
      try {
        hasBaseAudio = await window.khipu!.call('file:exists', baseAudioPath) as boolean;
      } catch (error) {
        console.warn('Could not check if base audio exists:', error);
      }

      if (!hasBaseAudio) {
        throw new Error(`No audio available for segment ${options.segmentId}. Please generate the audio first.`);
      }

      // Check if we have cached processed audio
      const cacheKey = audioProcessor.generateCacheKey(
        `segment_${options.segmentId}`, 
        options.processingChain
      );

      let audioPath = await audioProcessor.getCachedAudioPath(cacheKey);
      
      if (!audioPath) {
        // Need to process audio first
        const tempInputPath = baseAudioPath; // Use the actual base audio file
        const tempOutputPath = `temp/processed/${cacheKey}.wav`;
        
        console.log('Processing audio for preview:', tempInputPath, '->', tempOutputPath);
        
        const result = await audioProcessor.processAudio({
          inputPath: tempInputPath,
          outputPath: tempOutputPath,
          processingChain: options.processingChain
        });

        if (!result.success) {
          throw new Error(result.error || 'Audio processing failed');
        }

        audioPath = result.outputPath!;
      }

      // Load processed audio
      console.log('Loading processed audio from:', audioPath);
      this.currentBuffer = await this.loadAudioFile(audioPath);
      
      // Create and start audio source
      await this.play(options.startTime, options.duration);

    } catch (error) {
      console.error('Preview failed:', error);
      throw error;
    }
  }

  /**
   * Play loaded audio buffer
   */
  async play(startOffset = 0, duration?: number): Promise<void> {
    if (!this.audioContext || !this.currentBuffer) {
      throw new Error('No audio loaded');
    }

    // Stop any existing playback
    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource.disconnect();
    }

    // Create new audio source
    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = this.currentBuffer;
    this.currentSource.connect(this.audioContext.destination);

    // Set up event handlers
    this.currentSource.onended = () => {
      this.isPlaying = false;
      this.currentSource = null;
      this.notifyStateChange();
    };

    // Start playback
    const when = this.audioContext.currentTime;
    const offset = startOffset;
    const playDuration = duration || (this.currentBuffer.duration - startOffset);

    this.currentSource.start(when, offset, playDuration);
    this.startTime = when - startOffset;
    this.isPlaying = true;
    this.notifyStateChange();

    // Resume audio context if needed
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Pause current playback
   */
  async pause(): Promise<void> {
    if (!this.isPlaying || !this.currentSource || !this.audioContext) {
      return;
    }

    this.pauseTime = this.audioContext.currentTime - this.startTime;
    this.currentSource.stop();
    this.currentSource.disconnect();
    this.currentSource = null;
    this.isPlaying = false;
    this.notifyStateChange();
  }

  /**
   * Resume paused playback
   */
  async resume(): Promise<void> {
    if (this.isPlaying || !this.currentBuffer) {
      return;
    }

    await this.play(this.pauseTime);
  }

  /**
   * Stop playback
   */
  async stop(): Promise<void> {
    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource.disconnect();
      this.currentSource = null;
    }

    this.isPlaying = false;
    this.startTime = 0;
    this.pauseTime = 0;
    this.currentSegmentId = null;
    this.notifyStateChange();
  }

  /**
   * Set playback volume
   */
  async setVolume(volume: number): Promise<void> {
    if (!this.audioContext) return;

    // Create gain node for volume control
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = Math.max(0, Math.min(1, volume));
    
    // This would need to be integrated into the audio graph
    // For now, we'll store the volume preference
    localStorage.setItem('audioPreviewVolume', volume.toString());
  }

  /**
   * Get current playback state
   */
  getPlaybackState(): PlaybackState {
    return {
      isPlaying: this.isPlaying,
      currentTime: this.getCurrentTime(),
      duration: this.currentBuffer?.duration || 0,
      segmentId: this.currentSegmentId || undefined
    };
  }

  /**
   * Check if audio preview is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (!this.audioContext) {
        await this.initializeAudioContext();
      }
      return this.audioContext !== null;
    } catch {
      return false;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.playbackStateCallbacks.length = 0;
  }
}

// Global preview service instance
export const audioPreviewService = new AudioPreviewService();