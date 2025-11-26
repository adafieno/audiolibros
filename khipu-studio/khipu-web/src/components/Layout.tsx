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
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/khipu-icon.png" alt="Khipu" className="w-8 h-8" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Khipu Studio</h1>
            <p className="text-xs text-gray-500">Cloud Edition</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600">
            {user?.email}
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Vertical Navigation Sidebar */}
        <aside className="w-20 bg-white border-r border-gray-200 flex flex-col items-center py-4 gap-2">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center justify-center w-16 h-16 rounded-xl transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
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
      <footer className="bg-white border-t border-gray-200 px-6 py-2 text-xs text-gray-500 text-center">
        © 2025 Agustín Da Fieno Delucchi. All rights reserved.
      </footer>
    </div>
  );
}
