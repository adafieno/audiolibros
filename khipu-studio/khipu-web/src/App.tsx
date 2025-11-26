import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { useAuth } from './hooks/useAuthHook';
import { routeTree } from './routeTree.gen';
import './i18n'; // Initialize i18n
import { applyTheme, type Theme } from './lib/theme';
import { useEffect } from 'react';

// Create a query client
const queryClient = new QueryClient();

// Create a router instance
const router = createRouter({
  routeTree,
  context: {
    auth: undefined!,
    queryClient,
  },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
});

// Register router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

function InnerApp() {
  const auth = useAuth();
  
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
  
  return <RouterProvider router={router} context={{ auth, queryClient }} />;
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
