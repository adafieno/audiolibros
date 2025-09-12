import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";

interface Chapter {
  id: string;
  title?: string;
  relPath: string;
}

interface ChapterStatus {
  hasText: boolean;
  hasPlan: boolean;
  isComplete: boolean;
}

export default function AudioProductionPage({ onStatus }: { onStatus: (s: string) => void }) {
  const { t } = useTranslation();
  const { root } = useProject();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterStatus, setChapterStatus] = useState<Map<string, ChapterStatus>>(new Map());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>("");

  const checkChapterStatus = useCallback(async (chapterId: string): Promise<ChapterStatus> => {
    if (!root) {
      return { hasText: false, hasPlan: false, isComplete: false };
    }
    
    // Check if chapter text exists
    let hasText = false;
    const textPath = `analysis/chapters_txt/${chapterId}.txt`;
    
    try {
      const textData = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: textPath,
        json: false
      });
      hasText = textData !== null && textData !== undefined;
    } catch {
      // Text file doesn't exist
    }
    
    // Check if plan exists - this is the key requirement
    let hasPlan = false;
    const planPath = `ssml/plans/${chapterId}.plan.json`;
    
    try {
      const planData = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: planPath,
        json: true
      });
      hasPlan = planData !== null && planData !== undefined;
    } catch {
      // Plan file doesn't exist
    }
    
    // Check if audio production is complete
    let isComplete = false;
    const completionPath = `audio/${chapterId}.complete`;
    try {
      const completionData = await window.khipu!.call("fs:read", {
        projectRoot: root,
        relPath: completionPath,
        json: true
      }) as { complete?: boolean; completedAt?: string } | null;
      isComplete = completionData?.complete === true;
    } catch {
      isComplete = false;
    }
    
    return { hasText, hasPlan, isComplete };
  }, [root]);

  const loadChapters = useCallback(async () => {
    if (!root) return;
    
    try {
      setLoading(true);
      setMessage("Loading chapters...");
      onStatus("Loading chapters...");
      
      const chapterList = await window.khipu!.call("chapters:list", { projectRoot: root });
      
      if (chapterList && Array.isArray(chapterList)) {
        setChapters(chapterList);
        
        // Check status of each chapter
        const statusMap = new Map<string, ChapterStatus>();
        for (const chapter of chapterList) {
          const status = await checkChapterStatus(chapter.id);
          statusMap.set(chapter.id, status);
        }
        setChapterStatus(statusMap);
        setMessage("");
        onStatus("");
      } else {
        setMessage("No chapters found");
        onStatus("");
      }
    } catch (error) {
      console.warn("Failed to load chapters:", error);
      setMessage("Failed to load chapters");
      onStatus("");
    } finally {
      setLoading(false);
    }
  }, [root, checkChapterStatus, onStatus]);

  useEffect(() => {
    if (root) {
      loadChapters();
    }
  }, [root, loadChapters]);

  // Filter chapters to only show those with orchestration plans
  const chaptersWithPlans = chapters.filter(chapter => {
    const status = chapterStatus.get(chapter.id);
    return status?.hasPlan === true;
  });

  const completedChapters = chaptersWithPlans.filter(chapter => {
    const status = chapterStatus.get(chapter.id);
    return status?.isComplete === true;
  });

  return (
    <div style={{ padding: "1rem" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.5rem", fontWeight: "600" }}>
          {t("nav.voice")}
        </h2>
        <p style={{ color: "#666", margin: "0" }}>
          Generate audio files for chapters that have completed orchestration plans.
        </p>
      </div>

      {loading && (
        <div style={{ 
          padding: "2rem", 
          textAlign: "center", 
          color: "#666" 
        }}>
          <div>Loading chapters...</div>
        </div>
      )}

      {message && !loading && (
        <div style={{ 
          padding: "1rem", 
          backgroundColor: "#f0f0f0", 
          borderRadius: "4px",
          margin: "1rem 0",
          color: "#666"
        }}>
          {message}
        </div>
      )}

      {!loading && !message && (
        <>
          {chaptersWithPlans.length === 0 ? (
            <div style={{ 
              padding: "3rem", 
              textAlign: "center", 
              color: "#666",
              backgroundColor: "#f9f9f9",
              borderRadius: "8px",
              border: "2px dashed #ccc"
            }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🪄</div>
              <h3 style={{ margin: "0 0 0.5rem 0", color: "#999" }}>No chapters ready for audio production</h3>
              <p style={{ margin: "0", fontSize: "0.9rem" }}>
                Complete orchestration plans for chapters first, then return here to generate audio files.
              </p>
            </div>
          ) : (
            <div>
              <div style={{ 
                display: "flex", 
                gap: "2rem", 
                marginBottom: "1.5rem",
                fontSize: "0.9rem",
                color: "#666"
              }}>
                <div>
                  <strong>{chaptersWithPlans.length}</strong> chapters ready for audio production
                </div>
                <div>
                  <strong>{completedChapters.length}</strong> completed
                </div>
              </div>

              <div style={{ 
                display: "grid", 
                gap: "1rem",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))"
              }}>
                {chaptersWithPlans.map((chapter) => {
                  const status = chapterStatus.get(chapter.id);
                  const isComplete = status?.isComplete === true;
                  
                  return (
                    <div
                      key={chapter.id}
                      style={{
                        padding: "1.5rem",
                        backgroundColor: isComplete ? "#f0fff0" : "#ffffff",
                        border: isComplete ? "2px solid #90ee90" : "2px solid #e0e0e0",
                        borderRadius: "8px",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                      }}
                    >
                      <div style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        gap: "0.5rem",
                        marginBottom: "1rem"
                      }}>
                        <div style={{ fontSize: "1.5rem" }}>
                          {isComplete ? "✅" : "🎙️"}
                        </div>
                        <div>
                          <h3 style={{ 
                            margin: "0", 
                            fontSize: "1.1rem",
                            color: isComplete ? "#2d5a2d" : "#333"
                          }}>
                            {chapter.title || chapter.id}
                          </h3>
                          <div style={{ 
                            fontSize: "0.8rem", 
                            color: "#666",
                            marginTop: "0.25rem"
                          }}>
                            Chapter ID: {chapter.id}
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ marginBottom: "1rem" }}>
                        <div style={{ 
                          display: "inline-block",
                          padding: "0.25rem 0.5rem",
                          backgroundColor: "#e3f2fd",
                          color: "#1565c0",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: "500"
                        }}>
                          ✓ Orchestration plan ready
                        </div>
                      </div>

                      <div style={{ 
                        display: "flex", 
                        gap: "0.5rem"
                      }}>
                        <button
                          style={{
                            flex: 1,
                            padding: "0.5rem",
                            backgroundColor: isComplete ? "#6c757d" : "#007bff",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: isComplete ? "default" : "pointer",
                            fontSize: "0.85rem",
                            fontWeight: "500"
                          }}
                          disabled={isComplete}
                          onClick={() => {
                            // TODO: Implement audio generation
                            alert(`Generate audio for chapter: ${chapter.id}`);
                          }}
                        >
                          {isComplete ? "Audio Complete" : "Generate Audio"}
                        </button>
                        
                        {isComplete && (
                          <button
                            style={{
                              padding: "0.5rem",
                              backgroundColor: "#28a745",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              fontSize: "0.85rem",
                              fontWeight: "500",
                              minWidth: "80px"
                            }}
                            onClick={() => {
                              // TODO: Implement play audio
                              alert(`Play audio for chapter: ${chapter.id}`);
                            }}
                          >
                            ▶ Play
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
