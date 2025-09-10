import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { loadProjectConfig } from "../lib/config";
import { loadVoiceInventory, saveVoiceInventory, filterVoicesForProject } from "../lib/voice";
import { useAudioCache } from "../hooks/useAudioCache";
import type { Voice, VoiceInventory } from "../types/voice";
import type { ProjectConfig } from "../types/config";

export default function CastingPage() {
  const { t } = useTranslation();
  const { root, isStepCompleted } = useProject();
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [inventory, setInventory] = useState<VoiceInventory | null>(null);
  const [selectedVoices, setSelectedVoices] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [auditioningVoices, setAuditioningVoices] = useState<Set<string>>(new Set());
  
  // Use the new audio cache hook
  const { error: audioError, playAudition, stopAudio, clearError } = useAudioCache();

  const isCastingCompleted = isStepCompleted("casting");

  useEffect(() => {
    if (!root) return;
    
    (async () => {
      try {
        setIsLoading(true);
        const [projectConfig, voiceInventory] = await Promise.all([
          loadProjectConfig(root),
          loadVoiceInventory(root)
        ]);
        
        setConfig(projectConfig);
        setInventory(voiceInventory);
        
        // Load previously selected voices
        if (voiceInventory?.selectedVoiceIds) {
          setSelectedVoices(new Set(voiceInventory.selectedVoiceIds));
        }
        
      } catch (error) {
        console.error("Failed to load casting data:", error);
        setMessage(t("casting.loadError"));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [root, t]);

  // Handle audio errors
  useEffect(() => {
    if (audioError) {
      setMessage(audioError);
      setTimeout(() => {
        setMessage("");
        clearError();
      }, 3000);
    }
  }, [audioError, clearError]);

  // Cleanup audio when component unmounts
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  const handleAudition = async (voice: Voice) => {
    if (!config) return;

    // If already auditioning this voice, stop
    if (auditioningVoices.has(voice.id)) {
      return;
    }

    setAuditioningVoices(prev => new Set(prev).add(voice.id));
    
    try {
      // Use caching unless explicitly disabled in config
      const useCache = config.tts?.cache !== false; 
      console.log(`🎤 Starting audition for: ${voice.id}`, { voice, config: !!config, useCache });
      
      // Add timeout to prevent hanging forever
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Audition timeout after 30 seconds')), 30000);
      });
      
      await Promise.race([
        playAudition({
          voice,
          config,
          text: undefined, // Will use locale-appropriate default audition text
        }, useCache),
        timeoutPromise
      ]);
      
      console.log(`🔊 Playing voice audition for: ${voice.id}`);
    } catch (error) {
      console.error("❌ Audition error for", voice.id, ":", error);
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      setMessage(`Audition failed: ${errorMsg}`);
      setTimeout(() => setMessage(""), 5000);
    } finally {
      setAuditioningVoices(prev => {
        const newSet = new Set(prev);
        newSet.delete(voice.id);
        return newSet;
      });
    }
  };

  const handleVoiceToggle = (voiceId: string) => {
    const newSelected = new Set(selectedVoices);
    if (newSelected.has(voiceId)) {
      newSelected.delete(voiceId);
    } else {
      newSelected.add(voiceId);
    }
    setSelectedVoices(newSelected);
  };

  const handleSelectAll = (voices: Voice[]) => {
    const newSelected = new Set(selectedVoices);
    voices.forEach(voice => newSelected.add(voice.id));
    setSelectedVoices(newSelected);
  };

  const handleDeselectAll = (voices: Voice[]) => {
    const newSelected = new Set(selectedVoices);
    voices.forEach(voice => newSelected.delete(voice.id));
    setSelectedVoices(newSelected);
  };

  const handleSave = async () => {
    if (!root || !inventory) return;
    
    try {
      setMessage(t("casting.saving"));
      
      // Update inventory with current selection
      const updatedInventory: VoiceInventory = {
        voices: inventory.voices, // Keep all available voices
        selectedVoiceIds: Array.from(selectedVoices) // Save current selection
      };
      
      await saveVoiceInventory(root, updatedInventory);
      setMessage(t("casting.saved"));
      
      setTimeout(() => setMessage(""), 2000);
    } catch (error) {
      console.error("Failed to save voice selection:", error);
      setMessage(t("casting.saveError"));
    }
  };

  const handleComplete = async () => {
    if (!root || !inventory) return;
    
    try {
      // Save first if there are unsaved changes
      await handleSave();
      
      // Mark casting step as completed to enable Characters workflow step
      const { markStepCompleted } = useProject.getState();
      markStepCompleted("casting");
      
      setMessage(t("casting.completed"));
      setTimeout(() => setMessage(""), 2000);
    } catch (error) {
      console.error("Failed to complete casting:", error);
      setMessage(t("casting.completeError"));
    }
  };

  if (isLoading) {
    return <div>{t("casting.loading")}</div>;
  }

  if (!config || !inventory) {
    return <div>{t("casting.loadError")}</div>;
  }

  // Get the project's TTS engine and locale
  const projectEngine = config.tts.engine.name;
  const projectLocale = config.language;

  // Filter voices to only show those compatible with project settings
  const availableVoices = filterVoicesForProject(inventory.voices, projectEngine, projectLocale);

  return (
    <div style={{ padding: "2px", maxWidth: "90%" }}>
      <h2>{t("casting.title")}</h2>
      <p>{t("casting.description")}</p>
      {/* Current Engine Display */}
      <section style={{ marginBottom: "24px" }}>
        <h3>{t("casting.currentEngine")}</h3>
          <p>{t("casting.engineDescription")}</p>
        
        <div style={{ 
          padding: "12px 16px",
          borderRadius: "6px",
          border: "2px solid #3b82f6",
          backgroundColor: "#1e40af",
          color: "white",
          display: "inline-block",
          fontWeight: "500"
        }}>
          {t(`casting.engine.${projectEngine}`)} - {availableVoices.length} {t("casting.voicesAvailable")}
        </div>
      </section>

      {/* Voice Selection */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3>{t("casting.voicesTitle")} ({availableVoices.length})</h3>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => handleSelectAll(availableVoices)}
              style={{ padding: "6px 12px", fontSize: "14px" }}
            >
              {t("casting.selectAll")}
            </button>
            <button
              onClick={() => handleDeselectAll(availableVoices)}
              style={{ padding: "6px 12px", fontSize: "14px" }}
            >
              {t("casting.deselectAll")}
            </button>
            <button
              onClick={handleSave}
              disabled={selectedVoices.size === 0}
              style={{ padding: "6px 12px", fontSize: "14px" }}
            >
              {t("casting.save")}
            </button>
            <button
              onClick={handleComplete}
              disabled={selectedVoices.size === 0 || isCastingCompleted}
              style={{ padding: "6px 12px", fontSize: "14px" }}
            >
              {isCastingCompleted ? t("workflow.buttonCompleted") : "✓ " + t("casting.complete")}
            </button>
          </div>
        </div>

        {availableVoices.length === 0 ? (
          <p style={{ color: "#6b7280", fontStyle: "italic" }}>
            {t("casting.noVoicesForEngine")}
          </p>
        ) : (
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", 
            gap: "12px",
            marginBottom: "24px"
          }}>
            {availableVoices.map((voice: Voice) => (
              <div
                key={voice.id}
                style={{
                  border: "1px solid #374151",
                  borderRadius: "8px",
                  padding: "12px",
                  backgroundColor: selectedVoices.has(voice.id) ? "#1e40af20" : "transparent"
                }}
              >
                <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selectedVoices.has(voice.id)}
                    onChange={() => handleVoiceToggle(voice.id)}
                    style={{ marginTop: "2px" }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "500", marginBottom: "4px" }}>
                      {voice.id}
                    </div>
                    <div style={{ fontSize: "12px", color: "#9ca3af", marginBottom: "4px" }}>
                      {voice.locale} • {voice.gender === "M" ? t("casting.male") : voice.gender === "F" ? t("casting.female") : t("casting.neutral")} • {t(`casting.age.${voice.age_hint}`)}
                    </div>
                    {voice.description && (
                      <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>
                        {voice.description}
                      </div>
                    )}
                    {voice.styles.length > 0 && (
                      <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                        {t("casting.styles")}: {voice.styles.join(", ")}
                      </div>
                    )}
                    {voice.accent_tags.length > 0 && (
                      <div style={{ fontSize: "11px", color: "#9ca3af" }}>
                        {t("casting.accents")}: {voice.accent_tags.join(", ")}
                      </div>
                    )}
                    
                    {/* Audition Button */}
                    <div style={{ marginTop: "8px", display: "flex", gap: "8px", alignItems: "center" }}>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAudition(voice);
                        }}
                        disabled={auditioningVoices.has(voice.id)}
                        style={{
                          padding: "4px 8px",
                          fontSize: "12px",
                          backgroundColor: auditioningVoices.has(voice.id) ? "#6b7280" : "#3b82f6",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: auditioningVoices.has(voice.id) ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                      >
                        {auditioningVoices.has(voice.id) ? (
                          <>
                            <span style={{ 
                              display: "inline-block", 
                              width: "12px", 
                              height: "12px", 
                              border: "2px solid #ffffff", 
                              borderTop: "2px solid transparent", 
                              borderRadius: "50%", 
                              animation: "spin 1s linear infinite" 
                            }}></span>
                            {t("casting.audition.loading")}
                          </>
                        ) : (
                          <>🎵 {t("casting.audition.button")}</>
                        )}
                      </button>
                    </div>
                  </div>
                </label>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Status Section */}
      <section style={{ 
        borderTop: "1px solid #374151", 
        paddingTop: "16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
          <div style={{ fontSize: "14px", color: "#6b7280" }}>
            {selectedVoices.size} {selectedVoices.size === 1 ? "voice" : "voices"} selected
          </div>
          {isCastingCompleted && (
            <div style={{ fontSize: "12px", color: "#10b981", display: "flex", alignItems: "center", gap: "4px" }}>
              ✓ {t("workflow.buttonCompleted")}
            </div>
          )}
        </div>
        {message && (
          <span style={{ 
            fontSize: "14px", 
            color: message.includes("Error") || message.includes("Error") ? "#ef4444" : "#10b981" 
          }}>
            {message}
          </span>
        )}
      </section>
    </div>
  );
}
