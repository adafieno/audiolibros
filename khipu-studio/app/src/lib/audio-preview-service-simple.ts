// Audio Preview Service - Simple version using existing cache system
// Handles audio playback with Web Audio API integration using the same pattern as working modules

import type { AudioProcessingChain } from '../types/audio-production';
import type { Segment } from '../types/plan';
import type { Character } from '../types/character';
import type { ProjectConfig } from '../types/config';

export interface PreviewOptions {
  segmentId: string;
  processingChain: AudioProcessingChain;
  startTime?: number;
  duration?: number;
  // Required for TTS generation
  segment: Segment;
  character: Character;
  projectConfig: ProjectConfig;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  segmentId?: string;
}

/**
 * Simple audio preview service that uses the same pattern as working modules
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
   * Preview audio using simple cached TTS approach (like working modules)
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

      // Use the same pattern as working modules - direct TTS generation with caching
      const { generateCachedAudition } = await import('./audio-cache');

      // Create voice object matching the working pattern
      const voiceAssignment = options.character.voiceAssignment;
      if (!voiceAssignment) {
        throw new Error(`Character ${options.character.name} has no voice assignment`);
      }

      const voice = {
        id: voiceAssignment.voiceId,
        engine: "azure" as const,
        locale: voiceAssignment.voiceId.startsWith("es-") ? voiceAssignment.voiceId.substring(0, 5) : "es-ES",
        gender: options.character.traits?.gender || "N" as const,
        age_hint: options.character.traits?.age || "adult",
        accent_tags: options.character.traits?.accent ? [options.character.traits.accent] : [],
        styles: voiceAssignment.style ? [voiceAssignment.style] : [],
        description: `Voice for ${options.character.name || options.segmentId}`
      };

      // Create audition options matching the working pattern
      const auditionOptions = {
        voice: voice,
        config: options.projectConfig,
        text: options.segment.text,
        style: voiceAssignment.style,
        styledegree: voiceAssignment.styledegree,
        rate_pct: voiceAssignment.rate_pct,
        pitch_pct: voiceAssignment.pitch_pct
      };

      console.log(`🎤 Generating segment TTS for: ${options.segmentId}`, { 
        voice: auditionOptions.voice.id, 
        engine: auditionOptions.voice.engine 
      });

      // Generate cached audition (same as working modules)
      const result = await generateCachedAudition(auditionOptions, true);
      
      if (!result.success || !result.audioUrl) {
        throw new Error(result.error || 'Failed to generate audio');
      }

      console.log(`✅ Generated TTS audio for segment: ${options.segmentId}`);

      // Convert blob URL to audio buffer for Web Audio API playback
      const response = await fetch(result.audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      this.currentBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // Start playback
      await this.startPlayback(options.startTime, options.duration);
      
    } catch (error) {
      console.error('Audio preview error:', error);
      throw error;
    }
  }

  /**
   * Start audio playback with proper stereo centering
   */
  private async startPlayback(startTime?: number, duration?: number) {
    if (!this.audioContext || !this.currentBuffer) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Create buffer source
    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = this.currentBuffer;
    
    // Create gain node for volume control and proper stereo positioning
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 0.8; // Set to 80% volume like working modules
    
    // For mono audio, ensure it plays centered (both channels)
    if (this.currentBuffer.numberOfChannels === 1) {
      // Create a splitter to separate channels, then merge back for centering
      const splitter = this.audioContext.createChannelSplitter(2);
      const merger = this.audioContext.createChannelMerger(2);
      
      this.currentSource.connect(gainNode);
      gainNode.connect(splitter);
      
      // Connect mono signal to both left and right channels
      splitter.connect(merger, 0, 0); // Connect to left
      splitter.connect(merger, 0, 1); // Connect to right (same signal)
      
      merger.connect(this.audioContext.destination);
    } else {
      // Stereo audio can connect normally
      this.currentSource.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
    }
    
    // Handle playback end
    this.currentSource.onended = () => {
      this.isPlaying = false;
      this.pauseTime = 0;
      this.notifyStateChange();
    };
    
    // Start playback
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
   * Resume paused audio
   */
  async resume(): Promise<void> {
    if (!this.currentBuffer || this.isPlaying) return;
    
    // Restart from pause position
    await this.startPlayback(this.pauseTime);
  }

  /**
   * Pause audio playback
   */
  async pause(): Promise<void> {
    if (!this.isPlaying || !this.currentSource) return;

    this.pauseTime = this.getCurrentTime();
    this.currentSource.stop();
    this.isPlaying = false;
    this.notifyStateChange();
  }

  /**
   * Stop audio playback
   */
  async stop(): Promise<void> {
    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource.disconnect();
      this.currentSource = null;
    }
    
    this.isPlaying = false;
    this.pauseTime = 0;
    this.currentBuffer = null;
    this.currentSegmentId = null;
    this.notifyStateChange();
  }
}

// Export singleton instance
export const audioPreviewService = new AudioPreviewService();