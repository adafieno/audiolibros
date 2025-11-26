import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useAuth } from '../hooks/useAuthHook';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

function IndexComponent() {
  const { isAuthenticated, isLoading } = useAuth();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg)' }}>
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
          <p className="mt-2" style={{ color: 'var(--text-muted)' }}>{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return <Navigate to="/projects" />;
}
