import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";

type Lang = { code: string; label: string };

// Add/rename here as you add locales
const LANGS: Lang[] = [
  { code: "es-PE", label: "Español (Perú)" },
  { code: "en-US", label: "English (US)" },
];

export default function LangSelector() {
  const { t } = useTranslation();
  const [value, setValue] = useState<string>(i18n.language || "es-PE");

  // Ensure the current value stays in sync if language changes elsewhere
  useEffect(() => {
    // Initialize with current i18n language on mount
    setValue(i18n.language || "es-PE");
    
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
    <select
      aria-label={t("settings.languageSelectLabel")}
      className="langSelect"
      value={value}
      onChange={(e) => change((e.target as HTMLSelectElement).value)}
    >
      {options.map((l) => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  );
}
