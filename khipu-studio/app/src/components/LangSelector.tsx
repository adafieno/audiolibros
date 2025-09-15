import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";

type Lang = { code: string; label: string };

// Language display names - add new languages here
const LANGUAGE_LABELS: Record<string, string> = {
  "es-PE": "Español (Perú)",
  "en-US": "English (US)",
  "pt-BR": "Português (Brasil)",
};

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

  // Dynamically generate language options from i18n supported languages
  const options = useMemo((): Lang[] => {
    const supportedLngs = i18n.options.supportedLngs;
    if (!supportedLngs || !Array.isArray(supportedLngs)) return [];
    
    return supportedLngs
      .filter((lang: string) => lang !== 'cimode') // Filter out i18next's debug language
      .map((code: string) => ({
        code,
        label: LANGUAGE_LABELS[code] || code // Fallback to code if label not found
      }));
  }, []);

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
      style={{ width: "33%" }}
    >
      {options.map((l) => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  );
}
