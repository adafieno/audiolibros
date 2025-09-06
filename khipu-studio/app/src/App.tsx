import { useTranslation } from "react-i18next";
import { Routes, Route, useLocation} from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import Home from "./pages/Home";
import ManuscriptPage from "./pages/Manuscript";
import PlanningPage from "./pages/Planning";
import SettingsPage from "./pages/Settings";
import ProjectPage from "./pages/Project";
import { useState } from "react";
import { t } from "i18next";
import { useProject } from "./store/project";


// simple placeholders (feel free to create separate files later)
const Placeholder = ({ name }: { name: string }) => <div>{name} — Coming soon…</div>;

export default function App() {
  const { t } = useTranslation();
  const loc = useLocation();
  const { root } = useProject();
  const pageName = routeTitle(loc.pathname);
  const projectName = root ? root.split('\\').pop() || root.split('/').pop() : undefined;
  const [status, setStatus] = useState("");

  return (
    <AppShell
      pageName={pageName}
      projectName={projectName}
      status={status}
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/project" element={<ProjectPage />} />
        <Route path="/manuscript" element={<ManuscriptPage />} />
        <Route path="/dossier" element={<Placeholder name={t("nav.dossier")} />} />
        <Route path="/planning" element={<PlanningPage onStatus={setStatus} />} />
        <Route path="/casting" element={<Placeholder name={t("nav.casting")} />} />
        <Route path="/ssml" element={<Placeholder name={t("nav.ssml")} />} />
        <Route path="/voice" element={<Placeholder name={t("nav.voice")} />} />
        <Route path="/export" element={<Placeholder name={t("nav.export")} />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </AppShell>
  );
}



function routeTitle(path: string): string {
  if (path === "/") return t("nav.home");
  if (path.startsWith("/project")) return t("nav.project");
  if (path.startsWith("/manuscript")) return t("nav.manuscript");
  if (path.startsWith("/dossier")) return t("nav.dossier");
  if (path.startsWith("/planning")) return t("nav.planning");
  if (path.startsWith("/casting")) return t("nav.casting");
  if (path.startsWith("/ssml")) return t("nav.ssml");
  if (path.startsWith("/voice")) return t("nav.voice");
  if (path.startsWith("/export")) return t("nav.export");
  if (path.startsWith("/settings")) return t("nav.settings");
  return "";
}
