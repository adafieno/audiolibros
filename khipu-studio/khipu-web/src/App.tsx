import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { useAuth } from './hooks/useAuthHook';
import { routeTree } from './routeTree.gen';
import './i18n'; // Initialize i18n
import { applyTheme, type Theme } from './lib/theme';
import { useEffect, useMemo } from 'react';

// Create a query client
const queryClient = new QueryClient();

// Register router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}

function InnerApp() {
  const auth = useAuth();
  
  // Create router instance with current auth context
  const router = useMemo(() => createRouter({
    routeTree,
    context: {
      auth,
      queryClient,
    },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  }), [auth]);
  
  // Apply theme on app load
  useEffect(() => {
    const savedTheme = (localStorage.getItem('khipu_settings') as string) || '{"theme":"system"}';
    try {
      const settings = JSON.parse(savedTheme);
      applyTheme(settings.theme as Theme || 'system');
    } catch {
      applyTheme('system');
    }
  }, []);
  
  return <RouterProvider router={router} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <InnerApp />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
