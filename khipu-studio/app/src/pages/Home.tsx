import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { bootstrapVoiceInventory } from "../lib/voice";
import type { ProjectConfig } from "../types/config";

type RecentItem = { 
  path: string; 
  name: string;
  title?: string;
  authors?: string[];
  language?: string;
};

export default function Home() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const setRoot = useProject((s) => s.setRoot);
  
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Create form state
  const [parentDir, setParentDir] = useState<string>("");
  const [projName, setProjName] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const items = await window.khipu!.call("project:listRecents", undefined);
        
        // Load metadata for each project
        const enrichedItems = await Promise.allSettled(
          items.map(async (item: { path: string; name: string }) => {
            try {
              const configData = await window.khipu!.call("fs:read", {
                projectRoot: item.path,
                relPath: "project.khipu.json",
                json: true
              }) as ProjectConfig;
              
              return {
                ...item,
                title: configData?.bookMeta?.title,
                authors: configData?.bookMeta?.authors,
                language: configData?.language || configData?.bookMeta?.language
              };
            } catch (error) {
              // If we can't load config, just return the basic item
              console.warn(`Failed to load metadata for ${item.path}:`, error);
              return item;
            }
          })
        );
        
        // Extract successful results
        const enrichedProjects = enrichedItems
          .filter((result): result is PromiseFulfilledResult<RecentItem> => result.status === 'fulfilled')
          .map(result => result.value);
          
        setRecents(enrichedProjects);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function chooseExisting() {
    setMsg("");
    const picked = await window.khipu!.call("project:choose", undefined);
    if (!picked) return;
    await window.khipu!.call("project:open", { path: picked });
    setRoot(picked);
    nav("/project", { replace: true });
  }

  async function browseParent() {
    const parent = await window.khipu!.call("project:browseForParent", undefined);
    if (parent) setParentDir(parent);
  }

  async function createNew() {
    setMsg("");
    const name = projName.trim();
    if (!parentDir || !name) {
      setMsg("Selecciona una carpeta y un nombre.");
      return;
    }
    const res = (await window.khipu!.call("project:create", {
      parentDir,
      name,
    })) as { path?: string } | null;

    if (!res?.path) {
      setMsg(t("home.createError"));
      return;
    }

    // Bootstrap default voice inventory for the new project
    try {
      await bootstrapVoiceInventory(res.path);
    } catch (error) {
      console.warn('Failed to bootstrap voice inventory:', error);
      // Continue with project creation even if voice inventory fails
    }

    await window.khipu!.call("project:open", { path: res.path });
    setRoot(res.path);
    setProjName("");
    setMsg(t("home.createSuccess"));
    nav("/project", { replace: true });
  }

  const disabledCreate = useMemo(() => !parentDir || !projName.trim(), [parentDir, projName]);

  return (
    <div style={{ padding: "16px", maxWidth: "100%" }}>
      {/* Open existing */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: "bold", color: "var(--text)", marginBottom: "8px" }}>
          {t("home.existingProjects")}
        </h2>
        <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "16px" }}>
          {t("home.instructions")}
        </p>
        
        {loading ? (
          <div style={{ 
            textAlign: "center", 
            padding: "48px 0", 
            color: "var(--muted)",
            backgroundColor: "var(--panel)",
            borderRadius: "8px",
            border: "1px dashed var(--border)"
          }}>
            {t("home.loading")}
          </div>
        ) : recents.length === 0 ? (
          <div style={{ 
            textAlign: "center", 
            padding: "48px 0", 
            color: "var(--muted)",
            backgroundColor: "var(--panel)",
            borderRadius: "8px",
            border: "1px dashed var(--border)"
          }}>
            <p style={{ fontSize: "16px", marginBottom: "8px" }}>{t("home.noRecents")}</p>
            <p style={{ fontSize: "14px" }}>Create a new project or open an existing one to get started.</p>
          </div>
        ) : (
          <>
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", 
              gap: "16px",
              marginBottom: "16px"
            }}>
              {recents.map((r) => (
                <div
                  key={r.path}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "16px",
                    backgroundColor: "var(--panel)",
                    transition: "all 0.2s ease",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent)";
                    e.currentTarget.style.backgroundColor = "var(--panelAccent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.backgroundColor = "var(--panel)";
                  }}
                  onClick={async () => {
                    await window.khipu!.call("project:open", { path: r.path });
                    setRoot(r.path);
                    nav("/project", { replace: true });
                  }}
                >
                  <div style={{ marginBottom: "2px" }}>
                    <div style={{ 
                      fontWeight: "600", 
                      fontSize: "16px", 
                      color: "var(--text)",
                      marginBottom: "4px"
                    }}>
                      {r.title || r.name}
                    </div>
                    
                    {r.authors && r.authors.length > 0 && (
                      <div style={{ 
                        fontSize: "13px", 
                        color: "var(--text)",
                        marginBottom: "4px",
                        fontWeight: "500"
                      }}>
                        by {r.authors.join(", ")}
                      </div>
                    )}
                    
                    {r.language && (
                      <div style={{ 
                        fontSize: "12px", 
                        color: "var(--muted)",
                        marginBottom: "4px",
                        display: "inline-block",
                        backgroundColor: "var(--panelAccent)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        border: "1px solid var(--border)"
                      }}>
                        {r.language}
                      </div>
                    )}
                    
                    <div style={{ 
                      fontSize: "11px", 
                      color: "var(--muted)",
                      wordBreak: "break-all",
                      lineHeight: "1.4",
                      marginTop: "8px"
                    }}>
                      {r.path}
                    </div>
                  </div>
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "flex-end",
                    alignItems: "center"
                  }}>
                    <button
                      className="btn"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await window.khipu!.call("project:open", { path: r.path });
                        setRoot(r.path);
                        nav("/project", { replace: true });
                      }}
                      style={{
                        padding: "6px 12px",
                        fontSize: "14px",
                        backgroundColor: "var(--accent)",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer"
                      }}
                    >
                      {t("home.open")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        
        <div style={{ 
          borderTop: "1px solid var(--border)", 
          paddingTop: "16px",
          display: "flex",
          gap: "8px"
        }}>
          <button 
            className="btn" 
            onClick={chooseExisting}
            style={{
              padding: "8px 16px",
              backgroundColor: "var(--panel)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              cursor: "pointer"
            }}
          >
            {t("home.openExisting")}
          </button>
        </div>
      </section>

      {/* Create new */}
      <section style={{ 
        borderTop: "1px solid var(--border)", 
        paddingTop: "32px" 
      }}>
        <h3 style={{ fontSize: "20px", fontWeight: "bold", color: "var(--text)", marginBottom: "8px" }}>
          {t("home.createNew")}
        </h3>
        <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "16px" }}>
          Set up a new audiobook project with the required folder structure.
        </p>
        
        <div style={{
          backgroundColor: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "20px",
          maxWidth: "600px"
        }}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ 
              display: "block", 
              marginBottom: "6px", 
              fontWeight: "500",
              fontSize: "14px",
              color: "var(--text)"
            }}>
              {t("home.baseFolder")}
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                value={parentDir}
                onChange={(e) => setParentDir(e.target.value)}
                placeholder="C:\\proyectos\\audio"
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  fontSize: "14px",
                  backgroundColor: "var(--panel)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px"
                }}
              />
              <button 
                className="btn" 
                onClick={browseParent}
                style={{
                  padding: "8px 16px",
                  fontSize: "14px",
                  backgroundColor: "var(--panel)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                {t("home.browse")}
              </button>
            </div>
          </div>
          
          <div style={{ marginBottom: "20px" }}>
            <label style={{ 
              display: "block", 
              marginBottom: "6px", 
              fontWeight: "500",
              fontSize: "14px",
              color: "var(--text)"
            }}>
              {t("home.projectName")}
            </label>
            <input
              value={projName}
              onChange={(e) => setProjName(e.target.value)}
              placeholder="mi_libro"
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: "14px",
                backgroundColor: "var(--panel)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "4px"
              }}
            />
          </div>
          
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center" 
          }}>
            <div>
              {msg && (
                <span style={{ 
                  fontSize: "14px", 
                  color: msg.includes("Error") || msg.includes("error") ? "#ef4444" : "#10b981" 
                }}>
                  {msg}
                </span>
              )}
            </div>
            <button 
              className="btn" 
              onClick={createNew} 
              disabled={disabledCreate}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                backgroundColor: disabledCreate ? "#6b7280" : "#10b981",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: disabledCreate ? "not-allowed" : "pointer"
              }}
            >
              {t("home.create")}
            </button>
          </div>
        </div>
        
        <details style={{ marginTop: "16px", maxWidth: "600px" }}>
          <summary style={{ 
            cursor: "pointer", 
            fontSize: "14px", 
            color: "var(--muted)",
            marginBottom: "8px"
          }}>
            {t("home.structurePreview")}
          </summary>
          <pre style={{ 
            whiteSpace: "pre-wrap",
            backgroundColor: "var(--panel)",
            padding: "12px",
            borderRadius: "4px",
            border: "1px solid var(--border)",
            fontSize: "12px",
            color: "var(--muted)",
            margin: "8px 0"
          }}>
{`analysis/chapters_txt/
dossier/
ssml/plans/
ssml/xml/
cache/tts/
audio/chapters/
audio/book/
exports/
project.khipu.json
book.meta.json
production.settings.json`}
          </pre>
        </details>
      </section>
    </div>
  );
}