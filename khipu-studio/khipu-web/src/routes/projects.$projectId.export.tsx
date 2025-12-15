import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { projectsApi } from '../lib/projects';
import { setStepCompleted } from '../store/project';
import { Button } from '../components/Button';

export const Route = createFileRoute('/projects/$projectId/export')({
  component: ExportPage,
});

function ExportPage() {
  const { t } = useTranslation();
  const { projectId } = Route.useParams();

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
  });

  // Placeholder UI aligning naming; completion set when export job succeeds in future
  const markExportComplete = () => {
    setStepCompleted('export', true);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)' }}>
        {t('export.title', 'Export')}
      </h1>
      <p className="mb-4" style={{ color: 'var(--text-muted)' }}>
        {t('export.description', 'Prepare and run the final export. This is a placeholder page; wiring to export jobs will set completion.')}
      </p>

      {project && (
        <div className="mb-6" style={{ color: 'var(--text-muted)' }}>
          {t('export.project', 'Project')}: {project.title}
        </div>
      )}

      <Button
        variant="primary"
        onClick={markExportComplete}
      >
        {t('export.markComplete', 'Mark Export Complete')}
      </Button>
    </div>
  );
}
