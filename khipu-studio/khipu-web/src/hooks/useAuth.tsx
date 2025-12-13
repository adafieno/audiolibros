import { createContext, useState, useEffect, type ReactNode } from 'react';
import { authApi, type User, type LoginCredentials, type RegisterData } from '../lib/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export { AuthContext };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const loadUser = async () => {
      const token = localStorage.getItem('access_token');
      console.log('Loading user on mount, has token:', !!token);
      
      // Emergency timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        console.warn('Auth loading timeout - forcing loading to false');
        setIsLoading(false);
      }, 5000);
      
      if (token) {
        try {
          const userData = await authApi.getCurrentUser();
          console.log('Loaded user from token:', userData);
          setUser(userData);
        } catch (error) {
          console.error('Failed to load user:', error);
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          setUser(null);
        } finally {
          clearTimeout(timeoutId);
          setIsLoading(false);
        }
      } else {
        clearTimeout(timeoutId);
        setIsLoading(false);
      }
    };

    loadUser();
  }, []);

  const login = async (credentials: LoginCredentials) => {
    const { token, user } = await authApi.login(credentials);
    console.log('Login successful, setting user:', user);
    localStorage.setItem('access_token', token.access_token);
    localStorage.setItem('refresh_token', token.refresh_token);
    setUser(user);
  };

  const register = async (data: RegisterData) => {
    const { token, user } = await authApi.register(data);
    localStorage.setItem('access_token', token.access_token);
    localStorage.setItem('refresh_token', token.refresh_token);
    setUser(user);
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}