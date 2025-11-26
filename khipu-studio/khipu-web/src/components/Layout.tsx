import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useAuth } from '../hooks/useAuthHook';
import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { to: '/projects', label: 'Projects', icon: '📁' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

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
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Khipu Studio</h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Cloud Edition</p>
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
            Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Vertical Navigation Sidebar */}
        <aside style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="w-20 border-r flex flex-col items-center py-4 gap-2">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                style={{
                  backgroundColor: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? 'white' : 'var(--text-muted)'
                }}
                className="flex flex-col items-center justify-center w-16 h-16 rounded-xl transition-colors hover:opacity-80"
                title={item.label}
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="text-xs mt-1">{item.label}</span>
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
        © 2025 Agustín Da Fieno Delucchi. All rights reserved.
      </footer>
    </div>
  );
}
