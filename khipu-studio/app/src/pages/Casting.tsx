import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { loadProjectConfig } from "../lib/config";
import { loadVoiceInventory, saveVoiceInventory, filterVoicesForProject } from "../lib/voice";
import type { Voice, VoiceInventory } from "../types/voice";
import type { ProjectConfig } from "../types/config";

export default function CastingPage() {
  const { t } = useTranslation();
  const { root } = useProject();
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [inventory, setInventory] = useState<VoiceInventory | null>(null);
  const [selectedVoices, setSelectedVoices] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

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
        
      } catch (error) {
        console.error("Failed to load casting data:", error);
        setMessage(t("casting.loadError"));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [root, t]);

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
      
      // Filter inventory to only include selected voices
      const filteredInventory: VoiceInventory = {
        voices: inventory.voices.filter(voice => selectedVoices.has(voice.id))
      };
      
      await saveVoiceInventory(root, filteredInventory);
      setMessage(t("casting.saved"));
      
      setTimeout(() => setMessage(""), 2000);
    } catch (error) {
      console.error("Failed to save voice selection:", error);
      setMessage(t("casting.saveError"));
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
    <div style={{ padding: "16px", maxWidth: "1200px" }}>
      <h1>{t("casting.title")}</h1>
      <p>{t("casting.description")}</p>

      {/* Current Engine Display */}
      <section style={{ marginBottom: "24px" }}>
        <h2>{t("casting.currentEngine")}</h2>
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
          <h2>{t("casting.voicesTitle")} ({availableVoices.length})</h2>
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
                  </div>
                </label>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Save Section */}
      <section style={{ 
        borderTop: "1px solid #374151", 
        paddingTop: "16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <div style={{ fontSize: "14px", color: "#6b7280" }}>
          {t("casting.selectedCount", { count: selectedVoices.size })}
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {message && (
            <span style={{ 
              fontSize: "14px", 
              color: message.includes("Error") || message.includes("Error") ? "#ef4444" : "#10b981" 
            }}>
              {message}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={selectedVoices.size === 0}
            style={{
              padding: "8px 16px",
              backgroundColor: selectedVoices.size > 0 ? "#10b981" : "#6b7280",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: selectedVoices.size > 0 ? "pointer" : "not-allowed"
            }}
          >
            {t("casting.save")}
          </button>
        </div>
      </section>
    </div>
  );
}
