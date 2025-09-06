import { useEffect, useState } from "react";
import { loadAppConfig, saveAppConfig } from "../lib/config";
import type { AppConfig, Theme } from "../types/config";
import LangSelector from "../components/LangSelector";
import { applyTheme } from "../lib/theme";

export default function SettingsPage() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => { (async () => {
    const c = await loadAppConfig();
    setCfg(c);
    applyTheme(c.theme);                 // apply on open
  })(); }, []);

  async function save() {
    if (!cfg) return;
    setMsg("Guardando…");
    const ok = await saveAppConfig(cfg);
    applyTheme(cfg.theme);               // re-apply after save
    setMsg(ok ? "Guardado ✔" : "Error");
  }

  if (!cfg) return <div>Cargando…</div>;

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ marginTop: 0 }}>Ajustes de la aplicación</h2>

      <section style={{ marginTop: 16 }}>
        <label style={{ display: "block", marginBottom: 8 }}>Tema</label>
        <select
          value={cfg.theme}
          onChange={(e) => setCfg({ ...cfg, theme: e.target.value as Theme })}
        >
          <option value="system">Sistema</option>
          <option value="dark">Oscuro</option>
          <option value="light">Claro</option>
        </select>
        <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
          El tema se aplica globalmente.
        </div>
      </section>

      <section style={{ marginTop: 16 }}>
        <label style={{ display: "block", marginBottom: 8 }}>Idioma</label>
        <LangSelector />
      </section>


      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button className="btn" onClick={save}>Guardar</button>
        <div style={{ color: "var(--muted)" }}>{msg}</div>
      </div>
    </div>
  );
}
