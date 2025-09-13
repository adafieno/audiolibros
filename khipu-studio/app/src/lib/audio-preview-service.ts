// Audio Preview Service
// Handles audio playback with Web Audio API integration and processing chain preview

import { audioProcessor } from './audio-processor-frontend';
import { generateSegmentAudio } from './segment-tts-generator';
import type { AudioProcessingChain } from '../types/audio-production';
import type { Segment } from '../types/plan';
import type { Character } from '../types/character';
import type { ProjectConfig } from '../types/config';

export interface PreviewOptions {
  segmentId: string;
  processingChain: AudioProcessingChain;
  startTime?: number;
  duration?: number;
  // Optional: provide segment and character data for TTS generation
  segment?: Segment;
  character?: Character;
  projectConfig?: ProjectConfig;
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
      // Stop any current playbook
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
        console.log(`🎤 Base audio not found for segment ${options.segmentId}, generating TTS...`);
        
        // Try to generate TTS audio on-demand if we have the necessary data
        if (options.segment && options.character && options.projectConfig) {
          const ttsResult = await generateSegmentAudio({
            segment: options.segment,
            character: options.character,
            projectConfig: options.projectConfig
          });

          if (!ttsResult.success) {
            throw new Error(`Failed to generate TTS audio: ${ttsResult.error}`);
          }

          console.log(`✅ Successfully generated TTS audio for segment ${options.segmentId}`);
        } else {
          throw new Error(`No audio available for segment ${options.segmentId}. Please provide segment data and character information for TTS generation, or generate the audio first.`);
        }
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
          throw new Error('Failed to process audio: ' + result.error);
        }

        audioPath = result.outputPath!;
      }

      console.log('Loading processed audio:', audioPath);
      
      // Load and decode the processed audio
      this.currentBuffer = await this.loadAudioFile(audioPath);
      
      // Create audio source and start playbook
      await this.startPlayback(options.startTime, options.duration);
      
    } catch (error) {
      console.error('Preview failed:', error);
      throw error;
    }
  }

  /**
   * Start audio playback
   */
  private async startPlayback(startTime?: number, duration?: number) {
    if (!this.audioContext || !this.currentBuffer) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Create buffer source
    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = this.currentBuffer;
    
    // Connect to destination
    this.currentSource.connect(this.audioContext.destination);
    
    // Handle playback end
    this.currentSource.onended = () => {
      this.isPlaying = false;
      this.pauseTime = 0;
      this.notifyStateChange();
    };
    
    // Start playbook
    const when = 0;
    const offset = startTime || 0;
    const playDuration = duration || (this.currentBuffer.duration - offset);
    
    this.currentSource.start(when, offset, playDuration);
    this.startTime = this.audioContext.currentTime - offset;
    this.pauseTime = 0;
    this.isPlaying = true;
    
    this.notifyStateChange();
  }

  /**
   * Stop audio playbook
   */
  async stop() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // Ignore errors if already stopped
      }
      this.currentSource = null;
    }

    this.currentBuffer = null;
    this.isPlaying = false;
    this.pauseTime = 0;
    this.currentSegmentId = null;
    
    this.notifyStateChange();
  }

  /**
   * Pause audio playbook
   */
  async pause() {
    if (!this.isPlaying || !this.currentSource || !this.audioContext) return;

    this.pauseTime = this.audioContext.currentTime - this.startTime;
    this.currentSource.stop();
    this.currentSource = null;
    this.isPlaying = false;
    
    this.notifyStateChange();
  }

  /**
   * Resume audio playbook
   */
  async resume() {
    if (this.isPlaying || !this.currentBuffer || !this.audioContext) return;

    // Resume from paused position
    await this.startPlayback(this.pauseTime);
  }

  /**
   * Get current playbook state
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
   * Cleanup resources
   */
  dispose() {
    this.stop();
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.playbackStateCallbacks.length = 0;
  }
}

// Create singleton instance
export const audioPreviewService = new AudioPreviewService();