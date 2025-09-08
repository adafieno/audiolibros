import { useEffect, useState } from "react";
import { useCharacters } from "../hooks/useCharacters";
import { useProject } from "../store/project";

function CharactersPage() {
  const { root } = useProject();
  const {
    characters,
    loading,
    saving,
    dirty,
    message,
    reloadDetection,
    addCharacter,
    removeCharacter,
    sortByFrequency,
    save,
    load,
    assignVoices,
    updateVoiceAssignment,
    availableVoices,
  } = useCharacters();

  const [hasCharacterList, setHasCharacterList] = useState(false);
  const [checkingFile, setCheckingFile] = useState(true);
  const [detectionProgress, setDetectionProgress] = useState<{current: number, total: number} | null>(null);

  useEffect(() => {
    if (!root) {
      setHasCharacterList(false);
      setCheckingFile(false);
      return;
    }

    // Listen for detection progress
    const handleProgress = (progress: {current: number, total: number}) => {
      setDetectionProgress(progress);
    };

    if (window.khipu?.characters?.onProgress) {
      window.khipu.characters.onProgress(handleProgress);
    }

    if (window.khipu) {
      window.khipu.fileExists("dossier/characters.json")
        .then((exists: boolean) => {
          setHasCharacterList(exists);
          if (exists) {
            // Load characters if file exists
            load();
          }
        })
        .catch(() => setHasCharacterList(false))
        .finally(() => setCheckingFile(false));
    } else {
      console.error("Khipu object is not available in the renderer process.");
      setHasCharacterList(false);
      setCheckingFile(false);
    }

    return () => {
      // Cleanup would go here if needed
      setDetectionProgress(null);
    };
  }, [root, load]);

  const runDetection = async () => {
    try {
      console.log("Starting character detection...");
      
      // Run the detection without timeout - let it complete naturally
      await reloadDetection();
      
      console.log("Detection completed successfully!");
      
      // Clear progress when done
      setDetectionProgress(null);
      
      // Update file existence flag
      if (window.khipu) {
        const charactersPath = `${root}/dossier/characters.json`;
        const exists = await window.khipu.fileExists(charactersPath);
        console.log("File exists:", exists, "at path:", charactersPath);
        setHasCharacterList(exists);
      }
    } catch (error) {
      console.error("Detection failed:", error);
      // Ensure loading state is cleared even on error
      setHasCharacterList(false);
      setDetectionProgress(null);
    }
  };
  const saveCharacters = () => void save();
  const add = () => addCharacter();
  const remove = (id: string) => removeCharacter(id);

  // Show loading while checking file existence
  if (checkingFile) {
    return (
      <div style={{ padding: "16px", maxWidth: "1200px" }}>
        <div style={{ textAlign: "center", padding: "64px 0" }}>
          <p style={{ color: "var(--muted)" }}>Loading...</p>
        </div>
      </div>
    );
  }

  // Show message if no project is loaded
  if (!root) {
    return (
      <div style={{ padding: "16px", maxWidth: "1200px" }}>
        <div style={{ textAlign: "center", padding: "64px 0", backgroundColor: "var(--panel)", borderRadius: "8px", border: "1px dashed var(--border)" }}>
          <p style={{ color: "var(--text)", fontSize: "18px", marginBottom: "8px" }}>No project loaded</p>
          <p style={{ color: "var(--muted)", fontSize: "14px" }}>Please load a project first to manage characters.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px", maxWidth: "1200px" }}>
      <h1 style={{ fontSize: "32px", fontWeight: "bold", color: "var(--text)", marginBottom: "8px" }}>Characters</h1>
      <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "24px" }}>Detection, editing & voice preparation.</p>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px", alignItems: "center" }}>
        <button 
          onClick={runDetection} 
          disabled={loading} 
          style={{ padding: "6px 12px", fontSize: "14px" }}
        >
          {loading ? "Detecting..." : "Detect / Refresh"}
        </button>
        
        <button 
          onClick={add} 
          disabled={loading} 
          style={{ padding: "6px 12px", fontSize: "14px" }}
        >
          Add
        </button>
        
        {(hasCharacterList || characters.length > 0) && (
          <>
            <button 
              onClick={sortByFrequency} 
              disabled={loading || characters.length === 0} 
              style={{ padding: "6px 12px", fontSize: "14px" }}
            >
              Sort by Frequency
            </button>
            
            <button 
              onClick={assignVoices} 
              disabled={loading || characters.length === 0} 
              style={{ padding: "6px 12px", fontSize: "14px" }}
            >
              Assign Voices
            </button>
            
            <button 
              onClick={saveCharacters} 
              disabled={saving || loading || !dirty} 
              style={{ padding: "6px 12px", fontSize: "14px" }}
            >
              {saving ? "Saving..." : "Save"}
              {dirty && !saving && " *"}
            </button>
          </>
        )}
      </div>

      {loading && (
        <div style={{ 
          marginBottom: "16px", 
          padding: "16px", 
          backgroundColor: "var(--panelAccent)", 
          border: "1px solid var(--border)", 
          borderRadius: "6px", 
          fontSize: "14px" 
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{
              display: "inline-block",
              width: "16px",
              height: "16px",
              border: "2px solid var(--accent)",
              borderTop: "2px solid transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite"
            }}></div>
            <span style={{ color: "var(--text)" }}>Running character detection...</span>
          </div>
          {detectionProgress && (
            <div style={{ marginTop: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                <span>Processing chapter {detectionProgress.current} of {detectionProgress.total}</span>
                <span>{Math.round((detectionProgress.current / detectionProgress.total) * 100)}%</span>
              </div>
              <div style={{ width: "100%", backgroundColor: "var(--border)", borderRadius: "9999px", height: "8px" }}>
                <div 
                  style={{ 
                    backgroundColor: "var(--accent)", 
                    height: "8px", 
                    borderRadius: "9999px", 
                    transition: "all 0.3s",
                    width: `${(detectionProgress.current / detectionProgress.total) * 100}%` 
                  }}
                ></div>
              </div>
            </div>
          )}
          <div style={{ fontSize: "12px", color: "var(--accent)", marginTop: "4px" }}>This may take a moment while analyzing the manuscript...</div>
        </div>
      )}

          {message && !loading && (
            <div style={{
              marginBottom: "16px",
              padding: "12px",
              borderRadius: "6px",
              fontSize: "14px",
              ...(message.includes('failed') || message.includes('crashed') || message.includes('timed out')
                ? { backgroundColor: "var(--panelAccent)", border: "1px solid var(--error)", color: "var(--error)" }
                : message.includes('detected') || message.includes('Successfully')
                ? { backgroundColor: "var(--panelAccent)", border: "1px solid var(--success)", color: "var(--success)" }
                : { backgroundColor: "var(--panelAccent)", border: "1px solid var(--accent)", color: "var(--accent)" })
            }}>
              {message}
              {(message.includes('failed') || message.includes('timed out')) && (
                <div style={{ marginTop: "8px", fontSize: "12px" }}>
                  <p><strong>💡 Troubleshooting tips:</strong></p>
                  <ul style={{ marginLeft: "16px", marginTop: "4px", listStyleType: "disc" }}>
                    <li>Ensure your project has manuscript files in <code>analysis/chapters_txt/</code></li>
                    <li>Check that Python dependencies are installed</li>
                    <li>Try adding characters manually using the "Add" button</li>
                  </ul>
                </div>
              )}
            </div>
          )}
          
      {!hasCharacterList && !loading && characters.length === 0 && (
        <div style={{ textAlign: "center", padding: "64px 0", backgroundColor: "var(--panel)", borderRadius: "8px", border: "1px dashed var(--border)", marginBottom: "24px" }}>
          <p style={{ color: "var(--text)", fontSize: "18px", marginBottom: "8px" }}>No characters yet</p>
          <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "16px" }}>Run detection to generate a character list.</p>
        </div>
      )}

      {(hasCharacterList || characters.length > 0) && !loading && (
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", 
          gap: "12px",
          marginBottom: "24px"
        }}>
            {characters.length === 0 ? (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "64px 0", backgroundColor: "var(--panel)", borderRadius: "12px", border: "1px dashed var(--border)" }}>
                <p style={{ color: "var(--text)", fontSize: "18px", marginBottom: "8px" }}>Character list is empty</p>
                <p style={{ color: "var(--muted)", fontSize: "14px" }}>Add characters manually or run detection again.</p>
              </div>
            ) : (
              characters.map(c => (
              <div
                key={c.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "12px",
                  backgroundColor: "var(--panel)"
                }}
              >
                <div>
                  {/* Character name */}
                  <div style={{ fontWeight: "500", marginBottom: "8px", fontSize: "16px", color: "var(--text)" }}>
                    {c.name}
                  </div>
                  
                  {/* Frequency */}
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>
                    Frequency: {c.frequency}%
                  </div>
                  
                  {/* Basic info */}
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>
                    {c.traits.gender === 'M' ? 'Male' : c.traits.gender === 'F' ? 'Female' : 'Neutral'} • {(c.traits.age || 'Adult').charAt(0).toUpperCase() + (c.traits.age || 'adult').slice(1)}
                  </div>

                  {/* Character importance badges */}
                  {(c.isNarrator || c.isMainCharacter) && (
                    <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "8px" }}>
                      {c.isNarrator && c.isMainCharacter 
                        ? "Narrator, Main Character"
                        : c.isNarrator 
                        ? "Narrator"
                        : "Main Character"
                      }
                    </div>
                  )}

                  {/* Description */}
                  {c.description && (
                    <div style={{ fontSize: "12px", color: "var(--text)", marginBottom: "8px" }}>
                      {c.description}
                    </div>
                  )}

                  {/* Personality */}
                  {c.traits.personality && c.traits.personality.length > 0 && (
                    <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>
                      Personality: {Array.isArray(c.traits.personality) ? c.traits.personality.join(', ') : c.traits.personality}
                    </div>
                  )}

                  {/* Speaking Style */}
                  {c.traits.speaking_style && c.traits.speaking_style.length > 0 && (
                    <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "8px" }}>
                      Speaking Style: {Array.isArray(c.traits.speaking_style) ? c.traits.speaking_style.join(', ') : c.traits.speaking_style}
                    </div>
                  )}

                  {/* Voice Assignment */}
                  {c.voiceAssignment && (
                    <div style={{ 
                      marginTop: "12px", 
                      padding: "8px", 
                      backgroundColor: "var(--panelAccent)", 
                      borderRadius: "4px",
                      border: "1px solid var(--border)"
                    }}>
                      <div style={{ fontSize: "12px", fontWeight: "500", color: "var(--text)", marginBottom: "6px" }}>
                        Voice Assignment
                      </div>
                      
                      {/* Voice Selection */}
                      <div style={{ marginBottom: "6px" }}>
                        <select
                          value={c.voiceAssignment.voiceId}
                          onChange={(e) => updateVoiceAssignment(c.id, e.target.value, c.voiceAssignment?.style)}
                          style={{
                            width: "100%",
                            padding: "4px 6px",
                            fontSize: "11px",
                            backgroundColor: "var(--panel)",
                            color: "var(--text)",
                            border: "1px solid var(--border)",
                            borderRadius: "3px"
                          }}
                        >
                          <option value="">Select Voice</option>
                          {availableVoices.map(voice => (
                            <option key={voice.id} value={voice.id}>
                              {voice.id} ({voice.gender}, {voice.locale})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Style Selection */}
                      {c.voiceAssignment.voiceId && availableVoices.find(v => v.id === c.voiceAssignment?.voiceId)?.styles && (
                        <div style={{ marginBottom: "6px" }}>
                          <select
                            value={c.voiceAssignment.style || ""}
                            onChange={(e) => updateVoiceAssignment(c.id, c.voiceAssignment!.voiceId, e.target.value || undefined)}
                            style={{
                              width: "100%",
                              padding: "4px 6px",
                              fontSize: "11px",
                              backgroundColor: "var(--panel)",
                              color: "var(--text)",
                              border: "1px solid var(--border)",
                              borderRadius: "3px"
                            }}
                          >
                            <option value="">Default Style</option>
                            {availableVoices.find(v => v.id === c.voiceAssignment?.voiceId)?.styles.map(style => (
                              <option key={style} value={style}>
                                {style}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Prosody Controls */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", fontSize: "10px" }}>
                        <div>
                          <label style={{ color: "var(--muted)" }}>Rate: {c.voiceAssignment.rate_pct || 0}%</label>
                          <input
                            type="range"
                            min="-50"
                            max="50"
                            value={c.voiceAssignment.rate_pct || 0}
                            onChange={(e) => updateVoiceAssignment(c.id, c.voiceAssignment!.voiceId, c.voiceAssignment?.style, {
                              ...c.voiceAssignment,
                              rate_pct: parseInt(e.target.value)
                            })}
                            style={{ width: "100%" }}
                          />
                        </div>
                        <div>
                          <label style={{ color: "var(--muted)" }}>Pitch: {c.voiceAssignment.pitch_pct || 0}%</label>
                          <input
                            type="range"
                            min="-50"
                            max="50"
                            value={c.voiceAssignment.pitch_pct || 0}
                            onChange={(e) => updateVoiceAssignment(c.id, c.voiceAssignment!.voiceId, c.voiceAssignment?.style, {
                              ...c.voiceAssignment,
                              pitch_pct: parseInt(e.target.value)
                            })}
                            style={{ width: "100%" }}
                          />
                        </div>
                      </div>

                      {/* Style Degree */}
                      {c.voiceAssignment.style && (
                        <div style={{ marginTop: "4px", fontSize: "10px" }}>
                          <label style={{ color: "var(--muted)" }}>Intensity: {Math.round((c.voiceAssignment.styledegree || 0.6) * 100)}%</label>
                          <input
                            type="range"
                            min="10"
                            max="100"
                            value={Math.round((c.voiceAssignment.styledegree || 0.6) * 100)}
                            onChange={(e) => updateVoiceAssignment(c.id, c.voiceAssignment!.voiceId, c.voiceAssignment?.style, {
                              ...c.voiceAssignment,
                              styledegree: parseInt(e.target.value) / 100
                            })}
                            style={{ width: "100%" }}
                          />
                        </div>
                      )}

                      <div style={{ fontSize: "10px", color: "var(--muted)", marginTop: "4px" }}>
                        Method: {c.voiceAssignment.method === "llm_auto" ? "Auto-assigned" : "Manual"}
                      </div>
                    </div>
                  )}
                  
                  {/* Remove button */}
                  <div style={{ marginTop: "8px" }}>
                    <button
                      onClick={() => remove(c.id)}
                      style={{
                        padding: "4px 8px",
                        fontSize: "12px",
                        backgroundColor: "var(--error)",
                        color: "var(--btn-fg)",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer"
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default CharactersPage;
