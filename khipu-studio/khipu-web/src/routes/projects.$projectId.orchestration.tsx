import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/projects/$projectId/orchestration')({
  component: OrchestrationPage,
});

function OrchestrationPage() {
  const { t } = useTranslation();

  return (
    <div className="p-6">
      <div className="rounded-lg border shadow mb-6 p-6" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)', margin: 0 }}>
            {t('orchestration.title', 'Orchestration')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)', margin: 0 }}>
            {t('orchestration.description', 'Plan chapter segments and scene breaks.')}
          </p>
        </div>
      </div>
      
      <div className="max-w-4xl" style={{ color: 'var(--text)' }}>
        <p>{t('orchestration.comingSoon', 'This feature is coming soon.')}</p>
      </div>
    </div>
  );
}
