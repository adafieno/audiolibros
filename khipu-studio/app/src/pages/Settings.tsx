import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
    <div>
      <h2>{t("settings.title")}</h2>
      <p>{t("settings.description")}</p>

      <section style={{ marginTop: 16 }}>
        <label style={{ display: "block", marginBottom: 8 }}>{t("settings.theme")}</label>
        <select
          value={cfg.theme}
          onChange={(e) => setCfg({ ...cfg, theme: e.target.value as Theme })}
        >
          <option value="system">{t("settings.themeSystem")}</option>
          <option value="dark">{t("settings.themeDark")}</option>
          <option value="light">{t("settings.themeLight")}</option>
        </select>
        <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
          {t("settings.themeNote")}
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <LangSelector />
      </section>

      <div style={{ marginTop: 16 }}>
        <div style={{ color: "var(--muted)", fontSize: 12 }}>
          {t("settings.autoSave")}
        </div>
      </div>
    </div>
  );
}
