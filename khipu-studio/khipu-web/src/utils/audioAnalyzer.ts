/**
 * Audio Analysis Utility
 * Analyzes audio characteristics and suggests optimal processing chain
 */

import type { AudioProcessingChain } from '../types/audio-production';

export interface AudioAnalysis {
  rmsLevel: number; // Average RMS in dB
  peakLevel: number; // Peak level in dB
  dynamicRange: number; // Difference between peak and RMS
  hasClipping: boolean;
  noiseFloor: number; // Estimated noise floor in dB
  spectralBalance: {
    lowEnergy: number; // 0-500 Hz
    midEnergy: number; // 500-4000 Hz
    highEnergy: number; // 4000-20000 Hz
  };
  isTooQuiet: boolean;
  isTooLoud: boolean;
  isMuddy: boolean;
  isToobright: boolean;
  hasSibilance: boolean;
  needsCompression: boolean;
}

export interface OptimizationResult {
  analysis: AudioAnalysis;
  processingChain: AudioProcessingChain;
  summary: string[];
}

/**
 * Analyze audio buffer and return characteristics
 */
export async function analyzeAudio(audioBuffer: AudioBuffer): Promise<AudioAnalysis> {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const length = channelData.length;

  // Calculate RMS (Root Mean Square) - average volume
  let sumSquares = 0;
  let peakAmplitude = 0;
  let clippingCount = 0;

  for (let i = 0; i < length; i++) {
    const sample = Math.abs(channelData[i]);
    sumSquares += sample * sample;
    peakAmplitude = Math.max(peakAmplitude, sample);
    if (sample > 0.99) clippingCount++;
  }

  const rms = Math.sqrt(sumSquares / length);
  const rmsDb = 20 * Math.log10(rms);
  const peakDb = 20 * Math.log10(peakAmplitude);
  const hasClipping = clippingCount > (length * 0.0001); // More than 0.01% clipping

  // Estimate noise floor (bottom 10% of RMS values in small windows)
  const windowSize = Math.floor(sampleRate * 0.1); // 100ms windows
  const windowCount = Math.floor(length / windowSize);
  const windowRms: number[] = [];

  for (let w = 0; w < windowCount; w++) {
    const start = w * windowSize;
    const end = Math.min(start + windowSize, length);
    let windowSum = 0;
    for (let i = start; i < end; i++) {
      windowSum += channelData[i] * channelData[i];
    }
    windowRms.push(Math.sqrt(windowSum / (end - start)));
  }

  windowRms.sort((a, b) => a - b);
  const noiseFloor = 20 * Math.log10(windowRms[Math.floor(windowRms.length * 0.1)] || 0.0001);

  // Perform FFT analysis for spectral balance
  const fftSize = 2048;
  const analyserBuffer = new Float32Array(fftSize);
  
  // Use offline audio context for FFT
  const offlineContext = new OfflineAudioContext(1, fftSize, sampleRate);
  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;
  
  const analyser = offlineContext.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0;
  
  source.connect(analyser);
  analyser.connect(offlineContext.destination);
  
  source.start(0);
  await offlineContext.startRendering();
  
  analyser.getFloatFrequencyData(analyserBuffer);

  // Calculate spectral energy in different bands
  const nyquist = sampleRate / 2;
  const binFreq = nyquist / (fftSize / 2);
  
  let lowEnergy = 0, midEnergy = 0, highEnergy = 0;
  let lowCount = 0, midCount = 0, highCount = 0;

  for (let i = 0; i < fftSize / 2; i++) {
    const freq = i * binFreq;
    const magnitude = analyserBuffer[i];
    
    if (freq < 500) {
      lowEnergy += magnitude;
      lowCount++;
    } else if (freq < 4000) {
      midEnergy += magnitude;
      midCount++;
    } else {
      highEnergy += magnitude;
      highCount++;
    }
  }

  lowEnergy = lowEnergy / lowCount;
  midEnergy = midEnergy / midCount;
  highEnergy = highEnergy / highCount;

  // Determine audio characteristics
  const dynamicRange = peakDb - rmsDb;
  const isTooQuiet = rmsDb < -30;
  const isTooLoud = rmsDb > -12;
  const isMuddy = lowEnergy > midEnergy + 3; // Low frequencies dominate
  const isToobright = highEnergy > midEnergy + 6; // High frequencies too prominent
  const hasSibilance = highEnergy > midEnergy + 8; // Excessive sibilance (s/sh sounds)
  const needsCompression = dynamicRange > 15; // Wide dynamic range

  return {
    rmsLevel: rmsDb,
    peakLevel: peakDb,
    dynamicRange,
    hasClipping,
    noiseFloor,
    spectralBalance: { lowEnergy, midEnergy, highEnergy },
    isTooQuiet,
    isTooLoud,
    isMuddy,
    isToobright,
    hasSibilance,
    needsCompression,
  };
}

