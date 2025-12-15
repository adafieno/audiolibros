import { createFileRoute } from '@tanstack/react-router';
import { Button } from '../components/Button';
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
    <div className="p-6">
      <div style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)' }} className="rounded-lg shadow border p-6 mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>{t('settings.title')}</h1>
        <p style={{ color: 'var(--text-muted)' }}>{t('settings.description')}</p>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        
        {/* LEFT COLUMN */}
        <div className="space-y-6">

      {/* Appearance Section */}
      <section>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>{t('settings.theme')}</h3>
        <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>{t('settings.themeDescription')}</p>
        <div>
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
      </section>

      {/* Language Section */}
      <section>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>{t('settings.language')}</h3>
        <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>{t('settings.languageDescription')}</p>
        <div>
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
      </section>

        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">

      {/* Admin Section - Only visible to admins */}
      {isAdmin && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🔐</span>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{t('settings.admin')}</h3>
          </div>
          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
            {t('settings.adminDescription')}
          </p>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg" style={{ backgroundColor: 'var(--bg)' }}>
              <div>
                <h3 className="text-sm font-medium" style={{ color: 'var(--text)' }}>{t('settings.userManagement')}</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {t('settings.userManagementDesc')}
                </p>
              </div>
              <Button
                variant="primary"
                size="compact"
              >
                {t('settings.manageUsers')}
              </Button>
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
        </section>
      )}

      {/* Account Section */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">👤</span>
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{t('settings.account')}</h3>
        </div>
        <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>{t('settings.accountDescription')}</p>
        <div className="space-y-4">
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
      </section>

        </div>
      </div>
    </div>
  );
}
