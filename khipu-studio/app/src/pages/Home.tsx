import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { bootstrapVoiceInventory } from "../lib/voice";
import { bootstrapProjectFiles } from "../lib/project-bootstrap";
import { PageHeader } from "../components/PageHeader";
import StandardButton from "../components/StandardButton";
import type { ProjectConfig, BookMeta } from "../types/config";

type RecentItem = { 
  path: string; 
  name: string;
  title?: string;
  authors?: string[];
  language?: string;
  coverImage?: string; // Cover image path from bookMeta
};

// Component for project cover image with fallback
function ProjectCover({ project }: { project: RecentItem }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const loadCoverImage = async () => {
      // First, check if cover image path is already available in project data
      const coverImagePath = project.coverImage;
        
      if (coverImagePath) {
          // Try to load the configured cover image
          try {
            const result = await window.khipu!.call("file:getImageDataUrl", {
              projectRoot: project.path,
              fileName: coverImagePath
            });
            
            if (result.success && result.dataUrl) {
              setImageUrl(result.dataUrl);
              setShowFallback(false);
              console.log(`✅ Successfully loaded configured cover: ${coverImagePath} for ${project.name}`);
              return;
            }
          } catch (error) {
            console.log(`❌ Failed to load configured cover ${coverImagePath} for ${project.name}:`, error);
          }
        }

        // If no configured cover or it failed, try fallback file names for backward compatibility
        const fallbackFiles = ['art/cover_3000.jpg', 'art/cover.jpg', 'art/cover.png'];
        
        for (const fileName of fallbackFiles) {
          try {
            const result = await window.khipu!.call("file:getImageDataUrl", {
              projectRoot: project.path,
              fileName
            });
            
            if (result.success && result.dataUrl) {
              setImageUrl(result.dataUrl);
              setShowFallback(false);
              console.log(`✅ Successfully loaded fallback cover: ${fileName} for ${project.name}`);
              return;
            }
          } catch {
            // Continue trying other files
          }
        }
      
      // No cover image found, show fallback
      console.log(`📚 No cover found for ${project.name}, using fallback`);
      setShowFallback(true);
    };

    loadCoverImage();
  }, [project.path, project.name, project.coverImage]);

  return (
    <div style={{
      width: "60px",
      height: "80px",
      flexShrink: 0,
      borderRadius: "4px",
      overflow: "hidden",
      border: "1px solid var(--border)",
      backgroundColor: "var(--panelAccent)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      {imageUrl && !showFallback ? (
        <img
          src={imageUrl}
          alt={`Cover for ${project.title || project.name}`}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover"
          }}
          onError={() => {
            console.log(`🖼️ Image failed to display for ${project.name}`);
            setShowFallback(true);
          }}
        />
      ) : (
        <div style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "24px",
          color: "var(--muted)"
        }}>
          📚
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const setRoot = useProject((s) => s.setRoot);
  
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
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
              
              // Try to load book metadata from separate book.meta.json (optimized structure)
              let bookMeta = configData?.bookMeta; // Fallback to old structure
              try {
                const bookMetaData = await window.khipu!.call("fs:read", {
                  projectRoot: item.path,
                  relPath: "book.meta.json",
                  json: true
                }) as BookMeta;
                if (bookMetaData && typeof bookMetaData.title === 'string' && bookMetaData.title.trim() !== '') {
                  bookMeta = bookMetaData; // Use separate book.meta.json if it has content
                }
              } catch {
                // book.meta.json doesn't exist or is invalid, use fallback
              }
              
              return {
                ...item,
                title: bookMeta?.title,
                authors: bookMeta?.authors,
                language: configData?.language || bookMeta?.language,
                coverImage: bookMeta?.coverImage
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
    nav("/book", { replace: true });
  }

  async function browseParent() {
    const parent = await window.khipu!.call("project:browseForParent", undefined);
    if (parent) setParentDir(parent);
  }

  async function createNew() {
    setMsg("");
    const name = projName.trim();
    if (!parentDir || !name) {
      setMsg(t("home.validationError"));
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

    // Bootstrap initial project files
    try {
      await bootstrapProjectFiles(res.path);
    } catch (error) {
      console.warn('Failed to bootstrap project files:', error);
      // Continue - files will be created as needed
    }

    await window.khipu!.call("project:open", { path: res.path });
    setRoot(res.path);
    setProjName("");
    setParentDir("");
    setShowCreateForm(false);
    setMsg(t("home.createSuccess"));
    nav("/book", { replace: true });
  }

  const disabledCreate = useMemo(() => !parentDir || !projName.trim(), [parentDir, projName]);

  // Helper function to close create form modal
  const closeCreateForm = () => {
    setShowCreateForm(false);
    setMsg("");
    setProjName("");
    setParentDir("");
  };

  // Add keyboard support for modal
  useEffect(() => {
    if (!showCreateForm) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeCreateForm();
      }
    };
    
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showCreateForm]);

  return (
    <div style={{ maxWidth: "100%" }}>
      {/* Create Project Modal Overlay */}
      {showCreateForm && (
        <div 
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={(e) => {
            // Close modal when clicking outside the modal content
            if (e.target === e.currentTarget) {
              closeCreateForm();
            }
          }}
        >
          <div style={{
            backgroundColor: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "24px",
            minWidth: "500px",
            maxWidth: "600px",
            maxHeight: "80vh",
            overflow: "auto"
          }}>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center", 
              marginBottom: "20px" 
            }}>
              <h3 style={{ 
                fontSize: "20px", 
                fontWeight: "bold", 
                color: "var(--text)", 
                margin: 0 
              }}>
                {t("home.createNew")}
              </h3>
              <button
                onClick={closeCreateForm}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "var(--muted)",
                  padding: "0",
                  width: "32px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                ×
              </button>
            </div>
            
            <p style={{ 
              color: "var(--muted)", 
              fontSize: "14px", 
              marginBottom: "20px",
              lineHeight: "1.5"
            }}>
              {t("home.projectSetup")}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ 
                  display: "block", 
                  fontSize: "14px", 
                  fontWeight: "500", 
                  color: "var(--text)", 
                  marginBottom: "6px" 
                }}>
                  {t("home.parentDir")}
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    value={parentDir}
                    readOnly
                    placeholder={t("home.parentDirPlaceholder")}
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
                  <StandardButton 
                    onClick={browseParent}
                    variant="primary"
                    size="compact"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {t("home.browse")}
                  </StandardButton>
                </div>
              </div>
              
              <div>
                <label style={{ 
                  display: "block", 
                  fontSize: "14px", 
                  fontWeight: "500", 
                  color: "var(--text)", 
                  marginBottom: "6px" 
                }}>
                  {t("home.projectName")}
                </label>
                <input
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  placeholder={t("home.projectNamePlaceholder")}
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
                alignItems: "center",
                marginTop: "8px"
              }}>
                <div>
                  {msg && (
                    <span style={{ 
                      fontSize: "14px", 
                      color: msg.includes("Error") || msg.includes("error") ? "var(--error)" : "var(--success)" 
                    }}>
                      {msg}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <StandardButton 
                    onClick={closeCreateForm}
                    variant="secondary"
                  >
                    {t("planning.cancel")}
                  </StandardButton>
                  <StandardButton 
                    onClick={createNew} 
                    disabled={disabledCreate}
                    variant="success"
                  >
                    {t("home.create")}
                  </StandardButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <PageHeader 
        title={t("home.existingProjects")}
        description={t("home.instructions")}
        actions={
          <div style={{ display: "flex", gap: "8px" }}>
            <StandardButton 
              onClick={() => setShowCreateForm(true)}
              variant="primary"
              size="compact"
            >
              {t("home.createNew")}
            </StandardButton>
            <StandardButton 
              onClick={chooseExisting}
              variant="primary"
              size="compact"
            >
              {t("home.openExisting")}
            </StandardButton>
          </div>
        }
      />
      
      {/* Open existing */}
      <section style={{ marginBottom: "32px" }}>
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
            <p style={{ fontSize: "14px" }}>{t("home.noRecentsDescription")}</p>
          </div>
        ) : (
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
                    nav("/book", { replace: true });
                  }}
                >
                  <div style={{ display: "flex", gap: "12px", marginBottom: "2px" }}>
                    {/* Book cover thumbnail */}
                    <ProjectCover project={r} />
                    
                    <div style={{ flex: 1 }}>
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
                          {t("home.byAuthors", { authors: r.authors.join(", ") })}
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
                        nav("/book", { replace: true });
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
        )}
      </section>
    </div>
  );
}