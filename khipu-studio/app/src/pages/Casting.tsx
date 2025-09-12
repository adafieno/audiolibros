import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { loadProjectConfig } from "../lib/config";
import { loadVoiceInventory, saveVoiceInventory } from "../lib/voice";
import { 
  getAvailableLanguages,
  getLanguageFromLocale
} from "../lib/voice-enhanced";
import { useAudioCache } from "../hooks/useAudioCache";
import type { Voice, VoiceInventory } from "../types/voice";
import type { ProjectConfig } from "../types/config";

export default function CastingPage() {
  const { t } = useTranslation();
  const { root, isStepCompleted } = useProject();
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [inventory, setInventory] = useState<VoiceInventory | null>(null);
  const [selectedVoices, setSelectedVoices] = useState<Set<string>>(new Set());
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
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
        
        // Initialize selected languages with primary language
        if (projectConfig?.language) {
          const primaryLang = getLanguageFromLocale(projectConfig.language);
          setSelectedLanguages([primaryLang]);
        }
        
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

  // Get the project's TTS engine
  const projectEngine = config.tts.engine.name;

  // Filter voices to show all voices from selected languages
  const availableVoices = inventory.voices.filter(voice => {
    if (voice.engine !== projectEngine) return false;
    const voiceLanguage = getLanguageFromLocale(voice.locale);
    return selectedLanguages.includes(voiceLanguage);
  });

  // Get available languages for the language selector (from all voices with this engine)
  const availableLanguageOptions = getAvailableLanguages(inventory.voices.filter(v => v.engine === projectEngine));

  // Create language name mapping
  const getLanguageName = (langCode: string): string => {
    return t(`languages.${langCode}`, { defaultValue: langCode.toUpperCase() });
  };

  return (
    <div style={{ padding: "2px", maxWidth: "90%" }}>
      <h2>{t("casting.title")}</h2>
      <p>{t("casting.description")}</p>

      {/* Voice Selection */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3>{t("casting.voicesTitle")} ({availableVoices.length})</h3>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {/* Language Selector */}
            <select
              value=""
              onChange={(e) => {
                if (e.target.value && !selectedLanguages.includes(e.target.value)) {
                  setSelectedLanguages([...selectedLanguages, e.target.value]);
                }
                e.target.value = ""; // Reset dropdown
              }}
              style={{
                padding: "6px 12px",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                backgroundColor: "var(--input)",
                color: "var(--text)",
                fontSize: "14px"
              }}
            >
              <option value="">{t("casting.addLanguage")}</option>
              {availableLanguageOptions
                .filter(lang => !selectedLanguages.includes(lang))
                .map(lang => (
                  <option key={lang} value={lang}>
                    {getLanguageName(lang)}
                  </option>
                ))}
            </select>
            
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

        {/* Language Filter Tags */}
        {selectedLanguages.length > 0 && (
          <div style={{ marginBottom: "16px", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "14px", color: "var(--muted)" }}>{t("casting.languagesLabel")}</span>
            {selectedLanguages.map(lang => (
              <span
                key={lang}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 8px",
                  backgroundColor: "var(--accent)",
                  color: "var(--accent-text)",
                  borderRadius: "4px",
                  fontSize: "12px"
                }}
              >
                {getLanguageName(lang)}
                {selectedLanguages.length > 1 && (
                  <button
                    onClick={() => setSelectedLanguages(selectedLanguages.filter(l => l !== lang))}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--accent-text)",
                      cursor: "pointer",
                      fontSize: "14px",
                      padding: "0"
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

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
