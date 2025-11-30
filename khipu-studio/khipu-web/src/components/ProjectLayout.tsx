import { Link, useParams, useLocation, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../lib/projects';
import { useAuth } from '../hooks/useAuthHook';
import type { ReactNode } from 'react';

const STRIP_W = 88;
const ICON_SIZE = 28;

type RouteItem = {
  to: string;
  key: string;
  icon: string;
  workflowStep?: string;
};

const homeRoute: RouteItem = { to: '/projects', key: 'nav.home', icon: '🏠' };

const projectRoutes: RouteItem[] = [
  { to: 'book', key: 'nav.book', icon: '📖', workflowStep: 'project' },
  { to: 'properties', key: 'nav.project', icon: '📄', workflowStep: 'project' },
  { to: 'manuscript', key: 'nav.manuscript', icon: '✍️', workflowStep: 'manuscript' },
  { to: 'casting', key: 'nav.casting', icon: '🗣️', workflowStep: 'casting' },
  { to: 'characters', key: 'nav.characters', icon: '🎭', workflowStep: 'characters' },
  { to: 'planning', key: 'nav.planning', icon: '🪄', workflowStep: 'planning' },
  { to: 'voice', key: 'nav.voice', icon: '🎙️', workflowStep: 'voice' },
  { to: 'packaging', key: 'nav.packaging', icon: '📦', workflowStep: 'voice' },
  { to: 'cost', key: 'nav.cost', icon: '💰' },
];

const settingsRoute: RouteItem = { to: '/settings', key: 'nav.settings', icon: '⚙️' };

function isStepCompleted(step: string | undefined, workflowCompleted?: Record<string, boolean>): boolean {
  if (!step || !workflowCompleted) return false;
  return workflowCompleted[step] === true;
}

function isStepAvailable(step: string | undefined, workflowCompleted?: Record<string, boolean>): boolean {
  if (!step) return true; // Routes without workflow steps are always available
  if (!workflowCompleted) return step === 'project' || step === 'manuscript';
  
  switch (step) {
    case 'project':
    case 'manuscript':
      return true; // Always available
      
    case 'casting':
      return workflowCompleted.manuscript === true;
      
    case 'characters':
      return workflowCompleted.casting === true;
      
    case 'planning':
      return workflowCompleted.characters === true;
      
    case 'voice':
      return workflowCompleted.characters === true;
      
    case 'export':
      return workflowCompleted.voice === true;
      
    default:
      return false;
  }
}

export function ProjectLayout({ children }: { children: ReactNode }) {
  const { projectId } = useParams({ strict: false }) as { projectId?: string };
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate({ to: '/login' });
  };

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!),
    enabled: !!projectId,
  });

  // Filter available routes based on workflow progression
  const availableProjectRoutes = projectRoutes.filter((route) =>
    isStepAvailable(route.workflowStep, project?.workflow_completed)
  );

  const routes: RouteItem[] = [homeRoute, ...availableProjectRoutes, settingsRoute];

  // Compose workflow status for footer
  const getWorkflowStatus = () => {
    if (!project) return '';

    const steps = [
      { step: 'project', labelKey: 'nav.book' },
      { step: 'project', labelKey: 'nav.project' },
      { step: 'manuscript', labelKey: 'nav.manuscript' },
      { step: 'casting', labelKey: 'nav.casting' },
      { step: 'characters', labelKey: 'nav.characters' },
      { step: 'planning', labelKey: 'nav.planning' },
      { step: 'voice', labelKey: 'nav.voice' },
      { step: 'export', labelKey: 'nav.packaging' },
    ];

    const completed = steps.filter((s) => isStepCompleted(s.step, project.workflow_completed));
    const available = steps.filter((s) => isStepAvailable(s.step, project.workflow_completed));

    if (completed.length === 0) {
      return t('workflow.readyToStart', 'Ready to start');
    }

    const completedLabels = completed.map((s) => t(s.labelKey)).join(', ');
    const nextStep = available.find((s) => !isStepCompleted(s.step, project.workflow_completed));

    let statusText = `${t('workflow.completedLabel', 'Completed')}: ${completedLabels}`;
    if (nextStep) {
      statusText += ` • ${t('workflow.nextLabel', 'Next')}: ${t(nextStep.labelKey)}`;
    } else if (completed.length === steps.length) {
      statusText = t('workflow.allComplete', 'All workflow steps completed');
    }

    return statusText;
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: '56px 1fr 48px',
        gridTemplateColumns: `${STRIP_W}px 1fr`,
        height: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: 'Segoe UI, system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <header
        style={{
          gridColumn: '1 / span 2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--panel)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/khipu-icon.png" alt="Khipu" style={{ width: 40, height: 40, borderRadius: 8, border: '2px solid var(--border)', padding: 2 }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{t('app.title')}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('app.subtitle')}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{user?.email}</div>
          <button
            onClick={handleLogout}
            style={{ fontSize: 13, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            className="hover:opacity-80"
          >
            {t('nav.logout')}
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        style={{
          borderRight: '1px solid var(--border)',
          padding: '8px 6px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minWidth: 0,
        }}
      >
        {routes.map((r) => {
          const isActive =
            r.to === '/projects' || r.to === '/settings'
              ? location.pathname === r.to
              : projectId && location.pathname.includes(`/projects/${projectId}/${r.to}`);

          const completed = isStepCompleted(r.workflowStep, project?.workflow_completed);
          const available = isStepAvailable(r.workflowStep, project?.workflow_completed);

          const linkTo =
            r.to === '/projects' || r.to === '/settings'
              ? r.to
              : `/projects/${projectId}/${r.to}`;

          return (
            <Link
              key={r.to}
              to={linkTo as '/projects' | '/settings'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
                color: isActive ? '#ffffff' : available ? 'var(--text)' : 'var(--muted)',
                background: isActive ? 'var(--accent)' : 'transparent',
                borderRadius: 12,
                padding: '12px 8px',
                opacity: available ? 1 : 0.5,
                position: 'relative',
                cursor: available ? 'pointer' : 'not-allowed',
                pointerEvents: available ? 'auto' : 'none',
              }}
              title={t(r.key)}
              aria-label={t(r.key)}
            >
              <span
                aria-hidden="true"
                style={{
                  fontSize: ICON_SIZE,
                  lineHeight: 1,
                  width: ICON_SIZE,
                  height: ICON_SIZE,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {r.icon}
              </span>
              {/* Completion indicator */}
              {completed && (
                <span
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '2px',
                    fontSize: '10px',
                    lineHeight: 1,
                    color: 'var(--success)',
                    fontWeight: 'bold',
                    textShadow: '0 0 2px rgba(0,0,0,0.8)',
                  }}
                  title={t('workflow.stepCompleted', 'Step completed')}
                >
                  ✓
                </span>
              )}
            </Link>
          );
        })}
      </aside>

      {/* Main content */}
      <main style={{ padding: '20px 32px', overflow: 'auto', minWidth: 0, width: '100%' }}>
        {children}
      </main>

      {/* Footer */}
      <footer
        style={{
          gridColumn: '1 / span 2',
          borderTop: '1px solid var(--border)',
          background: 'var(--panel)',
          padding: '8px 12px',
          fontSize: 12,
          color: 'var(--muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          overflow: 'hidden',
        }}
      >
        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
          {getWorkflowStatus()}
        </div>
        <div
          style={{
            whiteSpace: 'nowrap',
            marginLeft: '16px',
            fontSize: 11,
            color: 'var(--muted)',
            opacity: 0.8,
          }}
        >
          © 2025 Khipu Studio
        </div>
      </footer>
    </div>
  );
}
