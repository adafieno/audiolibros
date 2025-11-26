import { createRoute, redirect, createFileRoute } from '@tanstack/react-router';
import { Route as RootRoute } from './__root';

export const Route = createRoute('/')({
  getParentRoute: () => RootRoute,
  path: '/',
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' });
    }
  },
  component: IndexComponent,
});

function IndexComponent() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900">Welcome to Khipu Cloud</h1>
        <p className="mt-4 text-gray-600">Your audiobook production workspace</p>
      </div>
    </div>
  );
}
