import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { WorkflowCompleteButton } from "../components/WorkflowCompleteButton";
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
  const [msg, setMsg] = useState("");

  // Load config on mount or project change
  useEffect(() => {
    if (!root) {
      setCfg(null);
      return;
    }
    
    loadProjectConfig(root)
      .then(setCfg)
      .catch(err => {
        console.error("Failed to load project config:", err);
        setMsg(t("book.loadError"));
      });
  }, [root, t]);

  // Helper to update nested config properties
  const update = <K extends keyof ProjectConfig>(
    key: K,
    value: ProjectConfig[K]
  ) => {
    if (!cfg) return;
    setCfg({ ...cfg, [key]: value });
  };

  // Helper for BookMeta updates with proper defaults
  const updateBookMeta = (updates: Partial<BookMeta>) => {
    const currentMeta: BookMeta = cfg?.bookMeta || {
      title: "",
      authors: [],
      language: cfg?.language || "en-US"
    };
    
    const newMeta = { ...currentMeta, ...updates };
    console.log("Updating BookMeta:", { currentMeta, updates, newMeta });
    
    // Ensure required fields are never empty
    if (newMeta.authors.length === 0 && updates.authors && updates.authors.length > 0) {
      newMeta.authors = updates.authors.filter(author => author.trim() !== "");
    }
    
    update("bookMeta", newMeta);
  };

  const saveAll = useCallback(async () => {
    if (!root || !cfg) {
      console.log("Save aborted: missing root or cfg", { root: !!root, cfg: !!cfg });
      return;
    }
    
    try {
      console.log("Saving config with bookMeta:", cfg.bookMeta);
      console.log("Full config being saved:", cfg);
      
      const result = await saveProjectConfig(root, cfg);
      console.log("Save result:", result);
      
      setMsg(t("book.saved"));
      setTimeout(() => setMsg(""), 2000);
    } catch (err) {
      console.error("Failed to save config:", err);
      setMsg(t("book.saveError"));
    }
  }, [root, cfg, t]);

  if (!root) {
    return <div>{t("status.openProject")}</div>;
  }

  if (!cfg) {
    return <div>{t("book.loading")}</div>;
  }

  return (
    <div>
      <h2>{t("book.title")}</h2>

      {/* Basic Information */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("book.basicInfo")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label>
              <div>{t("book.title.label")}</div>
              <input
                value={cfg?.bookMeta?.title || ""}
                onChange={(e) => updateBookMeta({ title: e.target.value })}
              />
            </label>
            <label>
              <div>{t("book.subtitle.label")}</div>
              <input
                value={cfg?.bookMeta?.subtitle || ""}
                onChange={(e) => updateBookMeta({ subtitle: e.target.value })}
              />
            </label>
            <label>
              <div>{t("book.authors.label")}</div>
              <input
                value={cfg?.bookMeta?.authors?.join(", ") || ""}
                placeholder="Author 1, Author 2"
                onChange={(e) => updateBookMeta({ 
                  authors: e.target.value.split(",").map(a => a.trim()).filter(a => a) 
                })}
              />
            </label>
            <label>
              <div>{t("book.narrators.label")}</div>
              <input
                value={cfg?.bookMeta?.narrators?.join(", ") || ""}
                placeholder="Narrator 1, Narrator 2"
                onChange={(e) => updateBookMeta({ 
                  narrators: e.target.value.split(",").map(n => n.trim()).filter(n => n) 
                })}
              />
            </label>
            <label>
              <div>{t("book.language.label")}</div>
              <input
                value={cfg?.bookMeta?.language || cfg?.language || ""}
                onChange={(e) => updateBookMeta({ language: e.target.value })}
              />
            </label>
          </div>
          
          <div>
            <ImageSelector
              projectRoot={root}
              value={cfg?.bookMeta?.coverImage}
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
              rows={6}
              value={cfg?.bookMeta?.description || ""}
              onChange={(e) => updateBookMeta({ description: e.target.value })}
            />
          </label>
          <label>
            <div>{t("book.keywords.label")}</div>
            <input
              value={cfg?.bookMeta?.keywords?.join(", ") || ""}
              placeholder="keyword1, keyword2, keyword3"
              onChange={(e) => updateBookMeta({ 
                keywords: e.target.value.split(",").map(k => k.trim()).filter(k => k) 
              })}
            />
          </label>
          <label>
            <div>{t("book.categories.label")}</div>
            <input
              value={cfg?.bookMeta?.categories?.join(", ") || ""}
              placeholder="Fiction / Literary, Suspense"
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
              value={cfg?.bookMeta?.publisher || ""}
              onChange={(e) => updateBookMeta({ publisher: e.target.value })}
            />
          </label>
          <label>
            <div>{t("book.publishingDate.label")}</div>
            <input
              type="date"
              value={cfg?.bookMeta?.publication_date || ""}
              onChange={(e) => updateBookMeta({ publication_date: e.target.value })}
            />
          </label>
          <label>
            <div>{t("book.isbn.label")}</div>
            <input
              value={cfg?.bookMeta?.isbn || ""}
              placeholder="978-0-000000-00-0"
              onChange={(e) => updateBookMeta({ isbn: e.target.value })}
            />
          </label>
          <label>
            <div>{t("book.sku.label")}</div>
            <input
              value={cfg?.bookMeta?.sku || ""}
              onChange={(e) => updateBookMeta({ sku: e.target.value })}
            />
          </label>
          <label>
            <div>{t("book.rights.label")}</div>
            <input
              value={cfg?.bookMeta?.rights || ""}
              placeholder="© 2025 Author Name"
              onChange={(e) => updateBookMeta({ rights: e.target.value })}
            />
          </label>
        </div>
      </section>

      {/* Series Information */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("book.series")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
          <label>
            <div>{t("book.seriesName.label")}</div>
            <input
              value={cfg?.bookMeta?.series?.name || ""}
              onChange={(e) => updateBookMeta({ 
                series: { 
                  ...cfg?.bookMeta?.series, 
                  name: e.target.value 
                } 
              })}
            />
          </label>
          <label>
            <div>{t("book.seriesNumber.label")}</div>
            <input
              type="number"
              value={cfg?.bookMeta?.series?.number || ""}
              onChange={(e) => updateBookMeta({ 
                series: { 
                  ...cfg?.bookMeta?.series, 
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
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={cfg?.bookMeta?.disclosure_digital_voice || false}
            onChange={(e) => updateBookMeta({ 
              disclosure_digital_voice: e.target.checked 
            })}
          />
          <span>{t("book.hasDigitalVoices.label")}</span>
        </label>
      </section>

      <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={saveAll}>{t("book.save")}</button>
        <WorkflowCompleteButton step="project">
          {t("book.completeButton")}
        </WorkflowCompleteButton>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>{msg}</div>
      </div>
    </div>
  );
}
