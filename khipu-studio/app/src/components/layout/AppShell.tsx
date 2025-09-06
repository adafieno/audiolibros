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
  { to: "/manuscript", key: "nav.manuscript", icon: "✍️", workflowStep: "manuscript" },
  { to: "/dossier",    key: "nav.dossier",    icon: "📚", workflowStep: "dossier" },
  { to: "/planning",   key: "nav.planning",   icon: "🧭", workflowStep: "planning" },
  { to: "/casting",    key: "nav.casting",    icon: "👥", workflowStep: "casting" },
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
    
    const steps: { step: WorkflowStep; label: string }[] = [
      { step: "project", label: "Project" },
      { step: "manuscript", label: "Manuscript" },
      { step: "dossier", label: "Dossier" },
      { step: "planning", label: "Planning" },
      { step: "casting", label: "Casting" },
      { step: "ssml", label: "SSML" },
      { step: "voice", label: "Voice" },
      { step: "export", label: "Export" },
    ];

    const completed = steps.filter(s => isStepCompleted(s.step));
    const available = steps.filter(s => isStepAvailable(s.step));
    
    if (completed.length === 0) {
      return "Workflow: Ready to start";
    }
    
    const completedLabels = completed.map(s => s.label).join(", ");
    const nextStep = available.find(s => !isStepCompleted(s.step));
    
    let statusText = `Completed: ${completedLabels}`;
    if (nextStep) {
      statusText += ` • Next: ${nextStep.label}`;
    } else if (completed.length === steps.length) {
      statusText = "🎉 All workflow steps completed!";
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
        background: "#0f172a",
        color: "#e5e7eb",
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
          borderBottom: "1px solid #1f2937",
          background: "#111827",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600 }}>{barTitle}</div>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>{status ?? ""}</div>
      </header>

      <aside
        style={{
          borderRight: "1px solid #1f2937",
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
                color: isActive ? "#a7f3d0" : "#e5e7eb",
                background: isActive ? "rgba(88, 95, 109, 1)" : "transparent",
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
          borderTop: "1px solid #1f2937",
          background: "#111827",
          padding: "8px 12px",
          fontSize: 12,
          color: "#9ca3af",
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
