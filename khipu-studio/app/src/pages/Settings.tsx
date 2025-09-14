import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../components/PageHeader";
import { loadAppConfig, saveAppConfig } from "../lib/config";
import type { AppConfig, Theme } from "../types/config";
import LangSelector from "../components/LangSelector";
import { applyTheme } from "../lib/theme";
// ...existing code...

export default function SettingsPage() {
  const { t } = useTranslation();
  const [cfg, setCfg] = useState<AppConfig | null>(null);

  useEffect(() => { (async () => {
    const c = await loadAppConfig();
    setCfg(c);
    applyTheme(c.theme);                 // apply on open
  })(); }, []);

  // Auto-save configuration changes
  useEffect(() => {
    if (!cfg) return;
    
    const timeoutId = setTimeout(async () => {
      try {
        await saveAppConfig(cfg);
        applyTheme(cfg.theme); // re-apply after save
        console.log("Settings auto-saved");
      } catch (error) {
        console.warn("Failed to auto-save settings:", error);
      }
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [cfg]);

  if (!cfg) return <div>{t("settings.loading")}</div>;

  return (
    <div style={{ maxWidth: "100%" }}>
      <PageHeader 
        title="settings.title"
        description="settings.description"
      />

      <section className="mt-6">
        <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>{t("settings.theme")}</h3>
        <select
          value={cfg.theme}
          onChange={(e) => setCfg({ ...cfg, theme: e.target.value as Theme })}
          style={{
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            backgroundColor: "var(--input)",
            color: "var(--text)",
            fontSize: "14px",
            width: "33%",
            appearance: "none",
            backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 8px center",
            backgroundSize: "16px",
            paddingRight: "40px"
          }}
        >
          <option value="system">{t("settings.themeSystem")}</option>
          <option value="dark">{t("settings.themeDark")}</option>
          <option value="light">{t("settings.themeLight")}</option>
        </select>
      </section>

      <section className="mt-6">
        <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>{t("settings.language")}</h3>
        <LangSelector />
      </section>
    </div>
  );
}
