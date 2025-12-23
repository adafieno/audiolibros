/**
 * Audio Production API Client
 */
import type {
  SegmentAudioRequest,
  SegmentAudioResponse,
  ProcessingChainResponse,
  ProcessingChainUpdateRequest,
  RevisionMarkRequest,
  SfxUploadResponse,
  SfxPositionUpdateRequest,
  ChapterAudioProductionResponse,
  SfxListResponse,
} from '../types/audio-production';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

function getAuthHeaders() {
  const token = localStorage.getItem('access_token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('access_token');
  
  // If no token, don't even try - return 401 immediately
  if (!token) {
    const response = new Response(null, { status: 401 });
    return response;
  }
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options.headers,
    },
  });

  // If 401, try to refresh token once
  if (response.status === 401) {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        const refreshResponse = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (refreshResponse.ok) {
          const { access_token } = await refreshResponse.json();
          localStorage.setItem('access_token', access_token);

          // Retry original request with new token
          return fetch(url, {
            ...options,
            headers: {
              ...getAuthHeaders(),
              ...options.headers,
            },
          });
        }
      } catch {
        // Token refresh failed - return the 401 response, don't redirect
        // Let the calling code handle it
      }
    }
    
    // If refresh failed or no refresh token, just return the 401
    // Don't redirect here - let the app decide what to do
  }

  return response;
}

