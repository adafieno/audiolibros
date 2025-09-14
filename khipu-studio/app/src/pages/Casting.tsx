import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { WorkflowCompleteButton } from "../components/WorkflowCompleteButton";
import { PageHeader } from "../components/PageHeader";
import { StandardButton } from "../components/StandardButton";
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
  const { root } = useProject();
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [inventory, setInventory] = useState<VoiceInventory | null>(null);
  const [selectedVoices, setSelectedVoices] = useState<Set<string>>(new Set());
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [selectedLocales, setSelectedLocales] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [auditioningVoices, setAuditioningVoices] = useState<Set<string>>(new Set());
  
  // Use the new audio cache hook
  const { error: audioError, playAudition, stopAudio, clearError } = useAudioCache();

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
          page: 'casting'
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

  // Auto-save voice selection when selectedVoices changes (debounced)
  useEffect(() => {
    if (!root || !inventory || selectedVoices.size === 0) return;
    
    const timeoutId = setTimeout(async () => {
      try {
        console.log('💾 Auto-saving voice selection:', Array.from(selectedVoices));
        
        // Update inventory with current selection
        const updatedInventory: VoiceInventory = {
          voices: inventory.voices, // Keep all available voices
          selectedVoiceIds: Array.from(selectedVoices) // Save current selection
        };
        
        await saveVoiceInventory(root, updatedInventory);
        console.log('💾 Auto-saved voice selection');
        
      } catch (error) {
        console.warn('Auto-save failed:', error);
        // Don't show error to user for auto-save failures, just log them
      }
    }, 1500); // Debounce: save 1.5 seconds after last change

    return () => clearTimeout(timeoutId);
  }, [selectedVoices, root, inventory]);

  if (isLoading) {
    return <div>{t("casting.loading")}</div>;
  }

  if (!config || !inventory) {
    return <div>{t("casting.loadError")}</div>;
  }

  // Get the project's TTS engine
  const projectEngine = config.tts.engine.name;

  // Filter voices to show all voices from selected languages, genders, and locales
  const availableVoices = inventory.voices.filter(voice => {
    if (voice.engine !== projectEngine) return false;
    
    // Language filter
    const voiceLanguage = getLanguageFromLocale(voice.locale);
    if (!selectedLanguages.includes(voiceLanguage)) return false;
    
    // Gender filter
    if (selectedGenders.length > 0 && !selectedGenders.includes(voice.gender)) return false;
    
    // Locale filter
    if (selectedLocales.length > 0 && !selectedLocales.includes(voice.locale)) return false;
    
    return true;
  });

  // Get available languages for the language selector (from all voices with this engine)
  const availableLanguageOptions = getAvailableLanguages(inventory.voices.filter(v => v.engine === projectEngine));
  
  // Get available genders and locales for filters
  const availableGenders = [...new Set(inventory.voices.filter(v => v.engine === projectEngine).map(v => v.gender))];
  
  // Filter available locales to only include locales from currently selected languages
  const availableLocales = [...new Set(
    inventory.voices
      .filter(v => v.engine === projectEngine)
      .filter(v => selectedLanguages.length === 0 || selectedLanguages.includes(getLanguageFromLocale(v.locale)))
      .map(v => v.locale)
  )].sort();

  // Create language name mapping
  const getLanguageName = (langCode: string): string => {
    return t(`languages.${langCode}`, { defaultValue: langCode.toUpperCase() });
  };

  return (
    <div style={{ padding: "0", maxWidth: "100%" }}>
      <PageHeader 
        title="casting.title"
        description="casting.description"
        actions={
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
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
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                backgroundColor: "var(--panel)",
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

            {/* Gender Filter */}
            <select
              value=""
              onChange={(e) => {
                if (e.target.value && !selectedGenders.includes(e.target.value)) {
                  setSelectedGenders([...selectedGenders, e.target.value]);
                }
                e.target.value = ""; // Reset dropdown
              }}
              style={{
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                backgroundColor: "var(--panel)",
                color: "var(--text)",
                fontSize: "14px"
              }}
            >
              <option value="">{t("casting.addGender")}</option>
              {availableGenders
                .filter(gender => !selectedGenders.includes(gender))
                .map(gender => (
                  <option key={gender} value={gender}>
                    {gender === "M" ? t("casting.male") : gender === "F" ? t("casting.female") : t("casting.neutral")}
                  </option>
                ))}
            </select>

            {/* Locale Filter */}
            <select
              value=""
              onChange={(e) => {
                if (e.target.value && !selectedLocales.includes(e.target.value)) {
                  setSelectedLocales([...selectedLocales, e.target.value]);
                }
                e.target.value = ""; // Reset dropdown
              }}
              style={{
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                backgroundColor: "var(--panel)",
                color: "var(--text)",
                fontSize: "14px"
              }}
            >
              <option value="">{t("casting.addLocale")}</option>
              {availableLocales
                .filter(locale => !selectedLocales.includes(locale))
                .map(locale => (
                  <option key={locale} value={locale}>
                    {locale}
                  </option>
                ))}
            </select>
            
            <StandardButton onClick={() => handleSelectAll(availableVoices)}>
              {t("casting.selectAll")}
            </StandardButton>
            <StandardButton onClick={() => handleDeselectAll(availableVoices)}>
              {t("casting.deselectAll")}
            </StandardButton>
            
            <WorkflowCompleteButton 
              step="casting"
              disabled={selectedVoices.size === 0}
            >
              {t("casting.complete")}
            </WorkflowCompleteButton>
          </div>
        }
      />

      {/* Voice Selection */}
      <section className="mt-6">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <h3 style={{ fontSize: '1.1rem' }}>{t("casting.voicesTitle")} ({availableVoices.length})</h3>
            
            {/* Filter Tags */}
            {(selectedLanguages.length > 0 || selectedGenders.length > 0 || selectedLocales.length > 0) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
                {selectedLanguages.map(lang => (
                  <span
                    key={`lang-${lang}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "1px 4px",
                      backgroundColor: "var(--accent)",
                      color: "var(--accent-text)",
                      borderRadius: "4px",
                      fontSize: "12px"
                    }}
                  >
                    {getLanguageName(lang)}
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
                  </span>
                ))}
                
                {selectedGenders.map(gender => (
                  <span
                    key={`gender-${gender}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "1px 4px",
                      backgroundColor: "var(--accent)",
                      color: "var(--accent-text)",
                      borderRadius: "4px",
                      fontSize: "12px"
                    }}
                  >
                    {gender === "M" ? t("casting.male") : gender === "F" ? t("casting.female") : t("casting.neutral")}
                    <button
                      onClick={() => setSelectedGenders(selectedGenders.filter(g => g !== gender))}
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
                  </span>
                ))}
                
                {selectedLocales.map(locale => (
                  <span
                    key={`locale-${locale}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "1px 4px",
                      backgroundColor: "var(--accent)",
                      color: "var(--accent-text)",
                      borderRadius: "4px",
                      fontSize: "12px"
                    }}
                  >
                    {locale}
                    <button
                      onClick={() => setSelectedLocales(selectedLocales.filter(l => l !== locale))}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent-text)",
                        cursor: "pointer",
                        fontSize: "14px",
                        padding: "0"
                      }}
                    >
                      a
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {availableVoices.length === 0 ? (
          <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
            {t("casting.noVoicesForEngine")}
          </p>
        ) : (
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", 
            gap: "16px",
            marginBottom: "24px"
          }}>
            {availableVoices.map((voice: Voice) => (
              <div
                key={voice.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "16px",
                  backgroundColor: selectedVoices.has(voice.id) ? "var(--panelAccent)" : "var(--panel)"
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
                    <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                      {voice.locale} • {voice.gender === "M" ? t("casting.male") : voice.gender === "F" ? t("casting.female") : t("casting.neutral")} • {t(`casting.age.${voice.age_hint}`)}
                    </div>
                    {voice.description && (
                      <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "4px" }}>
                        {voice.description}
                      </div>
                    )}
                    {voice.styles.length > 0 && (
                      <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                        {t("casting.styles")}: {voice.styles.join(", ")}
                      </div>
                    )}
                    {voice.accent_tags.length > 0 && (
                      <div style={{ fontSize: "11px", color: "var(--muted)" }}>
                        {t("casting.accents")}: {voice.accent_tags.join(", ")}
                      </div>
                    )}
                    
                    {/* Audition Button */}
                    <div style={{ marginTop: "12px", display: "flex", gap: "8px", alignItems: "center" }}>
                      <StandardButton
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAudition(voice);
                        }}
                        disabled={auditioningVoices.has(voice.id)}
                        size="compact"
                      >
                        {auditioningVoices.has(voice.id) ? (
                          <>
                            <span style={{ 
                              display: "inline-block", 
                              width: "12px", 
                              height: "12px", 
                              border: "2px solid currentColor", 
                              borderTop: "2px solid transparent", 
                              borderRadius: "50%", 
                              animation: "spin 1s linear infinite" 
                            }}></span>
                            {t("casting.audition.loading")}
                          </>
                        ) : (
                          <>🎵 {t("casting.audition.button")}</>
                        )}
                      </StandardButton>
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
        borderTop: "1px solid var(--border)", 
        paddingTop: "16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        {message && (
          <span style={{ 
            fontSize: "14px", 
            color: message.includes("Error") || message.includes("failed") ? "var(--error)" : "var(--success)" 
          }}>
            {message}
          </span>
        )}
      </section>
    </div>
  );
}
