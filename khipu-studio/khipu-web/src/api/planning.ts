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

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
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
      } catch (error) {
        console.error('Token refresh failed:', error);
      }
    }
    
    // If refresh failed, clear tokens and redirect to login
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login';
  }

  return response;
}

export const planningApi = {
  /**
   * Health check for planning service
   */
  async healthCheck(): Promise<{ status: string }> {
    const response = await fetchWithAuth(`${API_BASE}/api/v1/projects/test/planning/health`);
    
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
    const response = await fetchWithAuth(
      `${API_BASE}/api/v1/projects/${projectId}/planning/chapters/${chapterId}/generate`,
      {
        method: 'POST',
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
    const response = await fetchWithAuth(
      `${API_BASE}/api/v1/projects/${projectId}/planning/chapters/${chapterId}/plan`
    );
    
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
    const response = await fetchWithAuth(
      `${API_BASE}/api/v1/projects/${projectId}/planning/chapters/${chapterId}/plan`,
      {
        method: 'PUT',
        body: JSON.stringify({ segments }),
      }
    );
    
    if (!response.ok) {
      throw new Error('Failed to update plan');
    }
    
    return response.json();
  },

  /**
   * Automatically assign characters to segments using LLM
   */
  async assignCharacters(
    projectId: string,
    chapterId: string
  ): Promise<ChapterPlan> {
    const response = await fetchWithAuth(
      `${API_BASE}/api/v1/projects/${projectId}/planning/chapters/${chapterId}/assign-characters`,
      {
        method: 'POST',
      }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Failed to assign characters' }));
      throw new Error(error.detail || 'Failed to assign characters');
    }
    
    return response.json();
  },
};
