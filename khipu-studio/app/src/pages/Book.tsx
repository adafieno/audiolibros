import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { WorkflowCompleteButton } from "../components/WorkflowCompleteButton";
import { PageHeader } from "../components/PageHeader";
import { StandardButton } from "../components/StandardButton";
import { ImageSelector } from "../components/ImageSelector";

import {
  loadProjectConfig, saveProjectConfig,
} from "../lib/config";
import type {
  ProjectConfig, BookMeta,
} from "../types/config";

export default function Book() {
  const { t } = useTranslation();
  const { root } = useProject();
  const [cfg, setCfg] = useState<ProjectConfig | null>(null);
  const [bookMeta, setBookMeta] = useState<BookMeta | null>(null);
  const [msg, setMsg] = useState("");

  // Load config and book metadata on mount or project change
  useEffect(() => {
    if (!root) {
      setCfg(null);
      setBookMeta(null);
      return;
    }
    
    // Load project config
    loadProjectConfig(root)
      .then(setCfg)
      .catch(err => {
        console.error("Failed to load project config:", err);
        setMsg(t("book.loadError"));
      });

    // Load book metadata from book.meta.json (optimized structure) or fallback to project config
    const loadBookMeta = async () => {
      try {
        // Try to load from book.meta.json first (optimized structure)
        const bookMetaData = await window.khipu!.call("fs:read", {
          projectRoot: root,
          relPath: "book.meta.json",
          json: true
        }) as BookMeta;
        
        if (bookMetaData && (bookMetaData.title || bookMetaData.authors?.length > 0)) {
          setBookMeta(bookMetaData);
          return;
        }
      } catch {
        console.log("book.meta.json not found or invalid, trying fallback");
      }

      // Fallback to bookMeta in project config (legacy structure)
      try {
        const projectConfig = await loadProjectConfig(root);
        if (projectConfig?.bookMeta) {
          setBookMeta(projectConfig.bookMeta);
        } else {
          // Create empty template if no book metadata exists
          const emptyMeta: BookMeta = {
            title: "",
            authors: [],
            language: projectConfig?.language || "es-PE"
          };
          setBookMeta(emptyMeta);
        }
      } catch (error) {
        console.error("Failed to load book metadata:", error);
        setMsg(t("book.loadError"));
      }
    };

    loadBookMeta();
  }, [root, t]);

  // Helper for BookMeta updates with proper defaults
  const updateBookMeta = (updates: Partial<BookMeta>) => {
    if (!bookMeta) return;
    
    const newMeta = { ...bookMeta, ...updates };
    console.log("Updating BookMeta:", { currentMeta: bookMeta, updates, newMeta });
    
    // Ensure required fields are never empty
    if (newMeta.authors.length === 0 && updates.authors && updates.authors.length > 0) {
      newMeta.authors = updates.authors.filter(author => author.trim() !== "");
    }
    
    setBookMeta(newMeta);
  };

  // Auto-save when cfg or bookMeta changes (debounced)
  useEffect(() => {
    if (!root || !cfg || !bookMeta) return;
    
    const timeoutId = setTimeout(async () => {
      try {
        console.log('💾 Auto-saving book configuration and metadata');
        
        // Save project config
        await saveProjectConfig(root, cfg);
        
        // Save book metadata to book.meta.json
        await window.khipu!.call("fs:write", {
          projectRoot: root,
          relPath: "book.meta.json",
          json: true,
          content: bookMeta
        });
        
        console.log('💾 Auto-saved book configuration and metadata');
        
      } catch (error) {
        console.warn('Auto-save failed:', error);
        // Don't show error to user for auto-save failures, just log them
      }
    }, 2000); // Debounce: save 2 seconds after last change

    return () => clearTimeout(timeoutId);
  }, [cfg, bookMeta, root]);

  if (!root) {
    return <div>{t("status.openProject")}</div>;
  }

  if (!cfg || !bookMeta) {
    return <div>{t("book.loading")}</div>;
  }

  return (
    <div>
      <PageHeader 
        title="book.title"
        description="book.description"
      />
      {/* Basic Information */}
      <section className="mt-6">
        <h3>{t("book.basicInfo")}</h3>
        <div className="grid-2 gap-4">
          <div className="grid-2 grid-gap-2">
            <label>
              <div>{t("book.title.label")}</div>
              <input
                style={{ width: "80%" }}
                value={bookMeta?.title || ""}
                onChange={(e) => updateBookMeta({ title: e.target.value })}
              />
            </label>
            <label>
              <div>{t("book.subtitle.label")}</div>
              <input
                style={{ width: "80%" }}
                value={bookMeta?.subtitle || ""}
                onChange={(e) => updateBookMeta({ subtitle: e.target.value })}
              />
            </label>
            <label>
              <div>{t("book.authors.label")}</div>
              <input
                style={{ width: "80%" }}
                value={bookMeta?.authors?.join(", ") || ""}
                placeholder={t("book.authors.placeholder")}
                onChange={(e) => updateBookMeta({ 
                  authors: e.target.value.split(",").map(a => a.trim()).filter(a => a) 
                })}
              />
            </label>
            <label>
              <div>{t("book.narrators.label")}</div>
              <input
                style={{ width: "80%" }}
                value={bookMeta?.narrators?.join(", ") || ""}
                placeholder={t("book.narrators.placeholder")}
                onChange={(e) => updateBookMeta({ 
                  narrators: e.target.value.split(",").map(n => n.trim()).filter(n => n) 
                })}
              />
            </label>
            <label>
              <div>{t("book.language.label")}</div>
              <select
                className="dark-dropdown"
                value={bookMeta?.language || cfg?.language || "es-PE"}
                onChange={(e) => updateBookMeta({ language: e.target.value })}
                style={{
                  padding: "8px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  backgroundColor: "var(--input)",
                  color: "var(--text)",
                  fontSize: "14px",
                  minWidth: "300px",
                  appearance: "none",
                  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 8px center",
                  backgroundSize: "16px",
                  paddingRight: "40px"
                }}
              >
                <option 
                  value="" 
                  disabled
                  style={{
                    backgroundColor: "var(--input)",
                    color: "var(--text-muted)"
                  }}
                >
                  {t("book.language.selectOption")}
                </option>
                
                {/* Spanish variants - most common first */}
                <optgroup label="🇪🇸 Spanish">
                  <option value="es-ES">Español (España) - Spanish (Spain)</option>
                  <option value="es-MX">Español (México) - Spanish (Mexico)</option>
                  <option value="es-AR">Español (Argentina) - Spanish (Argentina)</option>
                  <option value="es-PE">Español (Perú) - Spanish (Peru)</option>
                  <option value="es-CO">Español (Colombia) - Spanish (Colombia)</option>
                  <option value="es-CL">Español (Chile) - Spanish (Chile)</option>
                  <option value="es-VE">Español (Venezuela) - Spanish (Venezuela)</option>
                  <option value="es-EC">Español (Ecuador) - Spanish (Ecuador)</option>
                  <option value="es-GT">Español (Guatemala) - Spanish (Guatemala)</option>
                  <option value="es-CR">Español (Costa Rica) - Spanish (Costa Rica)</option>
                  <option value="es-PA">Español (Panamá) - Spanish (Panama)</option>
                  <option value="es-UY">Español (Uruguay) - Spanish (Uruguay)</option>
                  <option value="es-PY">Español (Paraguay) - Spanish (Paraguay)</option>
                  <option value="es-BO">Español (Bolivia) - Spanish (Bolivia)</option>
                  <option value="es-SV">Español (El Salvador) - Spanish (El Salvador)</option>
                  <option value="es-HN">Español (Honduras) - Spanish (Honduras)</option>
                  <option value="es-NI">Español (Nicaragua) - Spanish (Nicaragua)</option>
                  <option value="es-DO">Español (República Dominicana) - Spanish (Dominican Republic)</option>
                  <option value="es-PR">Español (Puerto Rico) - Spanish (Puerto Rico)</option>
                  <option value="es-CU">Español (Cuba) - Spanish (Cuba)</option>
                  <option value="es-GQ">Español (Guinea Ecuatorial) - Spanish (Equatorial Guinea)</option>
                  <option value="es-US">Español (Estados Unidos) - Spanish (United States)</option>
                </optgroup>

                {/* English variants */}
                <optgroup label="🇺🇸 English">
                  <option value="en-US">English (United States)</option>
                  <option value="en-GB">English (United Kingdom)</option>
                  <option value="en-AU">English (Australia)</option>
                  <option value="en-CA">English (Canada)</option>
                  <option value="en-IN">English (India)</option>
                  <option value="en-IE">English (Ireland)</option>
                  <option value="en-ZA">English (South Africa)</option>
                  <option value="en-NZ">English (New Zealand)</option>
                  <option value="en-SG">English (Singapore)</option>
                  <option value="en-HK">English (Hong Kong)</option>
                  <option value="en-PH">English (Philippines)</option>
                  <option value="en-KE">English (Kenya)</option>
                  <option value="en-NG">English (Nigeria)</option>
                  <option value="en-TZ">English (Tanzania)</option>
                </optgroup>

                {/* Portuguese */}
                <optgroup label="🇵🇹 Portuguese">
                  <option value="pt-BR">Português (Brasil) - Portuguese (Brazil)</option>
                  <option value="pt-PT">Português (Portugal) - Portuguese (Portugal)</option>
                </optgroup>

                {/* French */}
                <optgroup label="🇫🇷 French">
                  <option value="fr-FR">Français (France) - French (France)</option>
                  <option value="fr-CA">Français (Canada) - French (Canada)</option>
                  <option value="fr-BE">Français (Belgique) - French (Belgium)</option>
                  <option value="fr-CH">Français (Suisse) - French (Switzerland)</option>
                </optgroup>

                {/* German */}
                <optgroup label="🇩🇪 German">
                  <option value="de-DE">Deutsch (Deutschland) - German (Germany)</option>
                  <option value="de-AT">Deutsch (Österreich) - German (Austria)</option>
                  <option value="de-CH">Deutsch (Schweiz) - German (Switzerland)</option>
                </optgroup>

                {/* Italian */}
                <optgroup label="🇮🇹 Italian">
                  <option value="it-IT">Italiano (Italia) - Italian (Italy)</option>
                </optgroup>

                {/* Chinese */}
                <optgroup label="🇨🇳 Chinese">
                  <option value="zh-CN">中文 (简体，中国) - Chinese (Simplified, China)</option>
                  <option value="zh-TW">中文 (繁體，台灣) - Chinese (Traditional, Taiwan)</option>
                  <option value="zh-HK">中文 (粤语，香港) - Chinese (Cantonese, Hong Kong)</option>
                </optgroup>

                {/* Japanese */}
                <optgroup label="🇯🇵 Japanese">
                  <option value="ja-JP">日本語 (日本) - Japanese (Japan)</option>
                </optgroup>

                {/* Korean */}
                <optgroup label="🇰🇷 Korean">
                  <option value="ko-KR">한국어 (대한민국) - Korean (South Korea)</option>
                </optgroup>

                {/* Arabic */}
                <optgroup label="🇸🇦 Arabic">
                  <option value="ar-SA">العربية (السعودية) - Arabic (Saudi Arabia)</option>
                  <option value="ar-EG">العربية (مصر) - Arabic (Egypt)</option>
                  <option value="ar-AE">العربية (الإمارات) - Arabic (United Arab Emirates)</option>
                  <option value="ar-JO">العربية (الأردن) - Arabic (Jordan)</option>
                  <option value="ar-LB">العربية (لبنان) - Arabic (Lebanon)</option>
                  <option value="ar-MA">العربية (المغرب) - Arabic (Morocco)</option>
                  <option value="ar-TN">العربية (تونس) - Arabic (Tunisia)</option>
                  <option value="ar-DZ">العربية (الجزائر) - Arabic (Algeria)</option>
                  <option value="ar-IQ">العربية (العراق) - Arabic (Iraq)</option>
                  <option value="ar-KW">العربية (الكويت) - Arabic (Kuwait)</option>
                  <option value="ar-BH">العربية (البحرين) - Arabic (Bahrain)</option>
                  <option value="ar-QA">العربية (قطر) - Arabic (Qatar)</option>
                  <option value="ar-OM">العربية (عُمان) - Arabic (Oman)</option>
                  <option value="ar-YE">العربية (اليمن) - Arabic (Yemen)</option>
                  <option value="ar-SY">العربية (سوريا) - Arabic (Syria)</option>
                  <option value="ar-LY">العربية (ليبيا) - Arabic (Libya)</option>
                </optgroup>

                {/* Other European Languages */}
                <optgroup label="🇪🇺 Other European">
                  <option value="ru-RU">Русский (Россия) - Russian (Russia)</option>
                  <option value="nl-NL">Nederlands (Nederland) - Dutch (Netherlands)</option>
                  <option value="nl-BE">Nederlands (België) - Dutch (Belgium)</option>
                  <option value="sv-SE">Svenska (Sverige) - Swedish (Sweden)</option>
                  <option value="nb-NO">Norsk bokmål (Norge) - Norwegian Bokmål (Norway)</option>
                  <option value="da-DK">Dansk (Danmark) - Danish (Denmark)</option>
                  <option value="fi-FI">Suomi (Suomi) - Finnish (Finland)</option>
                  <option value="pl-PL">Polski (Polska) - Polish (Poland)</option>
                  <option value="cs-CZ">Čeština (Česká republika) - Czech (Czech Republic)</option>
                  <option value="sk-SK">Slovenčina (Slovensko) - Slovak (Slovakia)</option>
                  <option value="hu-HU">Magyar (Magyarország) - Hungarian (Hungary)</option>
                  <option value="ro-RO">Română (România) - Romanian (Romania)</option>
                  <option value="bg-BG">Български (България) - Bulgarian (Bulgaria)</option>
                  <option value="hr-HR">Hrvatski (Hrvatska) - Croatian (Croatia)</option>
                  <option value="sl-SI">Slovenščina (Slovenija) - Slovenian (Slovenia)</option>
                  <option value="lt-LT">Lietuvių (Lietuva) - Lithuanian (Lithuania)</option>
                  <option value="lv-LV">Latviešu (Latvija) - Latvian (Latvia)</option>
                  <option value="et-EE">Eesti (Eesti) - Estonian (Estonia)</option>
                  <option value="mt-MT">Malti (Malta) - Maltese (Malta)</option>
                  <option value="el-GR">Ελληνικά (Ελλάδα) - Greek (Greece)</option>
                  <option value="tr-TR">Türkçe (Türkiye) - Turkish (Turkey)</option>
                  <option value="uk-UA">Українська (Україна) - Ukrainian (Ukraine)</option>
                </optgroup>

                {/* Regional European */}
                <optgroup label="🏴 Regional European">
                  <option value="ca-ES">Català (Espanya) - Catalan (Spain)</option>
                  <option value="eu-ES">Euskera (Espainia) - Basque (Spain)</option>
                  <option value="gl-ES">Galego (España) - Galician (Spain)</option>
                </optgroup>

                {/* Other Languages */}
                <optgroup label="🌏 Other Languages">
                  <option value="hi-IN">हिन्दी (भारत) - Hindi (India)</option>
                  <option value="th-TH">ไทย (ไทย) - Thai (Thailand)</option>
                  <option value="vi-VN">Tiếng Việt (Việt Nam) - Vietnamese (Vietnam)</option>
                  <option value="id-ID">Bahasa Indonesia (Indonesia) - Indonesian (Indonesia)</option>
                  <option value="he-IL">עברית (ישראל) - Hebrew (Israel)</option>
                </optgroup>
              </select>
            </label>
          </div>
          
          <div>
            <ImageSelector
              projectRoot={root}
              value={bookMeta?.coverImage}
              onChange={(coverImage) => updateBookMeta({ coverImage })}
            />
          </div>
        </div>
      </section>

      {/* Description and Content */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("book.content")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          <label>
            <div>{t("book.description.label")}</div>
            <textarea
              style={{ width: "80%" }}
              rows={12}
              value={bookMeta?.description || ""}
              onChange={(e) => updateBookMeta({ description: e.target.value })}
            />
          </label>
          <label>
            <div>{t("book.keywords.label")}</div>
            <input
              style={{ width: "40%" }}
              value={bookMeta?.keywords?.join(", ") || ""}
              placeholder={t("book.keywords.placeholder")}
              onChange={(e) => updateBookMeta({ 
                keywords: e.target.value.split(",").map(k => k.trim()).filter(k => k) 
              })}
            />
          </label>
          <label>
            <div>{t("book.categories.label")}</div>
            <input
              style={{ width: "40%" }}
              value={bookMeta?.categories?.join(", ") || ""}
              placeholder={t("book.categories.placeholder")}
              onChange={(e) => updateBookMeta({ 
                categories: e.target.value.split(",").map(c => c.trim()).filter(c => c) 
              })}
            />
          </label>
        </div>
      </section>

      {/* Publishing Information */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("book.publishing")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label>
            <div>{t("book.publisher.label")}</div>
            <input
              style={{ width: "80%" }}
              value={bookMeta?.publisher || ""}
              onChange={(e) => updateBookMeta({ publisher: e.target.value })}
            />
          </label>
          <label>
            <div>{t("book.publishingDate.label")}</div>
            <input
              type="date"
              value={bookMeta?.publication_date || ""}
              onChange={(e) => updateBookMeta({ publication_date: e.target.value })}
            />
          </label>
          <label>
            <div>{t("book.isbn.label")}</div>
            <input
              style={{ width: "80%" }}
              value={bookMeta?.isbn || ""}
              placeholder={t("book.isbnPlaceholder")}
              onChange={(e) => updateBookMeta({ isbn: e.target.value })}
            />
          </label>
          <label>
            <div>{t("book.sku.label")}</div>
            <input
              style={{ width: "80%" }}
              value={bookMeta?.sku || ""}
              onChange={(e) => updateBookMeta({ sku: e.target.value })}
            />
          </label>
          <label>
            <div>{t("book.rights.label")}</div>
            <input
              style={{ width: "80%" }}
              value={bookMeta?.rights || ""}
              placeholder={t("book.copyrightPlaceholder")}
              onChange={(e) => updateBookMeta({ rights: e.target.value })}
            />
          </label>
        </div>
      </section>

      {/* Series Information */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("book.series")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label>
            <div>{t("book.seriesName.label")}</div>
            <input
              style={{ width: "80%" }}  
              value={bookMeta?.series?.name || ""}
              onChange={(e) => updateBookMeta({ 
                series: { 
                  ...bookMeta?.series, 
                  name: e.target.value 
                } 
              })}
            />
          </label>
          <label>
            <div>{t("book.seriesNumber.label")}</div>
            <input
              type="number"
              value={bookMeta?.series?.number || ""}
              onChange={(e) => updateBookMeta({ 
                series: { 
                  ...bookMeta?.series, 
                  number: e.target.value ? parseInt(e.target.value) : null 
                } 
              })}
            />
          </label>
        </div>
      </section>

      {/* Digital Voice Disclosure */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("book.disclosure")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={bookMeta?.disclosure_digital_voice || false}
              onChange={(e) => updateBookMeta({ 
                disclosure_digital_voice: e.target.checked 
              })}
            />
            <span>{t("book.hasDigitalVoices.label")}</span>
          </label>
        </div>
      </section>

      <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center" }}>
        <WorkflowCompleteButton step="project">
          {t("book.completeButton")}
        </WorkflowCompleteButton>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>{msg}</div>
      </div>
    </div>
  );
}
