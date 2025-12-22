/**
 * Audio Production Hook
 * 
 * Provides state management and API calls for the audio production module
 */
import { useState, useCallback } from 'react';
import { audioProductionApi } from '../api/audio-production';
import type {
  SegmentAudioRequest,
  SegmentAudioResponse,
  AudioProcessingChain,
  SfxUploadResponse,
  AudioSegmentData,
} from '../types/audio-production';

export function useAudioProduction(projectId: string, chapterId: string, chapterUuid?: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<AudioSegmentData[]>([]);

  /**
   * Load chapter audio production data
   */
  const loadChapterData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await audioProductionApi.getChapterAudioProduction(projectId, chapterId);
      console.log('[useAudioProduction] Loaded segments:', data.segments.slice(0, 3).map(s => ({id: s.segment_id, duration: s.duration, has_audio: s.has_audio})));
      setSegments(data.segments);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load chapter data';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [projectId, chapterId]);

  /**
   * Generate audio for a segment
   */
  const generateSegmentAudio = useCallback(async (
    segmentId: string,
    request: SegmentAudioRequest
  ): Promise<SegmentAudioResponse> => {
    try {
      setError(null);
      
      const response = await audioProductionApi.generateSegmentAudio(
        projectId,
        chapterId,
        segmentId,
        request
      );
      
      // Update segment in local state
      setSegments(prev => prev.map(seg => 
        seg.segment_id === segmentId
          ? { ...seg, has_audio: true, raw_audio_url: response.raw_audio_url, duration: response.duration }
          : seg
      ));
      
      return response;
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate audio';
      setError(errorMessage);

      throw err;
    }
  }, [projectId, chapterId]);

  /**
   * Update processing chain for a segment
   */
  const updateProcessingChain = useCallback(async (
    segmentId: string,
    processingChain: AudioProcessingChain,
    presetId?: string
  ): Promise<void> => {
    try {
      setError(null);
      
      await audioProductionApi.updateProcessingChain(
        projectId,
        chapterId,
        segmentId,
        { processing_chain: processingChain, preset_id: presetId }
      );
      
      // Update segment in local state
      setSegments(prev => prev.map(seg => 
        seg.segment_id === segmentId
          ? { ...seg, processing_chain: processingChain, preset_id: presetId }
          : seg
      ));
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update processing chain';
      setError(errorMessage);
      throw err;
    }
  }, [projectId, chapterId]);

  /**
   * Toggle revision mark for a segment
   */
  const toggleRevisionMark = useCallback(async (
    segmentId: string,
    needsRevision: boolean,
    notes?: string
  ): Promise<void> => {
    try {
      setError(null);
      console.log('[useAudioProduction] toggleRevisionMark called:', { segmentId, needsRevision, notes });
      
      // Use chapter UUID if available, otherwise fall back to chapterId (order)
      const chapterIdForApi = chapterUuid || chapterId;
      console.log('[useAudioProduction] Using chapterId for API:', chapterIdForApi);
      
      await audioProductionApi.updateRevisionMark(
        projectId,
        chapterIdForApi,
        segmentId,
        { needs_revision: needsRevision, notes }
      );
      
      console.log('[useAudioProduction] API call successful, updating local state');
      
      // Update segment in local state
      setSegments(prev => prev.map(seg => 
        seg.segment_id === segmentId
          ? { ...seg, needs_revision: needsRevision }
          : seg
      ));
      
      console.log('[useAudioProduction] Local state updated');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update revision mark';
      console.error('[useAudioProduction] toggleRevisionMark error:', errorMessage, err);
      setError(errorMessage);
      throw err;
    }
  }, [projectId, chapterId, chapterUuid]);

  /**
   * Upload an SFX file
   */
  const uploadSfx = useCallback(async (
    file: File,
    displayOrder: number
  ): Promise<SfxUploadResponse> => {
    try {
      setError(null);
      
      const response = await audioProductionApi.uploadSfx(
        projectId,
        chapterId,
        file,
        displayOrder
      );
      
      // Add new SFX segment to local state
      const newSegment: AudioSegmentData = {
        segment_id: response.id,
        type: 'sfx',
        display_order: displayOrder,
        raw_audio_url: response.blob_url,
        has_audio: true,
        needs_revision: false,
        duration: response.duration,
      };
      
      setSegments(prev => [...prev, newSegment].sort((a, b) => a.display_order - b.display_order));
      
      return response;
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload SFX';
      setError(errorMessage);
      throw err;
    }
  }, [projectId, chapterId]);

  /**
   * Move an SFX segment
   */
  const moveSfxSegment = useCallback(async (
    sfxId: string,
    newDisplayOrder: number
  ): Promise<void> => {
    try {
      setError(null);
      
      await audioProductionApi.updateSfxPosition(
        projectId,
        chapterId,
        sfxId,
        { display_order: newDisplayOrder }
      );
      
      // Update segment in local state
      setSegments(prev => prev.map(seg => 
        seg.segment_id === sfxId
          ? { ...seg, display_order: newDisplayOrder }
          : seg
      ).sort((a, b) => a.display_order - b.display_order));
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to move SFX';
      setError(errorMessage);
      throw err;
    }
  }, [projectId, chapterId]);

  /**
   * Delete an SFX segment
   */
  const deleteSfxSegment = useCallback(async (sfxId: string): Promise<void> => {
    try {
      setError(null);
      
      await audioProductionApi.deleteSfx(projectId, chapterId, sfxId);
      
      // Remove segment from local state
      setSegments(prev => prev.filter(seg => seg.segment_id !== sfxId));
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete SFX';
      setError(errorMessage);
      throw err;
    }
  }, [projectId, chapterId]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    loading,
    error,
    segments,
    
    // Actions
    loadChapterData,
    generateSegmentAudio,
    updateProcessingChain,
    toggleRevisionMark,
    uploadSfx,
    moveSfxSegment,
    deleteSfxSegment,
    clearError,
  };
}
