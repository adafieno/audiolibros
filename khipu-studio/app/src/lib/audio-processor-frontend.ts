// FFmpeg-based Audio Processing Engine (Frontend)
// Handles professional audio processing chain through Electron IPC

import type { AudioProcessingChain } from '../types/audio-production';

// Processing options for audio operations
export interface ProcessingOptions {
  inputPath: string;
  outputPath: string;
  processingChain: AudioProcessingChain;
  tempDir?: string;
}

// Progress updates during processing  
export interface ProcessingProgress {
  stage: string;
  progress: number; // 0-100
  timeRemaining?: number; // seconds
}

// Result of audio processing operation
export interface AudioProcessingResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  duration?: number;
  fileSize?: number;
}

// Audio file information
export interface AudioFileInfo {
  duration: number;
  channels: number;
  sampleRate: number;
  bitRate: number;
  format: string;
}

/**
 * Frontend audio processor that communicates with Electron main process
 * for desktop-native FFmpeg operations
 */
export class AudioProcessorFrontend {
  private processingId = 0;

  constructor() {
    // Frontend processor works through IPC
  }

  /**
   * Process audio with the given processing chain
   */
  async processAudio(
    options: ProcessingOptions,
    onProgress?: (progress: ProcessingProgress) => void
  ): Promise<AudioProcessingResult> {
    const id = `process_${++this.processingId}`;
    
    try {
      // Send processing request to main process via IPC
      const result = await window.khipu!.call('audio:process', {
        id,
        ...options
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown processing error'
      };
    }
  }

  /**
   * Get audio file information
   */
  async getAudioInfo(filePath: string): Promise<AudioFileInfo> {
    try {
      const info = await window.khipu!.call('audio:info', filePath);
      return info;
    } catch (error) {
      throw new Error(`Failed to get audio info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate cache key for processed audio based on settings
   */
  generateCacheKey(inputPath: string, processingChain: AudioProcessingChain): string {
    // Create a deterministic hash based on file path and processing settings
    const settingsString = JSON.stringify(processingChain);
    const combinedString = `${inputPath}:${settingsString}`;
    
    // Simple hash function for cache key
    let hash = 0;
    for (let i = 0; i < combinedString.length; i++) {
      const char = combinedString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return `audio_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Check if cached processed audio exists
   */
  async hasCachedAudio(cacheKey: string): Promise<boolean> {
    try {
      return await window.khipu!.call('audio:cache:has', cacheKey);
    } catch {
      return false;
    }
  }

  /**
   * Get path to cached processed audio
   */
  async getCachedAudioPath(cacheKey: string): Promise<string | null> {
    try {
      return await window.khipu!.call('audio:cache:path', cacheKey);
    } catch {
      return null;
    }
  }

  /**
   * Convert processing chain to FFmpeg filter complex string
   * (This is mainly for debugging/logging purposes on frontend)
   */
  buildFilterComplex(chain: AudioProcessingChain): string {
    // Since the real filter building happens in the main process,
    // this is just a simplified representation for debugging
    const stages: string[] = [];
    
    if (chain.noiseCleanup.highPassFilter.enabled) {
      stages.push(`High-pass filter: ${chain.noiseCleanup.highPassFilter.frequency}Hz`);
    }
    
    if (chain.noiseCleanup.deClickDeEss.enabled) {
      stages.push(`De-click/De-ess: ${chain.noiseCleanup.deClickDeEss.intensity}`);
    }
    
    if (chain.dynamicControl.compression.enabled) {
      stages.push(`Compression: ${chain.dynamicControl.compression.ratio}, ${chain.dynamicControl.compression.threshold}dB`);
    }
    
    if (chain.dynamicControl.limiter.enabled) {
      stages.push(`Limiter: ${chain.dynamicControl.limiter.ceiling}dBFS`);
    }
    
    if (chain.eqShaping.lowMidCut.enabled) {
      stages.push(`Low-mid cut: ${chain.eqShaping.lowMidCut.frequency}Hz, ${chain.eqShaping.lowMidCut.gain}dB`);
    }
    
    if (chain.eqShaping.presenceBoost.enabled) {
      stages.push(`Presence boost: ${chain.eqShaping.presenceBoost.frequency}kHz, ${chain.eqShaping.presenceBoost.gain}dB`);
    }
    
    if (chain.eqShaping.airLift.enabled) {
      stages.push(`Air lift: ${chain.eqShaping.airLift.frequency}kHz, ${chain.eqShaping.airLift.gain}dB`);
    }
    
    if (chain.spatialEnhancement.reverb.enabled) {
      stages.push(`Reverb: ${chain.spatialEnhancement.reverb.type}, ${chain.spatialEnhancement.reverb.wetMix}%`);
    }
    
    if (chain.spatialEnhancement.stereoEnhancer.enabled) {
      stages.push(`Stereo enhancer: ${chain.spatialEnhancement.stereoEnhancer.width}%`);
    }
    
    if (chain.mastering.normalization.enabled) {
      stages.push(`Normalization: ${chain.mastering.normalization.targetLUFS}LUFS`);
    }
    
    if (chain.mastering.peakLimiting.enabled) {
      stages.push(`Peak limiting: ${chain.mastering.peakLimiting.maxPeak}dB`);
    }
    
    return stages.join(' → ');
  }

  /**
   * Cancel active processing operation
   */
  async cancelProcessing(id: string): Promise<void> {
    try {
      await window.khipu!.call('audio:cancel', id);
    } catch (error) {
      console.error('Failed to cancel processing:', error);
    }
  }
}

// Global processor instance
export const audioProcessor = new AudioProcessorFrontend();