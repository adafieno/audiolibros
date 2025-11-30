import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../lib/projects';
import { setProjectState } from '../store/project';

export const Route = createFileRoute('/projects/$projectId')({
  component: ProjectLayoutWrapper,
});

function ProjectLayoutWrapper() {
  const { projectId } = Route.useParams();
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
    enabled: !!projectId,
  });

  if (project) {
    setProjectState({
      currentProjectId: projectId,
      root: project.root,
      workflowCompleted: project.workflow_completed,
    });
  }

  return <Outlet />;
}
