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
  private progressTrackingInterval: number | null = null;
  private segmentDurations: number[] = [];
  private progressCallback: ((currentSegmentIndex: number, segmentDurations: number[]) => void) | null = null;

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
    console.log('🔔 [AudioService] Adding playback state callback, current count:', this.playbackStateCallbacks.length);
    this.playbackStateCallbacks.push(callback);
    console.log('🔔 [AudioService] Added callback, new count:', this.playbackStateCallbacks.length);
    
    // Return unsubscribe function
    return () => {
      const index = this.playbackStateCallbacks.indexOf(callback);
      if (index > -1) {
        console.log('🔔 [AudioService] Removing callback, index:', index);
        this.playbackStateCallbacks.splice(index, 1);
        console.log('🔔 [AudioService] Removed callback, new count:', this.playbackStateCallbacks.length);
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

    console.log('🔔 [AudioService] notifyStateChange called:', {
      isPlaying: this.isPlaying,
      currentTime: state.currentTime,
      duration: state.duration,
      segmentId: this.currentSegmentId,
      callbackCount: this.playbackStateCallbacks.length
    });

    this.playbackStateCallbacks.forEach((callback, index) => {
      console.log(`🔔 [AudioService] Calling callback ${index + 1}/${this.playbackStateCallbacks.length}`);
      callback(state);
    });
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
    
    console.log('🎵 [AudioService] Starting playback with parameters:', {
      when,
      offset,
      playDuration,
      bufferDuration: this.currentBuffer.duration,
      segmentId: this.currentSegmentId
    });
    
    this.currentSource.start(when, offset, playDuration);
    this.startTime = this.audioContext.currentTime - offset;
    this.pauseTime = 0;
    this.isPlaying = true;
    
    console.log('🎵 [AudioService] Set isPlaying = true, calling notifyStateChange...');
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
    
    // Clear progress tracking
    this.stopProgressTracking();
    
    this.isPlaying = false;
    this.pauseTime = 0;
    this.currentBuffer = null;
    this.currentSegmentId = null;
    this.notifyStateChange();
  }

  /**
   * Start playlist progress tracking
   */
  private startPlaylistProgressTracking(segmentDurations: number[], progressCallback: (currentSegmentIndex: number, segmentDurations: number[]) => void): void {
    this.segmentDurations = segmentDurations;
    this.progressCallback = progressCallback;
    
    // Start tracking progress every 100ms
    this.progressTrackingInterval = window.setInterval(() => {
      if (!this.isPlaying || !this.audioContext) return;
      
      const currentTime = this.getCurrentTime();
      const currentSegmentIndex = this.getCurrentSegmentIndex(currentTime);
      
      if (this.progressCallback) {
        this.progressCallback(currentSegmentIndex, this.segmentDurations);
      }
    }, 100);
  }

  /**
   * Calculate which segment is currently playing based on elapsed time
   */
  private getCurrentSegmentIndex(currentTime: number): number {
    let accumulatedTime = 0;
    
    for (let i = 0; i < this.segmentDurations.length; i++) {
      if (currentTime >= accumulatedTime && currentTime < accumulatedTime + this.segmentDurations[i]) {
        return i;
      }
      accumulatedTime += this.segmentDurations[i];
    }
    
    // If we're past all segments, return the last one
    return Math.max(0, this.segmentDurations.length - 1);
  }

  /**
   * Stop progress tracking
   */
  private stopProgressTracking(): void {
    if (this.progressTrackingInterval !== null) {
      window.clearInterval(this.progressTrackingInterval);
      this.progressTrackingInterval = null;
    }
    this.segmentDurations = [];
    this.progressCallback = null;
  }

  /**
   * Play All segments as a continuous playlist
   * This approach eliminates state synchronization issues by creating one continuous audio stream
   */
  async playAllAsPlaylist(segments: Array<{
    segmentId: string;
    processingChain: AudioProcessingChain;
    segment: Segment;
    character: Character;
    projectConfig: ProjectConfig;
  }>, onProgress?: (currentSegmentIndex: number, segmentDurations: number[]) => void): Promise<void> {
    try {
      console.log(`🎬 [Playlist] Starting Play All with ${segments.length} segments`);
      
      // Stop any current playbook
      await this.stop();

      if (!this.audioContext) {
        await this.initializeAudioContext();
        if (!this.audioContext) {
          throw new Error('Audio context not available');
        }
      }

      // Step 1: Pre-process all segments and collect audio buffers
      const audioBuffers: AudioBuffer[] = [];
      const segmentIds: string[] = [];
      const segmentDurations: number[] = [];
      
      for (let i = 0; i < segments.length; i++) {
        const segmentData = segments[i];
        console.log(`🎵 [Playlist] Processing segment ${i + 1}/${segments.length}: ${segmentData.segmentId}`);
        
        try {
          // Generate processed audio for this segment
          const audioBuffer = await this.generateSegmentAudioBuffer(segmentData);
          audioBuffers.push(audioBuffer);
          segmentIds.push(segmentData.segmentId);
          segmentDurations.push(audioBuffer.duration);
          console.log(`✅ [Playlist] Segment ${i + 1} processed: ${audioBuffer.duration.toFixed(2)}s`);
        } catch (error) {
          console.warn(`⚠️ [Playlist] Failed to process segment ${i + 1}, skipping:`, error);
          // Continue with other segments
        }
      }

      if (audioBuffers.length === 0) {
        throw new Error('No segments could be processed');
      }

      // Step 2: Concatenate all audio buffers into one continuous stream
      console.log(`🔗 [Playlist] Concatenating ${audioBuffers.length} audio buffers...`);
      const concatenatedBuffer = await this.concatenateAudioBuffers(audioBuffers);
      console.log(`✅ [Playlist] Created continuous audio: ${concatenatedBuffer.duration.toFixed(2)}s total`);

      // Step 3: Play the concatenated audio with progress tracking
      this.currentBuffer = concatenatedBuffer;
      this.currentSegmentId = `playlist_${segmentIds.join('_')}`;
      
      // Set up progress tracking if callback provided
      if (onProgress) {
        this.startPlaylistProgressTracking(segmentDurations, onProgress);
      }
      
      await this.startPlayback();
      console.log(`🎉 [Playlist] Started continuous playback of ${segments.length} segments`);
      
    } catch (error) {
      console.error('🚫 [Playlist] Play All failed:', error);
      throw error;
    }
  }

  /**
   * Generate processed audio buffer for a single segment
   */
  private async generateSegmentAudioBuffer(segmentData: {
    segmentId: string;
    processingChain: AudioProcessingChain;
    segment: Segment;
    character: Character;
    projectConfig: ProjectConfig;
  }): Promise<AudioBuffer> {
    // Generate cache key for processed audio
    const processingParams = JSON.stringify(segmentData.processingChain);
    const longCacheKey = `sox_segment_${segmentData.segmentId}_${processingParams}`;
    
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
      processedAudioPath = await window.khipu!.call('audioProcessor:getCachedAudioPath', cacheKey);
    } catch {
      // Will generate below
    }

    if (!processedAudioPath) {
      // Generate TTS + apply SoX processing
      const { generateCachedAudition } = await import('./audio-cache');

      const voiceAssignment = segmentData.character.voiceAssignment;
      if (!voiceAssignment) {
        throw new Error(`Character ${segmentData.character.name} has no voice assignment`);
      }

      const voice = {
        id: voiceAssignment.voiceId,
        engine: "azure" as const,
        locale: voiceAssignment.voiceId.startsWith("es-") ? voiceAssignment.voiceId.substring(0, 5) : "es-ES",
        gender: segmentData.character.traits?.gender || "N" as const,
        age_hint: segmentData.character.traits?.age || "adult",
        accent_tags: segmentData.character.traits?.accent ? [segmentData.character.traits.accent] : [],
        styles: voiceAssignment.style ? [voiceAssignment.style] : [],
        description: `Voice for ${segmentData.character.name || segmentData.segmentId}`
      };

      const auditionOptions = {
        voice: voice,
        config: segmentData.projectConfig,
        text: segmentData.segment.text,
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

      // Apply SoX processing
      const { generateCacheKey, generateCacheHash } = await import('./audio-cache');
      const ttsCacheKey = generateCacheKey(auditionOptions);
      const hashedCacheKey = generateCacheHash(ttsCacheKey);
      
      // Retry logic for TTS cache file availability
      let ttsAudioPath: string | null = null;
      const maxRetries = 5;
      const retryDelay = 200; // ms
      
      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          ttsAudioPath = await window.khipu!.call('audioCache:path', hashedCacheKey);
          if (ttsAudioPath) {
            console.log(`✅ [Playlist] Found TTS cache file on attempt ${retry + 1}: ${hashedCacheKey}`);
            break;
          }
        } catch (error) {
          console.warn(`⚠️ [Playlist] TTS cache lookup attempt ${retry + 1} failed:`, error);
        }
        
        if (retry < maxRetries - 1) {
          console.log(`🔄 [Playlist] Waiting ${retryDelay}ms before retry ${retry + 2}...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
      
      if (!ttsAudioPath) {
        throw new Error(`Could not find cached TTS file after ${maxRetries} attempts: ${hashedCacheKey}`);
      }

      const processingResult = await window.khipu!.call('audioProcessor:processAudio', {
        audioUrl: ttsAudioPath,
        processingChain: segmentData.processingChain,
        cacheKey: cacheKey
      });

      if (!processingResult.success) {
        throw new Error('SoX processing failed: ' + (processingResult.error || 'Unknown error'));
      }

      processedAudioPath = processingResult.outputPath || null;
    }

    if (!processedAudioPath) {
      throw new Error('No processed audio path available');
    }

    // Load audio data and decode to AudioBuffer
    const audioData = await window.khipu!.call('fs:readAudioFile', processedAudioPath);
    
    if (!audioData || !(audioData instanceof ArrayBuffer)) {
      throw new Error('Invalid audio data received');
    }
    
    if (audioData.byteLength === 0) {
      throw new Error('Received empty audio buffer');
    }
    
    return await this.audioContext!.decodeAudioData(audioData);
  }

  /**
   * Concatenate multiple audio buffers into one continuous buffer
   */
  private async concatenateAudioBuffers(buffers: AudioBuffer[]): Promise<AudioBuffer> {
    if (buffers.length === 0) {
      throw new Error('No buffers to concatenate');
    }

    if (buffers.length === 1) {
      return buffers[0];
    }

    // Calculate total duration and ensure all buffers have same sample rate and channels
    const sampleRate = buffers[0].sampleRate;
    const numberOfChannels = buffers[0].numberOfChannels;
    
    let totalLength = 0;
    for (const buffer of buffers) {
      if (buffer.sampleRate !== sampleRate) {
        throw new Error(`Sample rate mismatch: ${buffer.sampleRate} vs ${sampleRate}`);
      }
      if (buffer.numberOfChannels !== numberOfChannels) {
        throw new Error(`Channel count mismatch: ${buffer.numberOfChannels} vs ${numberOfChannels}`);
      }
      totalLength += buffer.length;
    }

    // Create new buffer with total length
    const concatenatedBuffer = this.audioContext!.createBuffer(
      numberOfChannels,
      totalLength,
      sampleRate
    );

    // Copy data from all buffers
    let offset = 0;
    for (const buffer of buffers) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        concatenatedBuffer.getChannelData(channel).set(channelData, offset);
      }
      offset += buffer.length;
    }

    return concatenatedBuffer;
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