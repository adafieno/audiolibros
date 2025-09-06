import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ICU from "i18next-icu";
import LanguageDetector from "i18next-browser-languagedetector";

// Load bundles statically so Vite bundles them
import esPE from "./locales/es-PE/common.json";
import enUS from "./locales/en-US/common.json"; // optional; can remove if not ready

i18n
  .use(ICU)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "es-PE",
    supportedLngs: ["es-PE", "en-US"],
    defaultNS: "common",
    resources: {
      "es-PE": { common: esPE },
      "en-US": { common: enUS || {} }
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "khipu.lang",
      caches: ["localStorage"]
    },
    interpolation: { escapeValue: false }
  });

export default i18n;
