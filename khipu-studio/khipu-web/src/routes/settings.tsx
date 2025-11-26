import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuthHook';
import { useTranslation } from 'react-i18next';
import { applyTheme, type Theme } from '../lib/theme';
import i18n from '../i18n';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

type Language = 'en-US' | 'es-PE' | 'pt-BR';

interface Settings {
  theme: Theme;
  language: Language;
}

const STORAGE_KEY = 'khipu_settings';

function SettingsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAdmin = user?.role === 'admin';

  const [settings, setSettings] = useState<Settings>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return { theme: 'system', language: i18n.language as Language || 'en-US' };
      }
    }
    return { theme: 'system', language: i18n.language as Language || 'en-US' };
  });

  // Apply theme whenever it changes
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  // Apply language whenever it changes
  useEffect(() => {
    if (i18n.language !== settings.language) {
      i18n.changeLanguage(settings.language);
    }
  }, [settings.language]);

  // Auto-save settings changes (like desktop app)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      console.log('Settings auto-saved');
    }, 500); // Save after 500ms of no changes

    return () => clearTimeout(timeoutId);
  }, [settings]);

  const handleThemeChange = (theme: Theme) => {
    setSettings({ ...settings, theme });
  };

  const handleLanguageChange = (language: Language) => {
    setSettings({ ...settings, language });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text)' }}>{t('settings.title')}</h1>
        <p className="mt-2" style={{ color: 'var(--text-muted)' }}>{t('settings.description')}</p>
      </div>

      {/* Appearance Section */}
      <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border mb-6">
        <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{t('settings.theme')}</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Customize how Khipu Studio looks</p>
        </div>
        <div className="p-6">
          <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text)' }}>{t('settings.theme')}</label>
          <div className="grid grid-cols-3 gap-4">
            {(['system', 'light', 'dark'] as const).map((theme) => (
              <button
                key={theme}
                onClick={() => handleThemeChange(theme)}
                style={{
                  backgroundColor: settings.theme === theme ? 'var(--panel-accent)' : 'transparent',
                  borderColor: settings.theme === theme ? 'var(--accent)' : 'var(--border)',
                  color: 'var(--text)'
                }}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors hover:opacity-80"
              >
                <span className="text-2xl">
                  {theme === 'system' ? '💻' : theme === 'light' ? '☀️' : '🌙'}
                </span>
                <span className="text-sm font-medium capitalize">
                  {t(`settings.theme${theme.charAt(0).toUpperCase() + theme.slice(1)}`)}
                </span>
                {settings.theme === theme && (
                  <span className="text-xs" style={{ color: 'var(--accent)' }}>{t('settings.selected')}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Language Section */}
      <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border mb-6">
        <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{t('settings.language')}</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{t('settings.languageDescription')}</p>
        </div>
        <div className="p-6">
          <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text)' }}>
            {t('settings.languageLabel')}
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
                style={{
                  backgroundColor: settings.language === lang.code ? 'var(--panel-accent)' : 'transparent',
                  borderColor: settings.language === lang.code ? 'var(--accent)' : 'var(--border)',
                  color: 'var(--text)'
                }}
                className="w-full flex items-center justify-between p-4 rounded-lg border-2 transition-colors hover:opacity-80"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{lang.flag}</span>
                  <span className="text-sm font-medium">{lang.name}</span>
                </div>
                {settings.language === lang.code && (
                  <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>{t('settings.selected')}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Admin Section - Only visible to admins */}
      {isAdmin && (
        <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--warning)' }} className="rounded-lg shadow border-2 mb-6">
          <div className="p-6 border-b" style={{ borderColor: 'var(--border)', backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
            <div className="flex items-center gap-2">
              <span className="text-xl">🔐</span>
              <h2 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{t('settings.admin')}</h2>
            </div>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {t('settings.adminDescription')}
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: 'var(--bg)' }}>
              <div>
                <h3 className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('settings.userManagement')}</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {t('settings.userManagementDesc')}
                </p>
              </div>
              <button style={{ backgroundColor: 'var(--accent)', color: 'white' }} className="px-4 py-2 text-sm rounded-md hover:opacity-80">
                {t('settings.manageUsers')}
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: 'var(--bg)' }}>
              <div>
                <h3 className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('settings.tenantManagement')}</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {t('settings.tenantManagementDesc')}
                </p>
              </div>
              <button style={{ backgroundColor: 'var(--accent)', color: 'white' }} className="px-4 py-2 text-sm rounded-md hover:opacity-80">
                {t('settings.manageTenants')}
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: 'var(--bg)' }}>
              <div>
                <h3 className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('settings.systemSettings')}</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {t('settings.systemSettingsDesc')}
                </p>
              </div>
              <button style={{ backgroundColor: 'var(--accent)', color: 'white' }} className="px-4 py-2 text-sm rounded-md hover:opacity-80">
                {t('settings.configure')}
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: 'var(--bg)' }}>
              <div>
                <h3 className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('settings.apiKeys')}</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {t('settings.apiKeysDesc')}
                </p>
              </div>
              <button style={{ backgroundColor: 'var(--accent)', color: 'white' }} className="px-4 py-2 text-sm rounded-md hover:opacity-80">
                {t('settings.manageKeys')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Owner Section - Visible to project owners when viewing project settings */}
      <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border mb-6">
        <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <span className="text-xl">👤</span>
            <h2 className="text-xl font-semibold" style={{ color: 'var(--text)' }}>{t('settings.account')}</h2>
          </div>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{t('settings.accountDescription')}</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('settings.email')}</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('settings.fullName')}</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{user?.full_name || t('settings.notSet')}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('settings.role')}</p>
              <p className="text-sm mt-1 capitalize" style={{ color: 'var(--text-muted)' }}>{user?.role}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
