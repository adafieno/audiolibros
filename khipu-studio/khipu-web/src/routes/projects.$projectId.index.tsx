import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/projects/$projectId/')({
  component: ProjectIndexRedirect,
});

function ProjectIndexRedirect() {
  const { projectId } = Route.useParams();
  
  // Redirect to the first workflow step (Book Details)
  return <Navigate to="/projects/$projectId/book" params={{ projectId }} replace />;
}
