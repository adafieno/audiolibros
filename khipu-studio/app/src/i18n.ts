import i18n from "i18next";
import { initReactI18next } from "react-i18next";
// import ICU from "i18next-icu"; // Disabled - causes interpolation conflicts with standard {{variable}} syntax
import LanguageDetector from "i18next-browser-languagedetector";
import { extractTranslationStrings, type TranslationResource } from "./lib/i18n-utils";

// Load bundles statically so Vite bundles them
import esPE from "./locales/es-PE/common.json";
import enUS from "./locales/en-US/common.json"; // optional; can remove if not ready
import ptBR from "./locales/pt-BR/common.json";

// Extract just the translation strings from the new format
const extractedEsPE = extractTranslationStrings(esPE as TranslationResource);
const extractedEnUS = extractTranslationStrings(enUS as TranslationResource);
const extractedPtBR = extractTranslationStrings(ptBR as unknown as TranslationResource);

i18n
  // .use(ICU) // Disabled - causes interpolation conflicts with standard {{variable}} syntax
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "es-PE",
    supportedLngs: ["es-PE", "en-US", "pt-BR"],
    defaultNS: "common",
    resources: {
      "es-PE": { common: extractedEsPE },
      "en-US": { common: extractedEnUS },
      "pt-BR": { common: extractedPtBR }
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "khipu.lang",
      caches: ["localStorage"]
    },
    interpolation: { escapeValue: false }
  });

export default i18n;
