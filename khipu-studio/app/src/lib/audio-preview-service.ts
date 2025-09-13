// Audio Preview Service
// Handles audio playback with Web Audio API integration and processing chain preview

import { generateSegmentAudio } from './segment-tts-generator';
import { audioProcessor } from './audio-processor-frontend';
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
   * Check if audio preview is available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.audioContext) {
      await this.initializeAudioContext();
    }
    return this.audioContext !== null;
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

      // Check if we have cached processed audio (TTS + Processing Chain combined)
      const processingCacheKey = audioProcessor.generateCacheKey(
        `segment_${options.segmentId}`, 
        options.processingChain
      );

      let processedAudioPath = await audioProcessor.getCachedAudioPath(processingCacheKey);
      
      if (!processedAudioPath) {
        console.log(`🎤 No cached processed audio found for segment ${options.segmentId}, generating TTS + applying processing...`);
        
        // Step 1: Generate raw TTS audio
        if (options.segment && options.character && options.projectConfig) {
          const ttsResult = await generateSegmentAudio({
            segment: options.segment,
            character: options.character,
            projectConfig: options.projectConfig
          });

          if (!ttsResult.success || !ttsResult.audioUrl) {
            throw new Error(`Failed to generate TTS audio: ${ttsResult.error}`);
          }

          // Step 2: Convert TTS blob URL to audio buffer for processing
          const response = await fetch(ttsResult.audioUrl);
          const audioBuffer = await response.arrayBuffer();
          
          // Step 3: Save TTS to temp file for processing
          const tempTTSPath = `temp/tts_${options.segmentId}.wav`;
          await window.electron?.invoke('fs:createDirectory', 'temp');
          await window.electron?.invoke('fs:writeFile', tempTTSPath, new Uint8Array(audioBuffer));
          
          // Step 4: Apply processing chain
          const tempProcessedPath = `temp/processed_${processingCacheKey}.wav`;
          
          const processingResult = await audioProcessor.processAudio({
            inputPath: tempTTSPath,
            outputPath: tempProcessedPath,
            processingChain: options.processingChain
          });

          if (!processingResult.success) {
            throw new Error('Failed to apply processing chain: ' + processingResult.error);
          }

          processedAudioPath = processingResult.outputPath!;
          console.log(`✅ Generated TTS + applied processing chain for segment ${options.segmentId}`);
        } else {
          throw new Error(`No audio available for segment ${options.segmentId}. Please provide segment data and character information.`);
        }
      } else {
        console.log(`� Found cached processed audio for segment ${options.segmentId}`);
      }

      // Step 5: Load and play the processed audio
      console.log('Loading processed audio:', processedAudioPath);
      this.currentBuffer = await this.loadAudioFile(processedAudioPath);
      
      // Create audio source and start playback
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