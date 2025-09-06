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
  const [msg, setMsg] = useState("");

  useEffect(() => { (async () => {
    const c = await loadAppConfig();
    setCfg(c);
    applyTheme(c.theme);                 // apply on open
  })(); }, []);

  async function save() {
    if (!cfg) return;
    setMsg(t("settings.saving"));
    const ok = await saveAppConfig(cfg);
    applyTheme(cfg.theme);               // re-apply after save
    setMsg(ok ? t("settings.saved") : t("settings.error"));
  }

  if (!cfg) return <div>{t("settings.loading")}</div>;

  return (
    <>
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
        <label style={{ display: "block", marginBottom: 8 }}>{t("settings.language")}</label>
        <LangSelector />
      </section>

      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button className="btn" onClick={save}>{t("settings.save")}</button>
        <div style={{ color: "var(--muted)" }}>{msg}</div>
      </div>
    </>
  );
}
