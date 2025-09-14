// Additional segments utilities for audio production
// These segments exist only in the audio production layer and do not affect the original plan data

import type { AudioSegmentRow } from "../types/audio-production";

/**
 * Validates a WAV file for use as a sound effect
 * @param file The WAV file to validate
 * @returns Validation result with success status and error details
 */
export async function validateWavFile(file: File): Promise<{
  valid: boolean;
  error?: string;
  duration?: number;
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
}> {
  try {
    // Check file extension
    if (!file.name.toLowerCase().endsWith('.wav')) {
      return { valid: false, error: 'File must be a WAV file' };
    }

    // Check file size (300 seconds max at 48kHz stereo 24-bit ≈ 51MB)
    const maxSizeBytes = 51 * 1024 * 1024; // 51MB
    if (file.size > maxSizeBytes) {
      return { valid: false, error: 'File too large (max 300 seconds)' };
    }

    // For now, we'll do basic validation
    // In a full implementation, you would parse the WAV header to get:
    // - Sample rate (16-48kHz)
    // - Bit depth (16/24-bit)
    // - Channels (1-2)
    // - Duration (max 300s)

    return {
      valid: true,
      duration: Math.min(file.size / (44100 * 2 * 2), 300), // Rough estimate
      sampleRate: 44100, // Default assumption
      channels: 2, // Default assumption
      bitDepth: 16 // Default assumption
    };
  } catch (error) {
    return { valid: false, error: `Validation error: ${error}` };
  }
}

/**
 * Creates a sound effect segment for audio production
 * @param filename The original filename
 * @param relativePath Path relative to project root where the file will be stored
 * @param duration Duration in seconds (optional)
 * @returns AudioSegmentRow for sound effect
 */
export function createSfxSegment(
  filename: string,
  relativePath: string,
  duration?: number
): AudioSegmentRow {
  return {
    rowKey: `sfx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    segmentId: Date.now(), // Use timestamp as unique ID for additional segments
    displayOrder: 0, // Will be set when inserting
    chunkId: `sfx_${Date.now()}`,
    text: `[Sound Effect: ${filename}]`,
    voice: "",
    locked: false,
    sfxAfter: null,
    hasAudio: false,
    segmentType: 'sfx',
    isAdditional: true,
    sfxFile: {
      path: relativePath,
      filename: filename,
      duration: duration
    }
  };
}

/**
 * Inserts a segment at a specific position and updates display orders
 * @param currentSegments Current array of segments
 * @param newSegment New segment to insert
 * @param position Position to insert at (0-based index)
 * @returns Updated segments array with recalculated display orders
 */
export function insertSegmentAtPosition(
  currentSegments: AudioSegmentRow[],
  newSegment: AudioSegmentRow,
  position: number
): AudioSegmentRow[] {
  const insertIndex = Math.max(0, Math.min(position, currentSegments.length));
  
  // Create new array with segment inserted
  const updatedSegments = [...currentSegments];
  updatedSegments.splice(insertIndex, 0, newSegment);
  
  // Recalculate display orders
  return updatedSegments.map((segment, index) => ({
    ...segment,
    displayOrder: index
  }));
}