/**
 * Segment TTS Generation Service
 * Handles on-demand TTS generation for segments when base audio doesn't exist
 */

import type { Segment } from '../types/plan';
import type { Character } from '../types/character';
import type { ProjectConfig } from '../types/config';
import type { Voice } from '../types/voice';
import { generateAuditionDirect } from './tts-audition';

export interface SegmentTTSOptions {
  segment: Segment;
  character: Character;
  projectConfig: ProjectConfig;
}

export interface SegmentTTSResult {
  success: boolean;
  audioFilePath?: string;
  error?: string;
}

/**
 * Generate TTS audio for a segment and save it to the filesystem cache
 */
export async function generateSegmentAudio(options: SegmentTTSOptions): Promise<SegmentTTSResult> {
  const { segment, character, projectConfig } = options;

  if (!character?.voiceAssignment) {
    return {
      success: false,
      error: `No voice assignment found for character: ${segment.voice}`
    };
  }

  try {
    console.log(`🎤 Generating TTS audio for segment ${segment.segment_id} with character ${character.name}`);

    // Create voice object from character voice assignment (same logic as Planning page)
    const voiceId = character.voiceAssignment.voiceId;
    const voice: Voice = {
      id: voiceId,
      engine: "azure", // Default to Azure since that's what most voice IDs use
      locale: voiceId.startsWith("es-") ? voiceId.substring(0, 5) : "es-ES", // Extract locale from voice ID
      gender: character.traits?.gender || "N",
      age_hint: character.traits?.age || "adult",
      accent_tags: character.traits?.accent ? [character.traits.accent] : [],
      styles: character.voiceAssignment.style ? [character.voiceAssignment.style] : [],
      description: `Voice for ${character.name}`
    };

    // Use the segment's text for TTS generation
    const segmentText = segment.text || segment.originalText || "";
    if (!segmentText.trim()) {
      return {
        success: false,
        error: `No text available for segment ${segment.segment_id}`
      };
    }

    console.log(`🎤 TTS Generation parameters:`, {
      segmentId: segment.segment_id,
      voiceId: voice.id,
      textLength: segmentText.length,
      style: character.voiceAssignment.style,
      styledegree: character.voiceAssignment.styledegree,
      rate_pct: character.voiceAssignment.rate_pct,
      pitch_pct: character.voiceAssignment.pitch_pct
    });

    // Generate TTS audio using the audition system
    const auditionResult = await generateAuditionDirect({
      voice,
      config: projectConfig,
      text: segmentText,
      style: character.voiceAssignment.style,
      styledegree: character.voiceAssignment.styledegree,
      rate_pct: character.voiceAssignment.rate_pct,
      pitch_pct: character.voiceAssignment.pitch_pct
    });

    if (!auditionResult.success || !auditionResult.audioUrl) {
      return {
        success: false,
        error: `TTS generation failed: ${auditionResult.error || 'Unknown error'}`
      };
    }

    // Save the generated audio to the filesystem cache
    const targetPath = `audio/segments/${segment.segment_id}.wav`;
    
    try {
      console.log(`💾 Saving generated audio to: ${targetPath}`);
      
      // Convert blob URL to audio data and save to filesystem
      const result = await window.khipu!.call('tts:saveSegmentAudio', {
        audioUrl: auditionResult.audioUrl,
        segmentId: segment.segment_id,
        targetPath
      }) as { success: boolean; error?: string };

      if (!result.success) {
        return {
          success: false,
          error: `Failed to save audio to filesystem: ${result.error}`
        };
      }

      // Clean up the blob URL to prevent memory leaks
      URL.revokeObjectURL(auditionResult.audioUrl);

      console.log(`✅ Successfully generated and saved TTS audio for segment ${segment.segment_id}`);
      
      return {
        success: true,
        audioFilePath: targetPath
      };

    } catch (saveError) {
      console.error('Failed to save TTS audio to filesystem:', saveError);
      return {
        success: false,
        error: `Failed to save audio: ${saveError instanceof Error ? saveError.message : 'Unknown error'}`
      };
    }

  } catch (error) {
    console.error('TTS generation failed:', error);
    return {
      success: false,
      error: `TTS generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}