import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuthHook';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

type Theme = 'system' | 'light' | 'dark';
type Language = 'en-US' | 'es-PE' | 'pt-BR';

interface Settings {
  theme: Theme;
  language: Language;
}

const STORAGE_KEY = 'khipu_settings';

function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [settings, setSettings] = useState<Settings>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return { theme: 'system', language: 'en-US' };
      }
    }
    return { theme: 'system', language: 'en-US' };
  });

  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    // Apply theme to document
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else if (settings.theme === 'light') {
      root.classList.remove('dark');
    } else {
      // System preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  }, [settings.theme]);

  const handleThemeChange = (theme: Theme) => {
    setSettings({ ...settings, theme });
    setHasChanges(true);
  };

  const handleLanguageChange = (language: Language) => {
    setSettings({ ...settings, language });
    setHasChanges(true);
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setHasChanges(false);
  };

  const handleReset = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSettings(JSON.parse(stored));
      } catch {
        setSettings({ theme: 'system', language: 'en-US' });
      }
    }
    setHasChanges(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="mt-2 text-gray-600">Manage your application preferences</p>
      </div>

      {/* Appearance Section */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Appearance</h2>
          <p className="mt-1 text-sm text-gray-600">Customize how Khipu Studio looks</p>
        </div>
        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">Theme</label>
          <div className="grid grid-cols-3 gap-4">
            {(['system', 'light', 'dark'] as const).map((theme) => (
              <button
                key={theme}
                onClick={() => handleThemeChange(theme)}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                  settings.theme === theme
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-2xl">
                  {theme === 'system' ? '💻' : theme === 'light' ? '☀️' : '🌙'}
                </span>
                <span className="text-sm font-medium text-gray-900 capitalize">{theme}</span>
                {settings.theme === theme && (
                  <span className="text-xs text-blue-600">Selected</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Language Section */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Language</h2>
          <p className="mt-1 text-sm text-gray-600">Select your preferred language</p>
        </div>
        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Application Language
          </label>
          <div className="space-y-3">
            {[
              { code: 'en-US' as const, name: 'English (US)', flag: '🇺🇸' },
              { code: 'es-PE' as const, name: 'Español (Perú)', flag: '🇵🇪' },
              { code: 'pt-BR' as const, name: 'Português (Brasil)', flag: '🇧🇷' },
            ].map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-colors ${
                  settings.language === lang.code
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{lang.flag}</span>
                  <span className="text-sm font-medium text-gray-900">{lang.name}</span>
                </div>
                {settings.language === lang.code && (
                  <span className="text-sm text-blue-600 font-medium">Selected</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Admin Section - Only visible to admins */}
      {isAdmin && (
        <div className="bg-white rounded-lg shadow border-2 border-amber-200 mb-6">
          <div className="p-6 border-b border-gray-200 bg-amber-50">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔐</span>
              <h2 className="text-xl font-semibold text-gray-900">Admin Settings</h2>
            </div>
            <p className="mt-1 text-sm text-gray-600">
              Administrative controls and system management
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="text-sm font-medium text-gray-900">User Management</h3>
                <p className="text-xs text-gray-600 mt-1">
                  View and manage all users in the system
                </p>
              </div>
              <button className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
                Manage Users
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="text-sm font-medium text-gray-900">Tenant Management</h3>
                <p className="text-xs text-gray-600 mt-1">
                  Configure tenants and subscription plans
                </p>
              </div>
              <button className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
                Manage Tenants
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="text-sm font-medium text-gray-900">System Settings</h3>
                <p className="text-xs text-gray-600 mt-1">
                  Configure global application settings
                </p>
              </div>
              <button className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
                Configure
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="text-sm font-medium text-gray-900">API Keys</h3>
                <p className="text-xs text-gray-600 mt-1">
                  Manage Azure TTS and OpenAI API keys
                </p>
              </div>
              <button className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700">
                Manage Keys
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Owner Section - Visible to project owners when viewing project settings */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-xl">👤</span>
            <h2 className="text-xl font-semibold text-gray-900">Account</h2>
          </div>
          <p className="mt-1 text-sm text-gray-600">Your account information</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Email</p>
              <p className="text-sm text-gray-900 mt-1">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Full Name</p>
              <p className="text-sm text-gray-900 mt-1">{user?.full_name || 'Not set'}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Role</p>
              <p className="text-sm text-gray-900 mt-1 capitalize">{user?.role}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Save/Reset Buttons */}
      {hasChanges && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">You have unsaved changes</p>
            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Reset
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
