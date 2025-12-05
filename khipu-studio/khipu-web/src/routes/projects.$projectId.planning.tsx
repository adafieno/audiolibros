import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/projects/$projectId/planning')({
  component: PlanningPage,
});

function PlanningPage() {
  const { t } = useTranslation();

  return (
    <div className="p-6">
      <div className="rounded-lg border shadow mb-6 p-6" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)', margin: 0 }}>
            {t('planning.title', 'Planning')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)', margin: 0 }}>
            {t('planning.description', 'Plan chapter segments and scene breaks.')}
          </p>
        </div>
      </div>
      
      <div className="max-w-4xl" style={{ color: 'var(--text)' }}>
        <p>{t('planning.comingSoon', 'This feature is coming soon.')}</p>
      </div>
    </div>
  );
}
