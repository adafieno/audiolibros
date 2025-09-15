// Additional segments utilities for audio production
// These segments exist only in the audio production layer and do not affect the original plan data

import type { AudioSegmentRow } from "../types/audio-production";

/**
 * Validates an audio file for use as a sound effect
 * @param file The audio file to validate
 * @returns Validation result with success status and error details
 */
export async function validateAudioFile(file: File): Promise<{
  valid: boolean;
  error?: string;
  duration?: number;
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
  format?: string;
}> {
  try {
    // Supported audio formats
    const supportedFormats = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac'];
    const fileExtension = '.' + file.name.toLowerCase().split('.').pop();
    
    if (!supportedFormats.includes(fileExtension)) {
      return { 
        valid: false, 
        error: `Unsupported format. Supported formats: ${supportedFormats.join(', ')}` 
      };
    }

    // Check file size (300 seconds max at various bitrates)
    // WAV: 48kHz stereo 24-bit ≈ 51MB for 300s
    // MP3: 320kbps ≈ 12MB for 300s
    // General max: 60MB to be safe
    const maxSizeBytes = 60 * 1024 * 1024; // 60MB
    if (file.size > maxSizeBytes) {
      return { valid: false, error: 'File too large (max 300 seconds or 60MB)' };
    }

    // Basic format detection and estimated duration
    let estimatedDuration = 0;
    const format = fileExtension.replace('.', '').toUpperCase();

    if (fileExtension === '.wav') {
      // For WAV files, we can make a better duration estimate
      estimatedDuration = Math.min(file.size / (44100 * 2 * 2), 300); // Rough estimate
    } else if (fileExtension === '.mp3') {
      // For MP3, assume average bitrate of 192kbps
      estimatedDuration = Math.min((file.size * 8) / (192 * 1000), 300);
    } else if (['.m4a', '.aac'].includes(fileExtension)) {
      // For AAC/M4A, assume average bitrate of 256kbps
      estimatedDuration = Math.min((file.size * 8) / (256 * 1000), 300);
    } else if (fileExtension === '.ogg') {
      // For OGG, assume average bitrate of 192kbps
      estimatedDuration = Math.min((file.size * 8) / (192 * 1000), 300);
    } else if (fileExtension === '.flac') {
      // For FLAC, assume roughly 50% compression of CD quality
      estimatedDuration = Math.min(file.size / (44100 * 2 * 2 * 0.5), 300);
    }

    return {
      valid: true,
      duration: estimatedDuration,
      sampleRate: 44100, // Default assumption
      channels: 2, // Default assumption
      bitDepth: 16, // Default assumption
      format: format
    };
  } catch (error) {
    return { valid: false, error: `Validation error: ${error}` };
  }
}

/**
 * Backward compatibility function for WAV file validation
 * @deprecated Use validateAudioFile instead
 */
export const validateWavFile = validateAudioFile;

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