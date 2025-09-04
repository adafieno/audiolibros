import { useEffect, useMemo, useState } from "react";
import i18n from "../i18n";

type Lang = { code: string; label: string };

// Add/rename here as you add locales
const LANGS: Lang[] = [
  { code: "es-PE", label: "Español (Perú)" },
  { code: "en-US", label: "English (US)" },
];

export default function LangSelector() {
  const [value, setValue] = useState<string>(i18n.language || "es-PE");

  // Ensure the current value stays in sync if language changes elsewhere
  useEffect(() => {
    const onChange = (lng: string) => setValue(lng);
    i18n.on("languageChanged", onChange);
    return () => i18n.off("languageChanged", onChange);
  }, []);

  const options = useMemo(() => LANGS, []);

  function change(lng: string) {
    i18n.changeLanguage(lng);
    localStorage.setItem("khipu.lang", lng);
    setValue(lng);
  }

  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 12, color: "#9ca3af" }}>Idioma</span>
      <select
        aria-label="Seleccionar idioma"
        className="langSelect"
        value={value}
        onChange={(e) => change((e.target as HTMLSelectElement).value)}
      >
        {options.map((l) => (
          <option key={l.code} value={l.code}>{l.label}</option>
        ))}
      </select>
    </label>
  );
}
