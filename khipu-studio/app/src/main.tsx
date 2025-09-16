import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import i18n from "./i18n"; // single import is enough
import { applyTheme } from "./lib/theme";
import { loadAppConfig } from "./lib/config";

// Map OS locale → one of our supported ones
function pickSupported(sys: unknown): string {
  const s = typeof sys === "string" ? sys : "";
  if (s.toLowerCase().startsWith("es")) return "es-PE";
  if (s === "en-US") return "en-US";
  return "es-PE";
}

(async () => {
  try {
    // Check if user has already set a language preference
    const savedLang = localStorage.getItem("khipu.lang");
    
    if (savedLang && ["es-PE", "en-US", "pt-BR"].includes(savedLang)) {
      // Use saved language preference
      await i18n.changeLanguage(savedLang);
    } else {
      // If no saved preference, use OS locale as default
      // @ts-expect-error: khipu is injected by preload
      const sys = await window.khipu?.call?.("app:locale");
      const lang = pickSupported(sys);
      await i18n.changeLanguage(lang);
      localStorage.setItem("khipu.lang", lang);
    }
    
    const c = await loadAppConfig();
    applyTheme(c.theme);
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
