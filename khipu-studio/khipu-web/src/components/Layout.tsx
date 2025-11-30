import { Link, useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { useAuth } from '../hooks/useAuthHook';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../lib/projects';
import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

interface NavItem {
  to: string;
  label: string;
  icon: string;
  workflowStep?: string;
}

const homeRoute: NavItem = { to: '/projects', label: 'nav.home', icon: '🏠' };
const settingsRoute: NavItem = { to: '/settings', label: 'nav.settings', icon: '⚙️' };

const projectRoutes: NavItem[] = [
  { to: 'book', label: 'nav.book', icon: '📖', workflowStep: 'project' },
  { to: 'properties', label: 'nav.project', icon: '📄', workflowStep: 'project' },
  { to: 'manuscript', label: 'nav.manuscript', icon: '✍️', workflowStep: 'manuscript' },
  { to: 'casting', label: 'nav.casting', icon: '🗣️', workflowStep: 'casting' },
  { to: 'characters', label: 'nav.characters', icon: '🎭', workflowStep: 'characters' },
  { to: 'planning', label: 'nav.planning', icon: '🪄', workflowStep: 'planning' },
  { to: 'voice', label: 'nav.voice', icon: '🎙️', workflowStep: 'voice' },
  { to: 'packaging', label: 'nav.packaging', icon: '📦', workflowStep: 'voice' },
  { to: 'cost', label: 'nav.cost', icon: '💰' },
];

function isStepCompleted(step: string | undefined, workflowCompleted?: Record<string, boolean>): boolean {
  if (!step || !workflowCompleted) return false;
  return workflowCompleted[step] === true;
}

function isStepAvailable(step: string | undefined, workflowCompleted?: Record<string, boolean>): boolean {
  if (!step) return true;
  if (!workflowCompleted) return step === 'project' || step === 'manuscript';
  
  switch (step) {
    case 'project':
    case 'manuscript':
      return true;
    case 'casting':
      return workflowCompleted.manuscript === true;
    case 'characters':
      return workflowCompleted.casting === true;
    case 'planning':
    case 'voice':
      return workflowCompleted.characters === true;
    case 'export':
      return workflowCompleted.voice === true;
    default:
      return false;
  }
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const params = useParams({ strict: false }) as { projectId?: string };
  
  // Extract projectId from URL - check both params and pathname
  const projectId = params.projectId || 
    (location.pathname.match(/\/projects\/([^/]+)/) ? location.pathname.match(/\/projects\/([^/]+)/)![1] : undefined);

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!),
    enabled: !!projectId,
  });

  // Build navigation items - always show workflow routes if we have a project loaded
  const navItems: NavItem[] = [homeRoute];
  
  if (project) {
    // Add workflow routes when we have a project loaded
    const availableRoutes = projectRoutes.filter((route) =>
      isStepAvailable(route.workflowStep, project.workflow_completed)
    );
    navItems.push(...availableRoutes);
  }
  
  navItems.push(settingsRoute);

  const handleLogout = () => {
    logout();
    navigate({ to: '/login' });
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)' }}>
      {/* Top Header Bar */}
      <header style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/khipu-icon.png" alt="Khipu" style={{ borderColor: 'var(--border)' }} className="w-12 h-12 border-2 rounded-lg p-1" />
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{t('app.title')}</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('app.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {user?.email}
          </div>
          <button
            onClick={handleLogout}
            className="text-sm hover:opacity-80"
            style={{ color: 'var(--text-muted)' }}
          >
            {t('nav.logout')}
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Vertical Navigation Sidebar */}
        <aside style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="w-20 border-r flex flex-col items-center py-4 gap-2">
          {navItems.map((item) => {
            // Determine if this nav item is active
            let isActive = false;
            if (item.to === '/projects') {
              // Home is active only on projects list page
              isActive = location.pathname === '/projects';
            } else if (item.to === '/settings') {
              // Settings is active on settings page
              isActive = location.pathname === '/settings';
            } else if (projectId) {
              // Workflow items are active when on that specific route
              isActive = location.pathname.includes(`/projects/${projectId}/${item.to}`);
            }
            
            const completed = isStepCompleted(item.workflowStep, project?.workflow_completed);
            const available = isStepAvailable(item.workflowStep, project?.workflow_completed);
            
            // Build the link target
            let linkTo: string;
            if (item.to === '/projects' || item.to === '/settings') {
              linkTo = item.to;
            } else if (projectId) {
              linkTo = `/projects/${projectId}/${item.to}`;
            } else {
              linkTo = item.to; // Fallback
            }

            return (
              <Link
                key={item.to}
                to={linkTo as any}
                style={{
                  backgroundColor: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'white' : available ? 'var(--text)' : 'var(--text-muted)',
                  opacity: available ? 1 : 0.5,
                  cursor: available ? 'pointer' : 'not-allowed',
                  pointerEvents: available ? 'auto' : 'none',
                  position: 'relative',
                }}
                className="flex flex-col items-center justify-center w-16 h-16 rounded-xl transition-colors hover:opacity-80"
                title={t(item.label)}
              >
                <span className="text-2xl">{item.icon}</span>
                {completed && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                      fontSize: '10px',
                      color: 'var(--success)',
                      fontWeight: 'bold',
                    }}
                  >
                    ✓
                  </span>
                )}
              </Link>
            );
          })}
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>

      {/* Footer */}
      <footer style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text-muted)' }} className="border-t px-6 py-2 text-xs text-center">
        {t('app.copyright')}
      </footer>
    </div>
  );
}
