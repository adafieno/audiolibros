import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { WorkflowCompleteButton } from "../components/WorkflowCompleteButton";
import { PageHeader } from "../components/PageHeader";
import { StandardButton } from "../components/StandardButton";
import { costTrackingService } from "../lib/cost-tracking-service";
import { sanitizeTextForTTS, previewSanitization, hasProblematicCharacters } from "../lib/text-sanitizer";

type ChapterType = 'chapter' | 'intro' | 'prologue' | 'epilogue' | 'credits' | 'outro';

type ChapterItem = {
  id: string;
  title: string;
  relPath: string;
  words: number;
  chapterType?: ChapterType;
};

interface SanitizationPreview {
  hasProblems: boolean;
  changes: number;
  preview: string;
  appliedRules: string[];
}

// Helper function to get display label for chapter type
function getChapterTypeLabel(t: any, chapterType?: ChapterType): string {
  if (!chapterType || chapterType === 'chapter') return '';
  
  const labels: Record<ChapterType, string> = {
    chapter: '',
    intro: t('manuscript.chapterTypes.intro', 'Intro'),
    prologue: t('manuscript.chapterTypes.prologue', 'Prologue'),
    epilogue: t('manuscript.chapterTypes.epilogue', 'Epilogue'),
    credits: t('manuscript.chapterTypes.credits', 'Credits'),
    outro: t('manuscript.chapterTypes.outro', 'Outro')
  };
  
  return labels[chapterType] || '';
}

export default function ManuscriptPage() {
  const { t } = useTranslation();
  const root = useProject((s) => s.root);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [selected, setSelected] = useState<ChapterItem | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string>("");
  const [showSanitization, setShowSanitization] = useState(false);
  const [sanitizationPreview, setSanitizationPreview] = useState<SanitizationPreview | null>(null);
  const [applySanitization, setApplySanitization] = useState(true);

  async function refreshList() {
    if (!root) return;
    setMsg(t("manuscript.loadingChapters"));
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
    setMsg(t("manuscript.processingManuscript"));
    
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
          // Note: applySanitization will be handled client-side for now
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
      setMsg(t("manuscript.ready"));
      await refreshList();
    } else {
      setMsg(t("manuscript.processingError", { code: res.code }));
    }
  }

  async function checkTextSanitization() {
    if (!selected || !text) return;
    
    setMsg(t("manuscript.analyzingText"));
    const problemCheck = hasProblematicCharacters(text, 'es');
    
    if (problemCheck.hasProblems) {
      const preview = previewSanitization(text, { language: 'es', preserveFormatting: true });
      setSanitizationPreview({
        hasProblems: true,
        changes: preview.changes,
        preview: preview.preview,
        appliedRules: preview.appliedRules
      });
      setShowSanitization(true);
      // Removed confusing status message - the sanitization preview shows the details
    } else {
      setMsg(t("manuscript.textNoProblems"));
      setSanitizationPreview(null);
      setShowSanitization(false);
    }
  }

  async function applySanitizationToChapter() {
    if (!selected || !root || !sanitizationPreview) return;
    
    setMsg(t("manuscript.applyingSanitization"));
    
    try {
      // Apply sanitization to the current chapter
      const result = sanitizeTextForTTS(text, { language: 'es', preserveFormatting: true });
      
      // Save the sanitized text back to the chapter file
      await window.khipu!.call("chapter:write", {
        projectRoot: root,
        relPath: selected.relPath,
        text: result.sanitized
      });
      
      // Update the displayed text
      setText(result.sanitized);
      setMsg(t("manuscript.sanitizationApplied", { changes: result.changes }));
      setSanitizationPreview(null);
      setShowSanitization(false);
      
    } catch (error) {
      console.error("Error applying sanitization:", error);
      setMsg(t("manuscript.sanitizationError"));
    }
  }

  async function handleSelect(ch: ChapterItem) {
    if (!root) return;
    setSelected(ch);
    setMsg(t("manuscript.loadingChapter"));
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
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "14px" }}>
                <input
                  type="checkbox"
                  checked={applySanitization}
                  onChange={(e) => setApplySanitization(e.target.checked)}
                />
                {t("manuscript.applySanitization")}
              </label>
              
              <StandardButton 
                onClick={chooseDocxAndParse}
                variant="primary"
              >
                {t("manuscript.importDocx")}
              </StandardButton>
              
              {selected && text && (
                <StandardButton 
                  onClick={checkTextSanitization}
                  variant="secondary"
                >
                  {t("manuscript.checkTTS")}
                </StandardButton>
              )}
              
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
                {t("manuscript.noChapters")}
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
                  const typeLabel = getChapterTypeLabel(t, c.chapterType);
                  const isSpecial = c.chapterType && c.chapterType !== 'chapter';
                  
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
                        <div style={{ 
                          fontWeight: 600, 
                          marginBottom: 4,
                          display: "flex",
                          alignItems: "center",
                          gap: "8px"
                        }}>
                          {c.title}
                          {isSpecial && (
                            <span style={{
                              fontSize: "11px",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: "var(--accent)",
                              color: "var(--bg)",
                              fontWeight: 500
                            }}>
                              {typeLabel}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                          {c.id} · {t("manuscript.chapterWords", { words: c.words })}
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
              {selected ? `${selected.title} (${selected.id})` : t("manuscript.selectChapter")}
            </div>
            
            <div style={{ flex: 1, padding: "12px", overflow: "auto" }}>
              {selected ? (
                <>
                  {/* Sanitization Preview */}
                  {showSanitization && sanitizationPreview && (
                    <div style={{ 
                      marginBottom: "16px", 
                      padding: "12px", 
                      backgroundColor: "var(--panelAccent)", 
                      border: "1px solid var(--border)", 
                      borderRadius: "6px" 
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "600" }}>
                          {t("manuscript.sanitizationPreview")}
                        </h4>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <StandardButton
                            onClick={applySanitizationToChapter}
                            variant="success"
                            size="compact"
                          >
                            {t("manuscript.applySanitizationBtn")}
                          </StandardButton>
                          <StandardButton
                            onClick={() => setShowSanitization(false)}
                            variant="secondary"
                            size="compact"
                          >
                            {t("common.dismiss")}
                          </StandardButton>
                        </div>
                      </div>
                      
                      <div style={{ fontSize: "12px", marginBottom: "8px", color: "var(--muted)" }}>
                        {t("manuscript.sanitizationSummary", { changes: sanitizationPreview.changes })}
                      </div>
                      
                      {sanitizationPreview.appliedRules.length > 0 && (
                        <details style={{ fontSize: "12px", marginBottom: "8px" }}>
                          <summary style={{ cursor: "pointer", fontWeight: "500" }}>
                            {t("manuscript.sanitizationRules")}
                          </summary>
                          <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                            {sanitizationPreview.appliedRules.map((rule, index) => (
                              <li key={index} style={{ marginBottom: "2px" }}>
                                {rule}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}
                  
                  {/* Chapter Content */}
                  <div style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--text)", whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                    {(showSanitization && sanitizationPreview) ? sanitizationPreview.preview : (text || "Contenido del capítulo…")}
                  </div>
                </>
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
