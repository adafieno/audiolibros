/**
 * Segment TTS Generation Service
 * Uses the existing audio cache system instead of custom file saving
 */

import type { Segment } from '../types/plan';
import type { Character } from '../types/character';
import type { ProjectConfig } from '../types/config';
import type { Voice } from '../types/voice';
import { generateCachedAudition } from './audio-cache';
import { costTrackingService } from './cost-tracking-service';

export interface SegmentTTSOptions {
  segment: Segment;
  character: Character;
  projectConfig: ProjectConfig;
}

export interface SegmentTTSResult {
  success: boolean;
  audioUrl?: string; // Return the cached audio URL
  error?: string;
}

/**
 * Generate TTS audio for a segment using the existing cache system
 */
export async function generateSegmentAudio(options: SegmentTTSOptions): Promise<SegmentTTSResult> {
  const { segment, character, projectConfig } = options;

  // Check if TTS credentials are configured
  if (!projectConfig.creds?.tts?.azure?.key || !projectConfig.creds?.tts?.azure?.region) {
    return {
      success: false,
      error: `TTS generation requires Azure credentials. Please configure your Azure TTS key and region in Project Settings.`
    };
  }

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

    // Use the existing cached audition system instead of custom file saving
    const auditionResult = await generateCachedAudition({
      voice,
      config: projectConfig,
      text: segmentText,
      style: character.voiceAssignment.style,
      styledegree: character.voiceAssignment.styledegree,
      rate_pct: character.voiceAssignment.rate_pct,
      pitch_pct: character.voiceAssignment.pitch_pct
    });

    if (!auditionResult.success || !auditionResult.audioUrl) {
      const errorMessage = auditionResult.error || 'Unknown error';
      
      // Provide more helpful error messages for common issues
      if (errorMessage.includes('credentials not configured')) {
        return {
          success: false,
          error: `Azure TTS credentials not configured. Please add your Azure key and region in Project Settings.`
        };
      } else if (errorMessage.includes('Network error') || errorMessage.includes('fetch')) {
        return {
          success: false,
          error: `Network error connecting to Azure TTS. Please check your internet connection and Azure credentials.`
        };
      } else if (errorMessage.includes('Rate limited')) {
        return {
          success: false,
          error: `Azure TTS rate limit exceeded. Please wait a moment and try again.`
        };
      } else {
        return {
          success: false,
          error: `TTS generation failed: ${errorMessage}`
        };
      }
    }

    console.log(`✅ Successfully generated and cached TTS audio for segment ${segment.segment_id}`);
    
    // Track cost for TTS usage
    try {
      const wasCached = auditionResult.wasCached === true;
      console.log(`📊 Tracking TTS cost - wasCached: ${wasCached}, characters: ${segmentText.length}`);
      
      costTrackingService.trackTtsUsage({
        provider: 'azure-tts', // Assuming Azure TTS based on the credentials check
        operation: 'segment_audio_generation',
        charactersProcessed: segmentText.length,
        wasCached: wasCached,
        cacheHit: wasCached,
        projectId: projectConfig.bookMeta?.title || 'unknown',
        segmentId: segment.segment_id?.toString()
      });
    } catch (costError) {
      console.warn('Failed to track TTS cost:', costError);
      // Don't fail the main operation if cost tracking fails
    }
    
    return {
      success: true,
      audioUrl: auditionResult.audioUrl
    };

  } catch (error) {
    console.error('TTS generation failed:', error);
    return {
      success: false,
      error: `TTS generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}