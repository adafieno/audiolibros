import { useProject } from "../store/project";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useMemo, useCallback } from "react";
import type { ProjectConfig, ProductionSettings } from "../types/config";
import PageHeader from "../components/PageHeader";
import { WorkflowCompleteButton } from "../components/WorkflowCompleteButton";

interface PlatformConfig {
  id: string;
  name: string;
  enabled: boolean;
  requirements: string[];
  packageFormat: string;
  audioSpec: {
    format: string;
    bitrate?: string;
    sampleRate: number;
    channels: number;
  };
}

export default function PackagingPage({ onStatus }: { onStatus?: (s: string) => void }) {
  const { t } = useTranslation();
  const { root, markStepCompleted, isStepCompleted } = useProject();
  
  const [cfg, setCfg] = useState<ProjectConfig | null>(null);
  const [productionSettings, setProductionSettings] = useState<ProductionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [chaptersInfo, setChaptersInfo] = useState<{ count: number; hasAudio: number; missingIds?: string[] }>({ count: 0, hasAudio: 0 });

  // Load project data
  // Helper to (re)query chapters audio info from main
  const refreshChaptersInfo = useCallback(async () => {
    if (!root) return;
    try {
      const info = await window.khipu!.call("audio:chaptersInfo", { projectRoot: root });
      if (info && typeof info.count === 'number') {
        setChaptersInfo({ count: info.count, hasAudio: info.hasAudio, missingIds: Array.isArray(info.missingIds) ? info.missingIds : undefined });
      }
    } catch {
      // ignore
    }
  }, [root]);

  useEffect(() => {
    if (!root) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);

        // Load project configuration
        const projectConfig = await window.khipu!.call("fs:read", {
          projectRoot: root,
          relPath: "project.khipu.json",
          json: true
        }) as ProjectConfig;
        setCfg(projectConfig);

        // Load production settings
        const prodSettings = await window.khipu!.call("fs:read", {
          projectRoot: root,
          relPath: "production.settings.json",
          json: true
        }) as ProductionSettings;
        setProductionSettings(prodSettings);

        // Check for chapters and audio files
        try {
          const chapterList = await window.khipu!.call("chapters:list", {
            projectRoot: root
          });

          if (Array.isArray(chapterList)) {
            const chapterCount = chapterList.length;
            
              // Query main process for chapter audio info (counts)
              try {
                await refreshChaptersInfo();
                setLoading(false);
                return;
              } catch (e) {
                console.warn('Failed to get audio chapter info:', e);
              }

            // If refresh failed, fall back to chapter list count
            setChaptersInfo({
              count: chapterCount,
              hasAudio: 0
            });
          } else {
            setChaptersInfo({ count: 0, hasAudio: 0 });
          }
        } catch (error) {
          console.warn("Could not load chapter info:", error);
          setChaptersInfo({ count: 0, hasAudio: 0 });
        }

      } catch (error) {
        console.error("Failed to load packaging data:", error);
        onStatus?.("Error loading project data");
      } finally {
        setLoading(false);
      }
    };

    loadData();

    // subscribe to audio chapter updates so UI refreshes automatically
    const onUpdated = async () => { await refreshChaptersInfo(); };
    window.khipu?.onAudioChaptersUpdated?.(onUpdated);

    // cleanup is optional (preload just forwards ipcRenderer.on). We won't remove listener here.
  }, [root, onStatus, refreshChaptersInfo]);

  // When chapters reach full audio coverage, mark export workflow as complete (persist to project.khipu.json)
  useEffect(() => {
    if (!root) return;
    if (chaptersInfo.count > 0 && chaptersInfo.hasAudio === chaptersInfo.count) {
      try {
        if (!isStepCompleted('export')) {
          markStepCompleted('export');
          onStatus?.(t('packaging.status.exportMarked') || 'Packaging: export marked ready');
        }
      } catch (e) {
        console.warn('Failed to mark export complete:', e);
      }
    }
  }, [chaptersInfo, root, markStepCompleted, isStepCompleted, onStatus, t]);

  // Define platform configurations
  const platforms: PlatformConfig[] = useMemo(() => [
    {
      id: "apple",
      name: "Apple Books",
      enabled: cfg?.export?.platforms?.apple || false,
      requirements: ["title", "author", "narrator", "cover", "audio", "chapters"],
      packageFormat: "M4B",
      audioSpec: {
        format: "AAC",
        bitrate: productionSettings?.packaging?.apple?.aac_bitrate || "128k",
        sampleRate: 44100,
        channels: 1
      }
    },
    {
      id: "google",
      name: "Google Play Books",
      enabled: cfg?.export?.platforms?.google || false,
      requirements: ["title", "author", "narrator", "cover", "audio", "chapters"],
      packageFormat: "ZIP with MP3",
      audioSpec: {
        format: "MP3",
        bitrate: productionSettings?.packaging?.gplay_spotify?.mp3_bitrate || "256k",
        sampleRate: productionSettings?.packaging?.gplay_spotify?.sr_hz || 44100,
        channels: productionSettings?.packaging?.gplay_spotify?.channels || 1
      }
    },
    {
      id: "spotify",
      name: "Spotify",
      enabled: cfg?.export?.platforms?.spotify || false,
      requirements: ["title", "author", "narrator", "cover", "audio", "chapters"],
      packageFormat: "ZIP with MP3",
      audioSpec: {
        format: "MP3",
        bitrate: productionSettings?.packaging?.gplay_spotify?.mp3_bitrate || "256k",
        sampleRate: productionSettings?.packaging?.gplay_spotify?.sr_hz || 44100,
        channels: productionSettings?.packaging?.gplay_spotify?.channels || 1
      }
    },
    {
      id: "acx",
      name: "ACX",
      enabled: cfg?.export?.platforms?.acx || false,
      requirements: ["title", "author", "narrator", "cover", "audio", "chapters"],
      packageFormat: "ZIP with MP3",
      audioSpec: {
        format: "MP3",
        bitrate: productionSettings?.packaging?.acx?.mp3_bitrate || "192k",
        sampleRate: productionSettings?.packaging?.acx?.sr_hz || 44100,
        channels: productionSettings?.packaging?.acx?.channels || 1
      }
    },
    {
      id: "kobo",
      name: "Kobo",
      enabled: cfg?.export?.platforms?.kobo || false,
      requirements: ["title", "author", "narrator", "cover", "audio", "chapters"],
      packageFormat: "EPUB",
      audioSpec: {
        format: "MP3",
        bitrate: productionSettings?.packaging?.kobo?.mp3_bitrate || "192k",
        sampleRate: productionSettings?.packaging?.kobo?.sr_hz || 44100,
        channels: productionSettings?.packaging?.kobo?.channels || 1
      }
    }
  ], [cfg, productionSettings]);

  if (!root) {
    return (
      <div style={{ padding: "16px", maxWidth: "1200px" }}>
        <div style={{ 
          textAlign: "center", 
          padding: "64px 0", 
          backgroundColor: "var(--panel)", 
          borderRadius: "8px", 
          border: "1px dashed var(--border)" 
        }}>
          <p style={{ color: "var(--text)", fontSize: "18px", marginBottom: "8px" }}>
            {t("status.noProjectLoaded")}
          </p>
          <p style={{ color: "var(--muted)", fontSize: "14px" }}>
            {t("packaging.description")}
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: "16px", maxWidth: "1200px" }}>
        <div style={{ textAlign: "center", padding: "64px 0" }}>
          {t("common.loading")}
        </div>
      </div>
    );
  }

  const selectedPlatforms = platforms.filter(platform => platform.enabled);

  return (
    <div>
      {/* Top Bar */}
      <PageHeader 
        title={t("packaging.title")}
        description={t("packaging.description")}
        actions={
          <WorkflowCompleteButton 
            step="export"
            disabled={selectedPlatforms.length === 0}
          >
            {t("packaging.markComplete")}
          </WorkflowCompleteButton>
        }
      />

      {/* Overview Section */}
      <section style={{ marginBottom: "32px" }}>
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", 
          gap: "16px" 
        }}>
          {selectedPlatforms.map(({ id, name, packageFormat, requirements }) => (
            <div key={id} style={{
              padding: "20px",
              backgroundColor: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: "8px"
            }}>
              <h3 style={{ 
                fontSize: "16px", 
                fontWeight: "600", 
                color: "var(--text)", 
                marginBottom: "8px" 
              }}>
                {name}
              </h3>
              <p style={{ fontSize: "14px", color: "var(--muted)" }}>
                Format: {packageFormat}
              </p>
              <ul style={{ fontSize: "14px", color: "var(--muted)" }}>
                {requirements.map((req, index) => (
                  <li key={index}>{t(`packaging.requirements.${req}`)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}