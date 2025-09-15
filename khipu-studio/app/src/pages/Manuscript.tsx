import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { WorkflowCompleteButton } from "../components/WorkflowCompleteButton";
import { PageHeader } from "../components/PageHeader";
import { StandardButton } from "../components/StandardButton";
import { costTrackingService } from "../lib/cost-tracking-service";

type ChapterItem = {
  id: string;
  title: string;
  relPath: string;
  words: number;
};

export default function ManuscriptPage() {
  const { t } = useTranslation();
  const root = useProject((s) => s.root);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [selected, setSelected] = useState<ChapterItem | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string>("");

  async function refreshList() {
    if (!root) return;
    setMsg("Cargando capítulos…");
    const items = await window.khipu!.call("chapters:list", { projectRoot: root });
    setChapters(items);
    setMsg("");
    // auto-select first if none
    if (items.length && !selected) {
      void handleSelect(items[0]);
    } else if (!items.length) {
      setSelected(null);
      setText("");
    }
  }

  async function chooseDocxAndParse() {
    if (!root) return;
    const picked = await window.khipu!.call("manuscript:chooseDocx", undefined);
    if (!picked) return;
    setMsg("Procesando manuscrito…");
    
    // Initialize cost tracking for this project
    try {
      await costTrackingService.setProjectRoot(root);
    } catch (error) {
      console.warn('Failed to initialize cost tracking for manuscript parsing:', error);
    }
    
    const res = await costTrackingService.trackAutomatedOperation(
      'manuscript:parse',
      async () => {
        if (!window.khipu?.call) throw new Error("IPC method not available");
        return await window.khipu.call("manuscript:parse", {
          projectRoot: root,
          docxPath: picked,
        });
      },
      {
        page: 'manuscript',
        projectId: root.split('/').pop() || 'unknown'
      }
    ) as { code: number };
    
    // Track LLM cost for manuscript parsing
    try {
      // Estimate token usage based on typical manuscript parsing
      // This is an estimate - ideally the backend should return actual token counts
      const estimatedInputTokens = 2000; // Typical input for parsing instructions
      const estimatedOutputTokens = 5000; // Typical output for chapter structure and metadata
      
      costTrackingService.trackLlmUsage({
        provider: 'openai-gpt4o', // Default assumption - should ideally get from project config
        operation: 'manuscript_parsing',
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        wasCached: false,
        cacheHit: false,
        page: 'manuscript',
        projectId: root.split('/').pop() || 'unknown'
      });
      
      console.log(`📊 Tracked manuscript parsing LLM usage: ${estimatedInputTokens + estimatedOutputTokens} tokens`);
    } catch (costError) {
      console.warn('Failed to track manuscript parsing cost:', costError);
    }
    
    if (res.code === 0) {
      setMsg("Listo ✔");
      await refreshList();
    } else {
      setMsg(`Error al procesar (código ${res.code})`);
    }
  }

  async function handleSelect(ch: ChapterItem) {
    if (!root) return;
    setSelected(ch);
    setMsg("Cargando capítulo…");
    const { text } = await window.khipu!.call("chapter:read", {
      projectRoot: root,
      relPath: ch.relPath,
    });
    setText(text ?? "");
    setMsg("");
  }

  useEffect(() => {
    if (root) void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  return (
    <>
      <div>
        <PageHeader 
          title={t("manu.title")}
          description={t("manu.description")}
          actions={
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <StandardButton 
                onClick={chooseDocxAndParse}
                variant="primary"
              >
                {t("manuscript.importDocx")}
              </StandardButton>
              <WorkflowCompleteButton 
                step="manuscript" 
                disabled={chapters.length === 0}
              >
                {t("manuscript.completeButton")}
              </WorkflowCompleteButton>
              {msg && (
                <span style={{ color: "var(--muted)", fontSize: "14px", marginLeft: "12px" }}>
                  {msg}
                </span>
              )}
            </div>
          }
        />
        
      </div>
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "320px 1fr", 
        gap: 24, 
        height: "100%",
        overflow: "hidden"
      }}>
        {/* Left: chapters */}
        <aside style={{ 
          borderRight: "1px solid var(--border)", 
          paddingRight: "20px",
          paddingLeft: "4px",
          display: "flex",
          flexDirection: "column",
          minHeight: 0
        }}>
          <div style={{ 
            overflow: "auto", 
            paddingTop: "4px",
            paddingLeft: "2px",
            paddingRight: "4px",
            flex: 1
          }}>
            {chapters.length === 0 ? (
              <div style={{ color: "var(--muted)", padding: "20px 0", textAlign: "center" }}>
                No hay capítulos. Importa un .docx para generar la estructura.
              </div>
            ) : (
              <ul style={{ 
                listStyle: "none", 
                padding: 0, 
                margin: 0, 
                display: "grid", 
                gap: 8
              }}>
                {chapters.map((c) => {
                  const active = selected?.id === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => handleSelect(c)}
                        style={{
                          width: "calc(100% - 4px)",
                          textAlign: "left",
                          padding: "12px 14px",
                          borderRadius: "6px",
                          border: "1px solid var(--border)",
                          background: active ? "var(--panelAccent)" : "var(--panel)",
                          color: "inherit",
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                          boxSizing: "border-box",
                          margin: "0 2px"
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{c.title}</div>
                        <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                          {c.id} · {c.words} palabras
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Right: preview */}
        <section style={{ minHeight: 0 }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ padding: "8px 12px", backgroundColor: "var(--panelAccent)", borderBottom: "1px solid var(--border)", fontSize: "14px", fontWeight: 500 }}>
              {selected ? `${selected.title} (${selected.id})` : "Selecciona un capítulo"}
            </div>
            
            <div style={{ flex: 1, padding: "12px", overflow: "auto" }}>
              {selected ? (
                <div style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--text)", whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                  {text || "Contenido del capítulo…"}
                </div>
              ) : (
                <div style={{ color: "var(--muted)", fontStyle: "italic" }}>
                  Selecciona un capítulo para ver su contenido
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
