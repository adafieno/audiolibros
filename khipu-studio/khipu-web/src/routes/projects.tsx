import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/projects')({
  component: ProjectsLayout,
});

// This is now a layout component that renders child routes
function ProjectsLayout() {
  return <Outlet />;
}