export const audioProductionApi = {
  /**
   * Generate raw TTS audio for a segment
   */
  async generateSegmentAudio(
    projectId: string,
    chapterId: string,
    segmentId: string,
    request: SegmentAudioRequest
  ): Promise<{ blob: Blob; duration: number | null }> {
    // Returns audio Blob directly (same pattern as auditionVoice)
    const response = await fetchWithAuth(
      `${API_BASE}/api/v1/projects/${projectId}/chapters/${chapterId}/segments/${segmentId}/audio`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to generate segment audio' }));
      throw new Error(error.detail || 'Failed to generate segment audio');
    }
    
    // Extract duration from response headers
    const durationHeader = response.headers.get('X-Audio-Duration');
    const duration = durationHeader ? parseFloat(durationHeader) : null;
    
    // Get the audio blob
    const blob = await response.blob();
    
    // Log for debugging
    if (duration) {
      console.log('[API] Audio generated with duration:', duration, 'seconds');
    }
    
    return { blob, duration };
  },

  /**
   * Get processing chain configuration for a segment
   */
  async getProcessingChain(
    projectId: string,
    chapterId: string,
    segmentId: string
  ): Promise<ProcessingChainResponse> {
    const response = await fetchWithAuth(
      `${API_BASE}/api/v1/projects/${projectId}/chapters/${chapterId}/segments/${segmentId}/processing-chain`
    );
    
    if (!response.ok) {
      throw new Error('Failed to get processing chain');
    }
    
    return response.json();
  },

  /**
   * Update processing chain configuration for a segment
   */
  async updateProcessingChain(
    projectId: string,
    chapterId: string,
    segmentId: string,
    request: ProcessingChainUpdateRequest
  ): Promise<{ success: boolean }> {
    const response = await fetchWithAuth(
      `${API_BASE}/api/v1/projects/${projectId}/chapters/${chapterId}/segments/${segmentId}/processing-chain`,
      {
        method: 'PUT',
        body: JSON.stringify(request),
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to update processing chain');
    }
    
    return response.json();
  },

  /**
   * Mark or unmark a segment for revision
   */
  async updateRevisionMark(
    projectId: string,
    chapterId: string,
    segmentId: string,
    request: RevisionMarkRequest
  ): Promise<{ success: boolean }> {
    const response = await fetchWithAuth(
      `${API_BASE}/api/v1/projects/${projectId}/chapters/${chapterId}/segments/${segmentId}/revision`,
      {
        method: 'PUT',
        body: JSON.stringify(request),
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to update revision mark');
    }
    
    return response.json();
  },

  /**
   * Upload an SFX file
   */
  async uploadSfx(
    projectId: string,
    chapterId: string,
    file: File,
    displayOrder: number
  ): Promise<SfxUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('display_order', displayOrder.toString());

    const token = localStorage.getItem('access_token');
    const response = await fetch(
      `${API_BASE}/api/v1/projects/${projectId}/chapters/${chapterId}/sfx`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Don't set Content-Type for FormData - browser will set it with boundary
        },
        body: formData,
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorDetail = 'Failed to upload SFX';
      try {
        const errorJson = JSON.parse(errorText);
        errorDetail = errorJson.detail || errorJson.message || errorText;
      } catch {
        errorDetail = errorText || `HTTP ${response.status}`;
      }
      throw new Error(errorDetail);
    }
    
    return response.json();
  },

  /**
   * Update SFX segment position
   */
  async updateSfxPosition(
    projectId: string,
    chapterId: string,
    sfxId: string,
    request: SfxPositionUpdateRequest
  ): Promise<{ success: boolean }> {
    const response = await fetchWithAuth(
      `${API_BASE}/api/v1/projects/${projectId}/chapters/${chapterId}/sfx/${sfxId}/position`,
      {
        method: 'PUT',
        body: JSON.stringify(request),
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to update SFX position');
    }
    
    return response.json();
  },

  /**
   * Delete an SFX segment
   */
  async deleteSfx(
    projectId: string,
    chapterId: string,
    sfxId: string
  ): Promise<{ success: boolean }> {
    const response = await fetchWithAuth(
      `${API_BASE}/api/v1/projects/${projectId}/chapters/${chapterId}/sfx/${sfxId}`,
      {
        method: 'DELETE',
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to delete SFX');
    }
    
    return response.json();
  },

  /**
   * List all SFX segments for a chapter
   */
  async listSfxSegments(
    projectId: string,
    chapterId: string
  ): Promise<SfxListResponse> {
    const response = await fetchWithAuth(
      `${API_BASE}/api/v1/projects/${projectId}/chapters/${chapterId}/sfx`
    );
    
    if (!response.ok) {
      throw new Error('Failed to list SFX segments');
    }
    
    return response.json();
  },

  /**
   * Get combined audio production data for a chapter
   */
  async getChapterAudioProduction(
    projectId: string,
    chapterId: string
  ): Promise<ChapterAudioProductionResponse> {
    const response = await fetchWithAuth(
      `${API_BASE}/api/v1/projects/${projectId}/chapters/${chapterId}/audio-production`
    );
    
    if (!response.ok) {
      throw new Error('Failed to get chapter audio production data');
    }
    
    return response.json();
  },

  /**
   * Save a custom audio preset
   */
  async saveCustomPreset(
    projectId: string,
    name: string,
    description: string,
    processingChain: unknown,
    icon?: string
  ): Promise<{ id: string }> {
    const response = await fetchWithAuth(
      `${API_BASE}/api/v1/projects/${projectId}/audio-presets`,
      {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          processing_chain: processingChain,
          icon,
        }),
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to save custom preset');
    }
    
    return response.json();
  },

  /**
   * Get custom presets for a project
   */
  async getCustomPresets(projectId: string): Promise<Array<{
    id: string;
    name: string;
    description: string;
    processing_chain: unknown;
    created_at: string;
  }>> {
    const response = await fetchWithAuth(
      `${API_BASE}/api/v1/projects/${projectId}/audio-presets`
    );
    
    if (!response.ok) {
      throw new Error('Failed to get custom presets');
    }
    
    return response.json();
  },

  /**
   * Delete a custom preset
   */
  async deleteCustomPreset(projectId: string, presetId: string): Promise<void> {
    const response = await fetchWithAuth(
      `${API_BASE}/api/v1/projects/${projectId}/audio-presets/${presetId}`,
      {
        method: 'DELETE',
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to delete custom preset');
    }
  },
};
