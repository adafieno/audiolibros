import api from './api';

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'creator' | 'reviewer';
  tenant_id: string;
  is_active: boolean;
  created_at: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  full_name?: string;
  tenant_name: string;
  subdomain: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<{ token: AuthResponse; user: User }> => {
    const tokenResponse = await api.post('/auth/login', credentials);
    const token = tokenResponse.data;
    
    // Store tokens
    localStorage.setItem('access_token', token.access_token);
    localStorage.setItem('refresh_token', token.refresh_token);
    
    try {
      const userResponse = await api.get('/auth/me');
      return { token, user: userResponse.data };
    } catch (error) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      throw error;
    }
  },

  register: async (data: RegisterData): Promise<{ token: AuthResponse; user: User }> => {
    const tokenResponse = await api.post('/auth/register', data);
    const token = tokenResponse.data;
    
    // Store token temporarily to fetch user
    localStorage.setItem('access_token', token.access_token);
    
    try {
      const userResponse = await api.get('/auth/me');
      return { token, user: userResponse.data };
    } catch (error) {
      localStorage.removeItem('access_token');
      throw error;
    }
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await api.get('/auth/me');
    return response.data;
  },

  refreshToken: async (refreshToken: string): Promise<{ access_token: string }> => {
    const response = await api.post('/auth/refresh', { refresh_token: refreshToken });
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  },
};
