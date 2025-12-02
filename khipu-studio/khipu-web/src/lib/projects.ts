import api from './api';

export interface Project {
  id: string;
  tenant_id: string;
  owner_id: string;
  title: string;
  subtitle?: string;
  authors?: string[];
  narrators?: string[];
  translators?: string[];
  adaptors?: string[];
  language: string;
  description?: string;
  publisher?: string;
  publish_date?: string;
  isbn?: string;
  cover_image_url?: string;
  status: 'draft' | 'in_progress' | 'review' | 'completed' | 'published' | 'archived';
  settings?: Record<string, unknown>;
  workflow_completed?: Record<string, boolean>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  archived_at?: string;
}

export interface ProjectCreate {
  title: string;
  subtitle?: string;
  authors?: string[];
  narrators?: string[];
  language?: string;
  description?: string;
}

export interface ProjectUpdate {
  title?: string;
  subtitle?: string;
  authors?: string[];
  narrators?: string[];
  translators?: string[];
  adaptors?: string[];
  language?: string;
  description?: string;
  publisher?: string;
  publish_date?: string;
  isbn?: string;
  status?: 'draft' | 'in_progress' | 'review' | 'completed' | 'published' | 'archived';
  settings?: Record<string, unknown>;
  workflow_completed?: Record<string, boolean>;
  cover_image_url?: string;
}

export interface ProjectsListResponse {
  items: Project[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export const projectsApi = {
  list: async (params?: {
    skip?: number;
    limit?: number;
    search?: string;
    status?: string;
  }): Promise<ProjectsListResponse> => {
    const response = await api.get('/projects/', { params });
    return response.data;
  },

  get: async (id: string): Promise<Project> => {
    const response = await api.get(`/projects/${id}`);
    return response.data;
  },

  create: async (data: ProjectCreate): Promise<Project> => {
    const response = await api.post('/projects/', data);
    return response.data;
  },

  update: async (id: string, data: ProjectUpdate): Promise<Project> => {
    const response = await api.put(`/projects/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/projects/${id}`);
  },

  suggestIpa: async (id: string, word: string): Promise<{
    success: boolean;
    ipa?: string;
    error?: string;
    examples?: string[];
    source?: string;
  }> => {
    const response = await api.post(`/projects/${id}/suggest-ipa`, { word });
    return response.data;
  },
};
