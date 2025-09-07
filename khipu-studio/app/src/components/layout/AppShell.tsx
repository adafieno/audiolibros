import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { useProject, type WorkflowStep } from "../../store/project";

const STRIP_W = 88;
const ICON_SIZE = 28;

type RouteItem = {
  to: string;
  key: string;
  icon: string;
  exact?: boolean;
  workflowStep?: WorkflowStep;
};

const homeRoute: RouteItem = { to: "/", key: "nav.home", icon: "🏠", exact: true };
const settingsRoute: RouteItem = { to: "/settings", key: "nav.settings", icon: "⚙️" };

const projectRoutes: RouteItem[] = [
  { to: "/project",    key: "nav.project",    icon: "📄", workflowStep: "project" },
  { to: "/book",       key: "nav.book",       icon: "📖", workflowStep: "project" },
  { to: "/manuscript", key: "nav.manuscript", icon: "✍️", workflowStep: "manuscript" },
  { to: "/casting",    key: "nav.casting",    icon: "🗣️", workflowStep: "casting" },
  { to: "/dossier",    key: "nav.dossier",    icon: "📚", workflowStep: "dossier" },
  { to: "/planning",   key: "nav.planning",   icon: "🧭", workflowStep: "planning" },
  { to: "/ssml",       key: "nav.ssml",       icon: "🧩", workflowStep: "ssml" },
  { to: "/voice",      key: "nav.voice",      icon: "🎙️", workflowStep: "voice" },
  { to: "/export",     key: "nav.export",     icon: "📦", workflowStep: "export" },
];

export function AppShell(props: { title?: string; pageName?: string; projectName?: string; status?: string; children: ReactNode }) {
  const { title, pageName, projectName, status, children } = props;
  const { t } = useTranslation();
  const { root, isStepAvailable, isStepCompleted } = useProject();

  // Dynamic menu based on workflow progression:
  // - No project: [Home, Settings]
  // - With project: [Home, ...available project routes..., Settings]
  const availableProjectRoutes = projectRoutes.filter(route => 
    route.workflowStep ? isStepAvailable(route.workflowStep) : true
  );
  
  const routes: RouteItem[] = root
    ? [homeRoute, ...availableProjectRoutes, settingsRoute]
    : [homeRoute, settingsRoute];

  // Compose top bar: "Khipu Studio — Page Name — Project Name"
  let barTitle = "Khipu Studio";
  if (pageName) barTitle += ` — ${pageName}`;
  if (projectName) barTitle += ` — ${projectName}`;
  if (title) barTitle = title; // fallback for legacy usage

  // Compose workflow status for footer
  const getWorkflowStatus = () => {
    if (!root) return "";
    
    const steps: { step: WorkflowStep; labelKey: string }[] = [
      { step: "project", labelKey: "nav.project" },
      { step: "project", labelKey: "nav.book" },
      { step: "manuscript", labelKey: "nav.manuscript" },
      { step: "dossier", labelKey: "nav.dossier" },
      { step: "planning", labelKey: "nav.planning" },
      { step: "casting", labelKey: "nav.casting" },
      { step: "ssml", labelKey: "nav.ssml" },
      { step: "voice", labelKey: "nav.voice" },
      { step: "export", labelKey: "nav.export" },
    ];

    const completed = steps.filter(s => isStepCompleted(s.step));
    const available = steps.filter(s => isStepAvailable(s.step));
    
    if (completed.length === 0) {
      return t("workflow.readyToStart");
    }
    
    const completedLabels = completed.map(s => t(s.labelKey)).join(", ");
    const nextStep = available.find(s => !isStepCompleted(s.step));
    
    // Build status text using manual string concatenation
    let statusText = `${t("workflow.completedLabel")}: ${completedLabels}`;
    if (nextStep) {
      statusText += ` • ${t("workflow.nextLabel")}: ${t(nextStep.labelKey)}`;
    } else if (completed.length === steps.length) {
      statusText = t("workflow.allComplete");
    }
    
    return statusText;
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "56px 1fr 48px",
        gridTemplateColumns: `${STRIP_W}px 1fr`,
        height: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "Segoe UI, system-ui, sans-serif",
      }}
    >
      <header
        style={{
          gridColumn: "1 / span 2",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--panel)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>{barTitle}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{status ?? ""}</div>
      </header>

      <aside
        style={{
          borderRight: "1px solid var(--border)",
          padding: "8px 6px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minWidth: 0,
        }}
      >
        {routes.map((r) => {
          const isActive = r.exact ? 
            window.location.pathname === r.to : 
            window.location.pathname.startsWith(r.to);
          
          return (
            <NavLink
              key={r.to}
              to={r.to}
              end={!!r.exact}
              style={() => ({
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                color: isActive ? "#ffffff" : "var(--muted)",
                background: isActive ? "var(--accent)" : "transparent",
                borderRadius: 12,
                padding: "12px 8px",
              })}
              title={t(r.key)}
              aria-label={t(r.key)}
            >
              <span
                aria-hidden="true"
                style={{
                  fontSize: ICON_SIZE,
                  lineHeight: 1,
                  width: ICON_SIZE,
                  height: ICON_SIZE,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {r.icon}
              </span>
            </NavLink>
          );
        })}
      </aside>

      <main style={{ padding: 16, overflow: "auto", minWidth: 0, width: "100%" }}>{children}</main>

      <footer
        style={{
          gridColumn: "1 / span 2",
          borderTop: "1px solid var(--border)",
          background: "var(--panel)",
          padding: "8px 12px",
          fontSize: 12,
          color: "var(--muted)",
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
        }}
      >
        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>
          {status ? status : getWorkflowStatus()}
        </div>
      </footer>
    </div>
  );
}
