import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCharacters } from "../hooks/useCharacters";
import { useProject } from "../store/project";
import { useAudioCache } from "../hooks/useAudioCache";
import { loadProjectConfig } from "../lib/config";
import type { ProjectConfig } from "../types/config";
import type { Voice as VoiceType } from "../types/voice";

function CharactersPage() {
  const { t } = useTranslation();
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
    updateCharacter,
    sortByFrequency,
    save,
    load,
    assignVoices,
    updateVoiceAssignment,
    availableVoices,
    assignmentProgress,
  } = useCharacters();

  const [hasCharacterList, setHasCharacterList] = useState(false);
  const [checkingFile, setCheckingFile] = useState(true);
  const [detectionProgress, setDetectionProgress] = useState<{current: number, total: number} | null>(null);
  
  // Audition state 
  const [auditioningVoices, setAuditioningVoices] = useState<Set<string>>(new Set());
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
  
  // Use the new audio cache hook
  const { error: audioError, playAudition, stopAudio, clearError } = useAudioCache();
  
  // Editing state
  const [editingFields, setEditingFields] = useState<Set<string>>(new Set());

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

  // Load project config for audition
  useEffect(() => {
    if (!root) return;
    
    loadProjectConfig(root)
      .then((config: ProjectConfig) => setProjectConfig(config))
      .catch((error: unknown) => console.warn("Failed to load project config:", error));
  }, [root]);

  // Check if characters step is complete
  const isComplete = projectConfig?.workflow?.characters?.complete || false;

  // Handle marking completion
  const handleMarkComplete = async () => {
    if (!root || !projectConfig) return;
    
    try {
      const updatedConfig = {
        ...projectConfig,
        workflow: {
          ...projectConfig.workflow,
          characters: {
            ...projectConfig.workflow?.characters,
            complete: true,
            completedAt: new Date().toISOString()
          }
        }
      };
      
      // Save the updated config
      await window.khipu!.call("fs:write", { 
        projectRoot: root, 
        relPath: "project.khipu.json", 
        json: true, 
        content: updatedConfig 
      });
      
      setProjectConfig(updatedConfig);
      
      // Update the project store to mark the step as completed
      const { markStepCompleted } = useProject.getState();
      markStepCompleted("characters");
      
      console.log("Characters page marked as complete");
    } catch (error) {
      console.error("Failed to mark characters as complete:", error);
    }
  };

  // Handle audio errors
  useEffect(() => {
    if (audioError) {
      console.warn("Audio error:", audioError);
      clearError();
    }
  }, [audioError, clearError]);

  // Cleanup audio when component unmounts
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  // Handle voice audition with real TTS
  const handleAudition = async (characterId: string) => {
    if (!projectConfig) {
      console.warn("Project config not loaded");
      return;
    }

    const character = characters.find(c => c.id === characterId);
    if (!character?.voiceAssignment) {
      console.warn("No voice assigned to this character");
      return;
    }

    // Convert character voice to TTS voice format
    const characterVoice = availableVoices.find(v => v.id === character.voiceAssignment!.voiceId);
    if (!characterVoice) {
      console.warn("Voice not found in inventory:", character.voiceAssignment.voiceId);
      return;
    }

    // Convert to full voice format needed by generateAudition
    const voice: VoiceType = {
      id: characterVoice.id,
      engine: (characterVoice.engine as VoiceType["engine"]) || "azure", // Use voice engine or default to azure
      locale: characterVoice.locale,
      gender: characterVoice.gender === "M" ? "M" : characterVoice.gender === "F" ? "F" : "N",
      age_hint: (characterVoice.age_hint as "child" | "teen" | "adult" | "elderly") || "adult",
      accent_tags: characterVoice.accent_tags,
      styles: characterVoice.styles,
      description: `Voice for ${character.name}`
    };

    // If already auditioning this voice, stop
    if (auditioningVoices.has(character.voiceAssignment.voiceId)) {
      setAuditioningVoices(prev => {
        const next = new Set(prev);
        next.delete(character.voiceAssignment!.voiceId);
        return next;
      });
      return;
    }

    setAuditioningVoices(prev => new Set(prev).add(character.voiceAssignment!.voiceId));

    try {
      // Use caching unless explicitly disabled in config
      const useCache = projectConfig?.tts?.cache !== false;
      console.log(`🎤 Starting audition for character: ${character.name}`, { voice, config: !!projectConfig, useCache });
      
      await playAudition({
        voice: voice,
        config: projectConfig!,
        text: character.quotes?.[0] || character.description || `Hello, my name is ${character.name}.`,
        style: character.voiceAssignment.style,
        styledegree: character.voiceAssignment.styledegree,
        rate_pct: character.voiceAssignment.rate_pct,
        pitch_pct: character.voiceAssignment.pitch_pct
      }, useCache);
      
      console.log("🔊 Playing voice audition for", character.name);
    } catch (error) {
      console.error("Audition error:", error);
    } finally {
      setAuditioningVoices(prev => {
        const next = new Set(prev);
        next.delete(character.voiceAssignment!.voiceId);
        return next;
      });
    }
  };

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
          <p style={{ color: "var(--muted)" }}>{t("common.loading")}</p>
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

  // Helper functions for inline editing
  const startEditing = (fieldId: string) => {
    setEditingFields(prev => new Set(prev).add(fieldId));
  };

  const stopEditing = (fieldId: string) => {
    setEditingFields(prev => {
      const newSet = new Set(prev);
      newSet.delete(fieldId);
      return newSet;
    });
  };

  const isEditing = (fieldId: string) => editingFields.has(fieldId);

  const handleFieldUpdate = (characterId: string, field: string, value: string) => {
    updateCharacter(characterId, { [field]: value });
    stopEditing(`${characterId}-${field}`);
  };

  const handleKeyPress = (event: React.KeyboardEvent, characterId: string, field: string, value: string) => {
    if (event.key === 'Enter') {
      handleFieldUpdate(characterId, field, value);
    } else if (event.key === 'Escape') {
      stopEditing(`${characterId}-${field}`);
    }
  };

  return (
    <div style={{ padding: "2px", maxWidth: "90%" }}>
      <h2>Characters</h2>
      <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "24px" }}>{t("characters.description")}</p>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px", alignItems: "center" }}>
        <button 
          onClick={runDetection} 
          disabled={loading} 
          style={{ padding: "6px 12px", fontSize: "14px" }}
        >
          {loading ? "Detecting..." : t("characters.detectRefresh")}
        </button>
        
        <button 
          onClick={add} 
          disabled={loading} 
          style={{ padding: "6px 12px", fontSize: "14px" }}
        >
          {t("characters.add")}
        </button>
        
        {(hasCharacterList || characters.length > 0) && (
          <>
            <button 
              onClick={sortByFrequency} 
              disabled={loading || characters.length === 0} 
              style={{ padding: "6px 12px", fontSize: "14px" }}
            >
              {t("characters.sortByFrequency")}
            </button>
            
            <button 
              onClick={assignVoices} 
              disabled={loading || characters.length === 0} 
              style={{ padding: "6px 12px", fontSize: "14px" }}
            >
              {assignmentProgress 
                ? `Assigning... ${assignmentProgress.current}%` 
                : t("characters.assignVoices")}
            </button>
            
            <button 
              onClick={saveCharacters} 
              disabled={saving || loading || !dirty} 
              style={{ padding: "6px 12px", fontSize: "14px" }}
            >
              {saving ? "Saving..." : t("characters.save")}
              {dirty && !saving && " *"}
            </button>
            
            <button 
              onClick={handleMarkComplete}
              disabled={loading || characters.length === 0 || isComplete} 
              style={{ 
                padding: "6px 12px", 
                fontSize: "14px",
                backgroundColor: isComplete ? "var(--success)" : "var(--success)",
                color: "white",
                border: `1px solid var(--success)`,
                borderRadius: "4px",
                opacity: isComplete ? 0.7 : 1
              }}
            >
              {isComplete ? "✓ Completed" : t("characters.markComplete")}
            </button>
          </>
        )}
      </div>

      {assignmentProgress && (
        <div style={{ 
          margin: "10px 0", 
          padding: "8px", 
          backgroundColor: "var(--bg-secondary)", 
          borderRadius: "4px",
          fontSize: "14px"
        }}>
          <div style={{ marginBottom: "4px" }}>
            Assigning voices: {assignmentProgress.current}%
            {assignmentProgress.total && ` (${assignmentProgress.total})`}
          </div>
          <div style={{
            width: "100%",
            height: "8px",
            backgroundColor: "var(--border)",
            borderRadius: "4px",
            overflow: "hidden"
          }}>
            <div style={{
              width: `${assignmentProgress.current}%`,
              height: "100%",
              backgroundColor: "var(--accent)",
              transition: "width 0.3s ease"
            }} />
          </div>
        </div>
      )}

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
            <span style={{ color: "var(--text)" }}>{message || t("common.loading")}</span>
          </div>
          {detectionProgress ? (
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
          ) : (
            <div style={{ marginTop: "12px" }}>
              <div style={{ width: "100%", backgroundColor: "var(--border)", borderRadius: "9999px", height: "8px" }}>
                <div 
                  style={{ 
                    backgroundColor: "var(--accent)", 
                    height: "8px", 
                    borderRadius: "9999px", 
                    animation: "pulse 2s ease-in-out infinite",
                    width: "100%" 
                  }}
                ></div>
              </div>
            </div>
          )}
          <div style={{ fontSize: "12px", color: "var(--accent)", marginTop: "4px" }}>This may take a moment...</div>
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
                    {isEditing(`${c.id}-name`) ? (
                      <input
                        type="text"
                        defaultValue={c.name}
                        autoFocus
                        onBlur={(e) => handleFieldUpdate(c.id, 'name', e.target.value)}
                        onKeyDown={(e) => handleKeyPress(e, c.id, 'name', e.currentTarget.value)}
                        style={{
                          background: "var(--input)",
                          border: "1px solid var(--border)",
                          borderRadius: "4px",
                          padding: "4px 6px",
                          fontSize: "16px",
                          fontWeight: "500",
                          color: "var(--text)",
                          width: "100%"
                        }}
                      />
                    ) : (
                      <span 
                        onClick={() => startEditing(`${c.id}-name`)}
                        style={{ cursor: "pointer", display: "inline-block", minWidth: "100px" }}
                        title="Click to edit"
                      >
                        {c.name || "Unnamed Character"}
                      </span>
                    )}
                  </div>
                  
                  {/* Frequency */}
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>
                    Frequency: {c.frequency}%
                  </div>
                  
                  {/* Basic info */}
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "8px" }}>
                    {c.traits?.gender === 'M' ? 'Male' : c.traits?.gender === 'F' ? 'Female' : 'Neutral'} • {(c.traits?.age || 'Adult').charAt(0).toUpperCase() + (c.traits?.age || 'adult').slice(1)}
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
                  <div style={{ fontSize: "12px", color: "var(--text)", marginBottom: "8px" }}>
                    {isEditing(`${c.id}-description`) ? (
                      <textarea
                        defaultValue={c.description || ""}
                        autoFocus
                        onBlur={(e) => handleFieldUpdate(c.id, 'description', e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            handleFieldUpdate(c.id, 'description', e.currentTarget.value);
                          } else if (e.key === 'Escape') {
                            stopEditing(`${c.id}-description`);
                          }
                        }}
                        style={{
                          background: "var(--input)",
                          border: "1px solid var(--border)",
                          borderRadius: "4px",
                          padding: "4px 6px",
                          fontSize: "12px",
                          color: "var(--text)",
                          width: "100%",
                          minHeight: "60px",
                          resize: "vertical",
                          fontFamily: "inherit"
                        }}
                        placeholder="Add character description..."
                      />
                    ) : (
                      <span 
                        onClick={() => startEditing(`${c.id}-description`)}
                        style={{ 
                          cursor: "pointer", 
                          display: "block", 
                          minHeight: "16px",
                          color: c.description ? "var(--text)" : "var(--muted)",
                          fontStyle: c.description ? "normal" : "italic"
                        }}
                        title="Click to edit"
                      >
                        {c.description || "Click to add description..."}
                      </span>
                    )}
                  </div>

                  {/* Personality */}
                  {c.traits?.personality && c.traits.personality.length > 0 && (
                    <div style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "4px" }}>
                      Personality: {Array.isArray(c.traits.personality) ? c.traits.personality.join(', ') : c.traits.personality}
                    </div>
                  )}

                  {/* Speaking Style */}
                  {c.traits?.speaking_style && c.traits.speaking_style.length > 0 && (
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
                          {/* Debug: Show assigned voice if not in available list */}
                          {c.voiceAssignment?.voiceId && !availableVoices.find(v => v.id === c.voiceAssignment?.voiceId) && (
                            <option key={c.voiceAssignment.voiceId} value={c.voiceAssignment.voiceId} style={{color: 'red'}}>
                              {c.voiceAssignment.voiceId} (Missing from inventory)
                            </option>
                          )}
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
                            <option value="">{t("characters.defaultStyle")}</option>
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
                          <label style={{ color: "var(--muted)" }}>{t("characters.rate")}: {c.voiceAssignment.rate_pct || 0}%</label>
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
                          <label style={{ color: "var(--muted)" }}>{t("characters.pitch")}: {c.voiceAssignment.pitch_pct || 0}%</label>
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
                          <label style={{ color: "var(--muted)" }}>{t("characters.intensity")}: {Math.round((c.voiceAssignment.styledegree || 0.6) * 100)}%</label>
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
                        {t("characters.method")}: {c.voiceAssignment.method === "llm_auto" ? t("characters.methodAutoAssigned") : t("characters.methodManual")}
                      </div>
                    </div>
                  )}
                  
                  {/* Action buttons */}
                  <div style={{ marginTop: "8px", display: "flex", gap: "8px" }}>
                    {/* Audition button - only show if voice is assigned */}
                    {c.voiceAssignment && (
                      <button
                        onClick={() => handleAudition(c.id)}
                        disabled={auditioningVoices.has(c.voiceAssignment.voiceId)}
                        style={{
                          padding: "4px 8px",
                          fontSize: "12px",
                          backgroundColor: auditioningVoices.has(c.voiceAssignment.voiceId) ? "#6b7280" : "#3b82f6",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: auditioningVoices.has(c.voiceAssignment.voiceId) ? "not-allowed" : "pointer",
                          opacity: auditioningVoices.has(c.voiceAssignment.voiceId) ? 0.6 : 1
                        }}
                      >
                        {auditioningVoices.has(c.voiceAssignment.voiceId) ? t("common.playing") : t("common.audition")}
                      </button>
                    )}
                    
                    {/* Remove button */}
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
                      {t("characters.remove")}
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
