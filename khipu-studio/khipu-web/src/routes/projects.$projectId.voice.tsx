import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/projects/$projectId/voice')({
  component: VoicePage,
});

function VoicePage() {
  const { t } = useTranslation();

  return (
    <div className="p-6">
      <div className="rounded-lg border shadow mb-6 p-6" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)', margin: 0 }}>
            {t('voice.title', 'Voice')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)', margin: 0 }}>
            {t('voice.description', 'Generate and manage audio for chapters.')}
          </p>
        </div>
      </div>
      
      <div className="max-w-4xl" style={{ color: 'var(--text)' }}>
        <p>{t('voice.comingSoon', 'This feature is coming soon.')}</p>
      </div>
    </div>
  );
}