/**
 * Generate optimal processing chain based on audio analysis
 */
export function generateOptimalProcessing(analysis: AudioAnalysis): OptimizationResult {
  const summary: string[] = [];
  const chain: AudioProcessingChain = {
    noiseCleanup: {
      noiseReduction: { enabled: false, amount: 20 },
      deEsser: { enabled: false, threshold: -25 },
      deClicker: { enabled: false, sensitivity: 50 },
    },
    dynamicControl: {
      compression: {
        enabled: false,
        threshold: -18,
        ratio: 3,
        attack: 10,
        release: 100,
      },
      limiting: { enabled: false, threshold: -2, release: 50 },
      normalization: { enabled: false, targetLevel: -18 },
    },
    eqShaping: {
      highPass: { enabled: false, frequency: 80, slope: 12 },
      lowPass: { enabled: false, frequency: 15000, slope: 6 },
      parametricEQ: { bands: [] },
    },
  };

  // Noise reduction
  if (analysis.noiseFloor > -60) {
    const noiseAmount = Math.min(50, Math.round((analysis.noiseFloor + 60) * 2));
    chain.noiseCleanup!.noiseReduction = { enabled: true, amount: noiseAmount };
    summary.push(`Applied noise reduction (${noiseAmount}%)`);
  }

  // De-esser for sibilance
  if (analysis.hasSibilance) {
    chain.noiseCleanup!.deEsser = { enabled: true, threshold: -22 };
    summary.push('Reduced sibilance');
  }

  // De-clicker
  if (analysis.hasClipping) {
    chain.noiseCleanup!.deClicker = { enabled: true, sensitivity: 70 };
    summary.push('Removed clicks and pops');
  }

  // Compression for dynamic range
  if (analysis.needsCompression) {
    const ratio = analysis.dynamicRange > 20 ? 4 : 3;
    chain.dynamicControl!.compression = {
      enabled: true,
      threshold: -20,
      ratio,
      attack: 10,
      release: 100,
    };
    summary.push(`Applied ${ratio}:1 compression`);
  }

  // Limiting for peaks
  if (analysis.peakLevel > -3 || analysis.hasClipping) {
    chain.dynamicControl!.limiting = { enabled: true, threshold: -1, release: 50 };
    summary.push('Applied peak limiting');
  }

  // Normalization
  if (analysis.isTooQuiet || analysis.isTooLoud) {
    chain.dynamicControl!.normalization = { enabled: true, targetLevel: -18 };
    summary.push(`Normalized to -18 LUFS`);
  }

  // EQ adjustments
  const eqBands: Array<{ frequency: number; gain: number; q: number }> = [];

  // High-pass filter (always helpful for speech)
  chain.eqShaping!.highPass = { enabled: true, frequency: 80, slope: 12 };

  // Address muddiness
  if (analysis.isMuddy) {
    eqBands.push({ frequency: 250, gain: -3, q: 1.0 });
    summary.push('Reduced low-mid muddiness');
  }

  // Boost presence if needed
  if (analysis.spectralBalance.midEnergy < -30) {
    eqBands.push({ frequency: 3000, gain: 2, q: 1.2 });
    summary.push('Enhanced vocal presence');
  }

  // Address excessive brightness
  if (analysis.isToobright) {
    eqBands.push({ frequency: 8000, gain: -2, q: 0.8 });
    chain.eqShaping!.lowPass = { enabled: true, frequency: 12000, slope: 6 };
    summary.push('Tamed excessive brightness');
  } else {
    // Add air if not too bright
    eqBands.push({ frequency: 10000, gain: 1, q: 0.7 });
    summary.push('Added high-end clarity');
  }

  chain.eqShaping!.parametricEQ = { bands: eqBands };

  if (summary.length === 0) {
    summary.push('Audio already well-balanced, minimal processing applied');
  }

  return {
    analysis,
    processingChain: chain,
    summary,
  };
}

/**
 * Main auto-optimize function
 * Fetches audio, analyzes it, and generates optimal processing
 */
export async function autoOptimizeSegment(
  audioUrl: string
): Promise<OptimizationResult> {
  // Fetch audio
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  
  // Decode audio
  // @ts-expect-error - webkitAudioContext is only needed for older Safari
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  // Analyze
  const analysis = await analyzeAudio(audioBuffer);
  
  // Generate optimal processing
  const result = generateOptimalProcessing(analysis);
  
  return result;
}
