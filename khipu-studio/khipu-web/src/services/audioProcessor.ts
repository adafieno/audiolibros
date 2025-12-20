/**
 * Audio Processor Service
 * 
 * Handles client-side audio processing using Web Audio API.
 * Applies processing chains (EQ, compression, reverb, etc.) to raw cached audio.
 */

import type { AudioProcessingChain } from '../types/audio-production';

/**
 * Audio processing result
 */
export interface ProcessedAudio {
  buffer: AudioBuffer;
  duration: number;
  sampleRate: number;
}

/**
 * Audio processor class for applying effects to audio buffers
 */
export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private impulseResponseCache: Map<string, AudioBuffer> = new Map();

  /**
   * Initialize audio context (must be called after user interaction)
   */
  async initialize(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    
    // Resume if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Get or create audio context
   */
  getContext(): AudioContext {
    if (!this.audioContext) {
      throw new Error('AudioProcessor not initialized. Call initialize() first.');
    }
    return this.audioContext;
  }

  /**
   * Decode audio data from array buffer
   */
  async decodeAudio(audioData: ArrayBuffer): Promise<AudioBuffer> {
    return await this.getContext().decodeAudioData(audioData);
  }

  /**
   * Apply processing chain to audio buffer
   */
  async processAudio(
    audioBuffer: AudioBuffer,
    processingChain: AudioProcessingChain
  ): Promise<ProcessedAudio> {
    console.log('[AudioProcessor] Starting audio processing...');
    const startTime = performance.now();
    
    try {
      // Create offline context for processing
      const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
      );

      // Create source
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;

      // Build processing chain
      let currentNode: AudioNode = source;

      // 1. Apply De-esser (if enabled)
      if (processingChain.noiseCleanup?.deEsser?.enabled) {
        console.log('[AudioProcessor] Applying de-esser...');
        currentNode = this.applyDeEsser(currentNode, processingChain.noiseCleanup.deEsser, offlineContext);
      }

      // 2. Apply High-pass filter (if enabled)
      if (processingChain.eqShaping?.highPass?.enabled) {
        console.log('[AudioProcessor] Applying high-pass filter...');
        currentNode = this.applyHighPass(currentNode, processingChain.eqShaping.highPass, offlineContext);
      }

      // 3. Apply Low-pass filter (if enabled)
      if (processingChain.eqShaping?.lowPass?.enabled) {
        console.log('[AudioProcessor] Applying low-pass filter...');
        currentNode = this.applyLowPass(currentNode, processingChain.eqShaping.lowPass, offlineContext);
      }

      // 4. Apply Parametric EQ (if enabled)
      if (processingChain.eqShaping?.parametricEQ?.bands && processingChain.eqShaping.parametricEQ.bands.length > 0) {
        console.log('[AudioProcessor] Applying parametric EQ with', processingChain.eqShaping.parametricEQ.bands.length, 'bands...');
        currentNode = this.applyParametricEQ(currentNode, processingChain.eqShaping.parametricEQ, offlineContext);
      }

      // 5. Apply Compression (if enabled)
      if (processingChain.dynamicControl?.compression?.enabled) {
        console.log('[AudioProcessor] Applying compression...');
        currentNode = this.applyCompression(currentNode, processingChain.dynamicControl.compression, offlineContext);
      }

      // 6. Apply Reverb (if enabled)
      if (processingChain.spatialEnhancement?.reverb?.enabled) {
        console.log('[AudioProcessor] Applying reverb...');
        currentNode = await this.applyReverb(currentNode, processingChain.spatialEnhancement.reverb, offlineContext);
      }

      // 7. Apply Normalization (if enabled)
      if (processingChain.consistencyMastering?.loudnessNormalization?.enabled) {
        console.log('[AudioProcessor] Applying normalization...');
        currentNode = this.applyNormalization(currentNode, processingChain.consistencyMastering.loudnessNormalization, offlineContext);
      }

      // 8. Apply Limiter (if enabled)
      if (processingChain.dynamicControl?.limiting?.enabled) {
        console.log('[AudioProcessor] Applying limiter...');
        currentNode = this.applyLimiter(currentNode, processingChain.dynamicControl.limiting, offlineContext);
      }

      // Connect to destination
      currentNode.connect(offlineContext.destination);

      // Start processing
      source.start(0);

      console.log('[AudioProcessor] Rendering audio...');
      // Render
      const renderedBuffer = await offlineContext.startRendering();

      const elapsed = performance.now() - startTime;
      console.log('[AudioProcessor] ✓ Processing complete in', elapsed.toFixed(0), 'ms');

      return {
        buffer: renderedBuffer,
        duration: renderedBuffer.duration,
        sampleRate: renderedBuffer.sampleRate,
      };
    } catch (error) {
      const elapsed = performance.now() - startTime;
      console.error('[AudioProcessor] ✗ Processing failed after', elapsed.toFixed(0), 'ms:', error);
      throw error;
    }
  }

  /**
   * Apply de-essing
   */
  private applyDeEsser(
    input: AudioNode,
    deEsserConfig: { enabled: boolean; threshold: number },
    context: BaseAudioContext
  ): AudioNode {
    // De-esser is implemented as a multiband compressor focused on high frequencies
    
    // Create a filter to isolate sibilant frequencies (typically 5-8 kHz)
    const filter = context.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = 6000; // Center frequency for sibilants
    filter.Q.value = 2; // Narrow band
    filter.gain.value = 0; // No gain change, just isolation

    // Create compressor for the filtered signal
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = deEsserConfig.threshold;
    compressor.ratio.value = 4; // Moderate ratio for de-essing
    compressor.attack.value = 0.001; // Fast attack for sibilants
    compressor.release.value = 0.1; // Fast release

    // Create gain for dry/wet mix
    const wetGain = context.createGain();
    wetGain.gain.value = 0.5; // 50% wet

    const dryGain = context.createGain();
    dryGain.gain.value = 0.5; // 50% dry

    // Split signal
    input.connect(filter);
    input.connect(dryGain);

    // Process filtered signal
    filter.connect(compressor);
    compressor.connect(wetGain);

    // Merge back
    const merger = context.createGain();
    wetGain.connect(merger);
    dryGain.connect(merger);

    return merger;
  }

  /**
   * Apply high-pass filter
   */
  private applyHighPass(
    input: AudioNode,
    config: { enabled: boolean; frequency: number; slope: number },
    context: BaseAudioContext
  ): AudioNode {
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = config.frequency;
    filter.Q.value = config.slope / 12; // Convert slope to Q factor

    input.connect(filter);
    return filter;
  }

  /**
   * Apply low-pass filter
   */
  private applyLowPass(
    input: AudioNode,
    config: { enabled: boolean; frequency: number; slope: number },
    context: BaseAudioContext
  ): AudioNode {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = config.frequency;
    filter.Q.value = config.slope / 12; // Convert slope to Q factor

    input.connect(filter);
    return filter;
  }

  /**
   * Apply parametric EQ
   */
  private applyParametricEQ(
    input: AudioNode,
    eqConfig: { bands: Array<{ frequency: number; gain: number; q: number }> },
    context: BaseAudioContext
  ): AudioNode {
    let currentNode: AudioNode = input;

    // Apply each EQ band
    for (const band of eqConfig.bands) {
      const filter = context.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = band.frequency;
      filter.gain.value = band.gain;
      filter.Q.value = band.q;

      currentNode.connect(filter);
      currentNode = filter;
    }

    return currentNode;
  }

  /**
   * Apply dynamic range compression
   */
  private applyCompression(
    input: AudioNode,
    compressionConfig: {
      enabled: boolean;
      threshold: number;
      ratio: number;
      attack: number;
      release: number;
    },
    context: BaseAudioContext
  ): AudioNode {
    const compressor = context.createDynamicsCompressor();
    
    compressor.threshold.value = compressionConfig.threshold;
    compressor.ratio.value = compressionConfig.ratio;
    compressor.attack.value = compressionConfig.attack / 1000; // Convert ms to seconds
    compressor.release.value = compressionConfig.release / 1000;
    compressor.knee.value = 6; // Soft knee for musical compression

    input.connect(compressor);
    return compressor;
  }

  /**
   * Apply reverb effect
   */
  private async applyReverb(
    input: AudioNode,
    reverbConfig: {
      enabled: boolean;
      roomSize: number;
      damping: number;
      wetLevel: number;
    },
    context: BaseAudioContext
  ): Promise<AudioNode> {
    // Create convolver for reverb
    const convolver = context.createConvolver();
    
    // Generate or retrieve cached impulse response
    const cacheKey = `${reverbConfig.roomSize}_${reverbConfig.damping}_${context.sampleRate}`;
    let impulseResponse = this.impulseResponseCache.get(cacheKey);
    
    if (!impulseResponse) {
      console.log('[AudioProcessor] Generating new impulse response for reverb');
      impulseResponse = this.generateImpulseResponse(
        reverbConfig.roomSize,
        reverbConfig.damping,
        context
      );
      this.impulseResponseCache.set(cacheKey, impulseResponse);
    } else {
      console.log('[AudioProcessor] Using cached impulse response for reverb');
    }
    
    convolver.buffer = impulseResponse;

    // Create wet/dry mix
    const wetGain = context.createGain();
    wetGain.gain.value = reverbConfig.wetLevel;

    const dryGain = context.createGain();
    dryGain.gain.value = 1 - reverbConfig.wetLevel; // Dry is inverse of wet

    // Split signal
    input.connect(convolver);
    input.connect(dryGain);

    // Process wet signal
    convolver.connect(wetGain);

    // Merge back
    const merger = context.createGain();
    wetGain.connect(merger);
    dryGain.connect(merger);

    return merger;
  }

  /**
   * Generate impulse response for reverb
   */
  private generateImpulseResponse(
    roomSize: number,
    damping: number,
    context: BaseAudioContext
  ): AudioBuffer {
    const sampleRate = context.sampleRate;
    const length = sampleRate * roomSize; // Room size in seconds
    const buffer = context.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const channelData = buffer.getChannelData(channel);
      
      for (let i = 0; i < length; i++) {
        // Generate decaying white noise
        const decay = Math.exp(-i / (length * (1 - damping)));
        channelData[i] = (Math.random() * 2 - 1) * decay;
      }
    }

    return buffer;
  }

  /**
   * Apply normalization (simplified - actual LUFS calculation would be more complex)
   */
  private applyNormalization(
    input: AudioNode,
    normalizationConfig: { enabled: boolean; targetLUFS: number },
    context: BaseAudioContext
  ): AudioNode {
    // Simplified normalization using gain
    // In production, you'd calculate actual LUFS and adjust accordingly
    const targetGain = Math.pow(10, (normalizationConfig.targetLUFS + 23) / 20);
    
    const gain = context.createGain();
    gain.gain.value = targetGain;

    input.connect(gain);
    return gain;
  }

  /**
   * Apply limiting
   */
  private applyLimiter(
    input: AudioNode,
    limiterConfig: { enabled: boolean; threshold: number; release: number },
    context: BaseAudioContext
  ): AudioNode {
    // Limiter is a compressor with very high ratio and fast attack
    const compressor = context.createDynamicsCompressor();
    
    compressor.threshold.value = limiterConfig.threshold;
    compressor.ratio.value = 20; // Very high ratio
    compressor.attack.value = 0.001; // Very fast attack
    compressor.release.value = limiterConfig.release / 1000;
    compressor.knee.value = 0; // Hard knee

    input.connect(compressor);
    return compressor;
  }

  /**
   * Create an audio source for playback
   */
  createSource(buffer: AudioBuffer): AudioBufferSourceNode {
    const context = this.getContext();
    const source = context.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  /**
   * Get current time in audio context
   */
  getCurrentTime(): number {
    return this.getContext().currentTime;
  }

  /**
   * Close audio context and cleanup
   */
  async close(): Promise<void> {
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }

  /**
   * Encode AudioBuffer to Blob
   */
  async encodeToBlob(audioBuffer: AudioBuffer, mimeType: string = 'audio/wav'): Promise<Blob> {
    // Convert AudioBuffer to WAV blob
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length * numberOfChannels * 2; // 16-bit samples
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);
    
    // Write WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length, true);
    
    // Write audio data
    const channels = [];
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(audioBuffer.getChannelData(i));
    }
    
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return new Blob([buffer], { type: mimeType });
  }
}

// Singleton instance
let audioProcessorInstance: AudioProcessor | null = null;

/**
 * Get global audio processor instance
 */
export function getAudioProcessor(): AudioProcessor {
  if (!audioProcessorInstance) {
    audioProcessorInstance = new AudioProcessor();
  }
  return audioProcessorInstance;
}

/**
 * Initialize audio processor (call after user interaction)
 */
export async function initializeAudioProcessor(): Promise<void> {
  const processor = getAudioProcessor();
  await processor.initialize();
}
