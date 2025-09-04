import LangSelector from "../LangSelector";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

const STRIP_W = 88;
const ICON_SIZE = 28;

const routes = [
  { to: "/", key: "nav.home", icon: "🏠", exact: true },
  { to: "/project", key: "nav.project", icon: "📄" },
  { to: "/manuscript", key: "nav.manuscript", icon: "✍️" },
  { to: "/dossier", key: "nav.dossier", icon: "📚" },
  { to: "/planning", key: "nav.planning", icon: "🧭" },
  { to: "/casting", key: "nav.casting", icon: "👥" },
  { to: "/ssml", key: "nav.ssml", icon: "🧩" },
  { to: "/voice", key: "nav.voice", icon: "🎙️" },
  { to: "/export", key: "nav.export", icon: "📦" },
  { to: "/settings", key: "nav.settings", icon: "⚙️" }
];

export function AppShell(props: { title: string; status?: string; children: ReactNode; }) {
  const { title, status, children } = props;
  const { t } = useTranslation();

  return (
    <div style={{
      display: "grid",
      gridTemplateRows: "56px 1fr 48px",
      gridTemplateColumns: `${STRIP_W}px 1fr`,
      height: "100vh",
      background: "#0f172a",
      color: "#e5e7eb",
      fontFamily: "Segoe UI, system-ui, sans-serif"
    }}>
      <header style={{ gridColumn: "1 / span 2", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", borderBottom: "1px solid #1f2937", background: "#111827" }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>{status ?? ""}</div>
         <LangSelector />
      </header>

      <aside style={{ borderRight: "1px solid #1f2937", padding: "8px 6px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        {routes.map((r) => (
          <NavLink
            key={r.to}
            to={r.to}
            end={r.exact}
            style={({ isActive }) => ({
              display: "flex", alignItems: "center", justifyContent: "center",
              textDecoration: "none",
              color: isActive ? "#a7f3d0" : "#e5e7eb",
              background: isActive ? "rgba(88, 95, 109, 1)" : "transparent",
              borderRadius: 12, padding: "12px 8px"
            })}
            title={t(r.key)}
            aria-label={t(r.key)}
          >
            <span aria-hidden="true" style={{ fontSize: ICON_SIZE, lineHeight: 1, width: ICON_SIZE, height: ICON_SIZE, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {r.icon}
            </span>
          </NavLink>
        ))}
      </aside>

      <main style={{ padding: 16, overflow: "auto", minWidth: 0, width: "100%" }}>{children}</main>

      <footer style={{ gridColumn: "1 / span 2", borderTop: "1px solid #1f2937", background: "#111827", padding: "8px 12px",
        fontSize: 12, color: "#9ca3af", display: "flex", alignItems: "center", overflow: "hidden" }}>
        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>
          {/* {info} */}
        </div>
      </footer>
    </div>
  );
}
