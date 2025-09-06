export type Theme = "system" | "dark" | "light";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(t: Theme): "dark" | "light" {
  if (t === "dark" || t === "light") return t;
  return systemPrefersDark() ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  const final = resolveTheme(theme);
  const el = document.documentElement;
  el.setAttribute("data-theme", final);
}
