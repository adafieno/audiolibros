import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import i18n from "./i18n"; // single import is enough

// Map OS locale → one of our supported ones
function pickSupported(sys: unknown): string {
  const s = typeof sys === "string" ? sys : "";
  if (s.toLowerCase().startsWith("es")) return "es-PE";
  if (s === "en-US") return "en-US";
  return "es-PE";
}

(async () => {
  try {
    // If running inside Electron with preload, ask for OS locale
    // @ts-expect-error: khipu is injected by preload
    const sys = await window.khipu?.call?.("app:locale");
    const lang = pickSupported(sys);
    await i18n.changeLanguage(lang);
    localStorage.setItem("khipu.lang", lang);
  } catch {
    // fall back to default in i18n.ts (es-PE)
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  );
})();
