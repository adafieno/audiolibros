/**
 * Planning API Client
 */
import type { ChapterPlan, Segment, PlanGenerateOptions } from '../types/planning';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

function getAuthHeaders() {
  const token = localStorage.getItem('access_token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export const planningApi = {
  /**
   * Health check for planning service
   */
  async healthCheck(): Promise<{ status: string }> {
    const response = await fetch(`${API_BASE}/api/v1/projects/test/planning/health`, {
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      throw new Error('Planning service health check failed');
    }
    
    return response.json();
  },

  /**
   * Generate plan for a chapter
   */
  async generatePlan(
    projectId: string,
    chapterId: string,
    options: PlanGenerateOptions = {}
  ): Promise<ChapterPlan> {
    const response = await fetch(
      `${API_BASE}/api/v1/projects/${projectId}/planning/chapters/${chapterId}/generate`,
      {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(options),
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to generate plan');
    }
    
    return response.json();
  },

  /**
   * Get existing plan for a chapter
   */
  async getPlan(projectId: string, chapterId: string): Promise<ChapterPlan | null> {
    const response = await fetch(
      `${API_BASE}/api/v1/projects/${projectId}/planning/chapters/${chapterId}/plan`,
      {
        headers: getAuthHeaders(),
      }
    );
    
    if (response.status === 404) {
      return null; // No plan exists yet
    }
    
    if (!response.ok) {
      throw new Error('Failed to fetch plan');
    }
    
    return response.json();
  },

  /**
   * Update plan segments
   */
  async updatePlan(
    projectId: string,
    chapterId: string,
    segments: Segment[]
  ): Promise<ChapterPlan> {
    const response = await fetch(
      `${API_BASE}/api/v1/projects/${projectId}/planning/chapters/${chapterId}/plan`,
      {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ segments }),
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to update plan');
    }
    
    return response.json();
  },
};
