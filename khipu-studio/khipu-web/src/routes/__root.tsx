import { createRootRoute, Outlet, useLocation } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';
import { Layout } from '../components/Layout';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/';
  
  console.log('RootComponent rendering, pathname:', location.pathname, 'isAuthPage:', isAuthPage);

  // Don't show any layout on login page or home redirect
  if (isAuthPage) {
    return (
      <>
        <Outlet key={location.pathname} />
        <TanStackRouterDevtools position="bottom-right" />
      </>
    );
  }

  // All other pages use the unified Layout
  return (
    <>
      <Layout>
        <Outlet key={location.pathname} />
      </Layout>
      <TanStackRouterDevtools position="bottom-right" />
    </>
  );
}
