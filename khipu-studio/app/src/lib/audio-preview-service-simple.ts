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
   * Preview audio with SoX processing chain applied (now that we have reliable SoX)
   */
  async preview(options: PreviewOptions): Promise<void> {
    return this.previewInternal(options, false);
  }

  /**
   * Preview audio with exaggerated effects to make processing more audible
   */
  async previewWithExaggeratedEffects(options: PreviewOptions): Promise<void> {
    // Create an exaggerated version of the processing chain for comparison
    const exaggeratedChain: AudioProcessingChain = {
      noiseCleanup: {
        highPassFilter: {
          enabled: true,
          frequency: "90" // Higher cutoff to be more noticeable
        },
        deClickDeEss: {
          enabled: false,
          intensity: "medium"
        }
      },
      dynamicControl: {
        compression: {
          enabled: true,
          ratio: "3:1", // More aggressive compression
          threshold: -18 // Lower threshold
        },
        limiter: {
          enabled: true,
          ceiling: -1
        }
      },
      eqShaping: {
        presenceBoost: {
          enabled: true,
          frequency: "3",
          gain: 6 // Much more boost
        },
        lowMidCut: {
          enabled: true,
          frequency: "300",
          gain: -4 // Cut low mids more
        },
        airLift: {
          enabled: true,
          frequency: "10",
          gain: 3 // Add high frequency sparkle
        }
      },
      spatialEnhancement: {
        reverb: {
          enabled: true,
          type: "room_0.4",
          wetMix: 25 // Much more reverb
        },
        stereoEnhancer: {
          enabled: false,
          width: 10
        }
      },
      mastering: {
        normalization: {
          enabled: true,
          targetLUFS: "-18" // Louder
        },
        peakLimiting: {
          enabled: true,
          maxPeak: -3
        },
        dithering: {
          enabled: false,
          bitDepth: "16"
        }
      }
    };

    console.log('🎭 Using EXAGGERATED effects for comparison');
    return this.previewInternal({ ...options, processingChain: exaggeratedChain }, true);
  }

  /**
   * Internal preview method that handles both normal and exaggerated processing
   */
  private async previewInternal(options: PreviewOptions, _isExaggerated: boolean = false): Promise<void> {
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

      // Generate cache key for processed audio (TTS + SoX processing) - use hash to avoid long filenames
      const processingParams = JSON.stringify(options.processingChain);
      const longCacheKey = `sox_segment_${options.segmentId}_${processingParams}`;
      
      // Create a hash for shorter filename
      let hash = 0;
      for (let i = 0; i < longCacheKey.length; i++) {
        const char = longCacheKey.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      const cacheKey = `sox_${Math.abs(hash).toString(16)}`;
      
      // Check if we have cached processed audio
      let processedAudioPath: string | null = null;
      
      try {
        // Try to get cached processed audio path
        processedAudioPath = await window.khipu!.call('audioProcessor:getCachedAudioPath', cacheKey);
      } catch {
        console.log('No cached processed audio found, will generate');
      }

      if (!processedAudioPath) {
        console.log(`🎤 No cached processed audio, generating TTS + applying SoX processing for segment ${options.segmentId}`);
        
        // Step 1: Generate TTS using existing reliable system
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

        const auditionOptions = {
          voice: voice,
          config: options.projectConfig,
          text: options.segment.text,
          style: voiceAssignment.style,
          styledegree: voiceAssignment.styledegree,
          rate_pct: voiceAssignment.rate_pct,
          pitch_pct: voiceAssignment.pitch_pct
        };

        // Generate TTS audio
        const result = await generateCachedAudition(auditionOptions, true);
        
        if (!result.success || !result.audioUrl) {
          throw new Error(result.error || 'Failed to generate TTS audio');
        }

        console.log(`✅ Generated TTS for segment: ${options.segmentId}, now applying SoX processing...`);

        // Step 2: Apply SoX processing to the TTS audio
        try {
          // Get the cached file path for TTS audio using the same cache key generation as TTS
          const { generateCacheKey, generateCacheHash } = await import('./audio-cache');
          const ttsCacheKey = generateCacheKey(auditionOptions);
          const hashedCacheKey = generateCacheHash(ttsCacheKey);
          
          // Build the expected cache file path (same as audio-cache.ts logic)
          const expectedCacheFile = `${hashedCacheKey}.wav`;
          
          console.log(`🔍 Looking for TTS cache file: ${expectedCacheFile}`);
          
          // Try to find the cached TTS file using the proper cache path
          const ttsAudioPath = await window.khipu!.call('audioCache:path', hashedCacheKey);
          
          if (!ttsAudioPath) {
            console.warn('❌ Could not find cached TTS file, falling back to raw audio');
            // Fallback: play without SoX processing
            const response = await fetch(result.audioUrl);
            if (!response.ok) {
              throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
              throw new Error('Received empty audio data from TTS service');
            }
            this.currentBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            await this.startPlayback(options.startTime, options.duration);
            return;
          }

          console.log(`✅ Found TTS audio file at: ${ttsAudioPath}`);

          // Debug: Log the processing chain being applied
          console.log('🔧 Processing chain being applied:', JSON.stringify(options.processingChain, null, 2));

          // Debug: Check which effects are actually enabled
          const enabledEffects = [];
          if (options.processingChain.noiseCleanup?.highPassFilter?.enabled) {
            enabledEffects.push(`High Pass Filter: ${options.processingChain.noiseCleanup.highPassFilter.frequency}Hz`);
          }
          if (options.processingChain.dynamicControl?.compression?.enabled) {
            enabledEffects.push(`Compression: ${options.processingChain.dynamicControl.compression.ratio} @ ${options.processingChain.dynamicControl.compression.threshold}dB`);
          }
          if (options.processingChain.eqShaping?.presenceBoost?.enabled) {
            enabledEffects.push(`Presence Boost: +${options.processingChain.eqShaping.presenceBoost.gain}dB @ ${options.processingChain.eqShaping.presenceBoost.frequency}kHz`);
          }
          if (options.processingChain.spatialEnhancement?.reverb?.enabled) {
            enabledEffects.push(`Reverb: ${options.processingChain.spatialEnhancement.reverb.type} ${options.processingChain.spatialEnhancement.reverb.wetMix}%`);
          }
          if (options.processingChain.mastering?.normalization?.enabled) {
            enabledEffects.push(`Normalization: ${options.processingChain.mastering.normalization.targetLUFS} LUFS`);
          }
          
          console.log('🎛️ Enabled effects:', enabledEffects.length > 0 ? enabledEffects : ['NONE - Effects might be disabled!']);

          const processingResult = await window.khipu!.call('audioProcessor:processAudio', {
            audioUrl: ttsAudioPath, // Pass the actual cached file path
            processingChain: options.processingChain,
            cacheKey: cacheKey
          });

          if (!processingResult.success) {
            throw new Error('SoX processing failed: ' + (processingResult.error || 'Unknown error'));
          }

          processedAudioPath = processingResult.outputPath || null;
          console.log(`✅ Applied SoX processing to segment ${options.segmentId}`);
        } catch (processingError) {
          console.warn('SoX processing failed, falling back to raw TTS:', processingError);
          // Fallback to raw TTS audio without processing
          const response = await fetch(result.audioUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch fallback audio: ${response.status} ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            throw new Error('Received empty fallback audio data from TTS service');
          }
          this.currentBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
          await this.startPlayback(options.startTime, options.duration);
          return;
        }
      } else {
        console.log(`🎵 Found cached SoX-processed audio for segment ${options.segmentId}`);
      }

      // Step 3: Load and play the SoX-processed audio
      if (processedAudioPath) {
        const audioData = await window.khipu!.call('fs:readAudioFile', processedAudioPath);
        console.log(`🎵 Received audio data type: ${audioData?.constructor?.name}, length: ${audioData?.byteLength || 'unknown'}`);
        
        // Ensure we have a valid ArrayBuffer
        if (!audioData || !(audioData instanceof ArrayBuffer)) {
          const dataType = audioData ? Object.prototype.toString.call(audioData) : 'null/undefined';
          throw new Error(`Invalid audio data received: expected ArrayBuffer, got ${dataType}`);
        }
        
        if (audioData.byteLength === 0) {
          throw new Error('Received empty audio buffer');
        }
        
        this.currentBuffer = await this.audioContext.decodeAudioData(audioData);
      } else {
        throw new Error('No processed audio path available');
      }
      
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

  /**
   * Save audio data to a temporary file for SoX processing
   * @deprecated Not needed anymore - using direct cached TTS files
   */
  private async saveTempAudio(_arrayBuffer: ArrayBuffer, _segmentId: string): Promise<string> {
    // This method is kept for reference but not used
    // We now use cached TTS files directly
    throw new Error('saveTempAudio is deprecated - using cached TTS files directly');
  }
}

// Export singleton instance
export const audioPreviewService = new AudioPreviewService();