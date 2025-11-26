import api from './api';

export interface Project {
  id: string;
  tenant_id: string;
  owner_id: string;
  title: string;
  subtitle?: string;
  authors?: string[];
  narrators?: string[];
  language: string;
  description?: string;
  status: 'draft' | 'in_progress' | 'review' | 'completed' | 'published';
  workflow_completed?: Record<string, boolean>;
  created_at: string;
  updated_at: string;
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
  language?: string;
  description?: string;
  status?: 'draft' | 'in_progress' | 'review' | 'completed' | 'published';
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
};
