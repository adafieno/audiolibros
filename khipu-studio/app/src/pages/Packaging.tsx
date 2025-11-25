import { useProject } from "../store/project";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useMemo, useCallback } from "react";
import type { ProjectConfig, ProductionSettings } from "../types/config";
import PageHeader from "../components/PageHeader";
import { WorkflowCompleteButton } from "../components/WorkflowCompleteButton";
import { useBookMeta } from "../hooks/useBookMeta";

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
  const [chaptersInfo, setChaptersInfo] = useState<{ 
    count: number; 
    hasAudio: number; 
    missingIds?: string[];
    presentIds?: string[];
  }>({ count: 0, hasAudio: 0 });

  const [preparing, setPreparing] = useState<Record<string, boolean>>({});
  const [jobProgress, setJobProgress] = useState<Record<string, { running: boolean; step?: string; pct?: number }>>({});
  const [manifestExists, setManifestExists] = useState<boolean>(false);
  const [generatingManifest, setGeneratingManifest] = useState<boolean>(false);

  const preparePlatform = async (platformId: string) => {
    if (!root) return;
    setPreparing(prev => ({ ...prev, [platformId]: true }));
    // initialize job progress for UI
    setJobProgress(prev => ({ ...prev, [platformId]: { running: true, step: t('packaging.status.preparing'), pct: 0 } }));
    try {
      onStatus?.(t('packaging.status.preparing') || `Preparing package for ${platformId}`);
      const res = await window.khipu!.call('packaging:create', { projectRoot: root, platformId });
      if (res?.success) {
        const message = res.message || t('packaging.status.prepared') || `Package prepared for ${platformId}`;
        onStatus?.(message);
        setJobProgress(prev => ({ ...prev, [platformId]: { running: false, step: message, pct: 100 } }));
      } else {
        onStatus?.(t('packaging.status.prepareFailed') || `Failed to prepare package for ${platformId}`);
        console.warn('packaging:create returned failure', res);
        setJobProgress(prev => ({ ...prev, [platformId]: { running: false, step: t('packaging.status.prepareFailed'), pct: 0 } }));
      }
    } catch (error) {
      console.error('Failed to prepare package:', error);
      onStatus?.(t('packaging.status.prepareFailed') || `Failed to prepare package for ${platformId}`);
      setJobProgress(prev => ({ ...prev, [platformId]: { running: false, step: t('packaging.status.prepareFailed'), pct: 0 } }));
    } finally {
      setPreparing(prev => ({ ...prev, [platformId]: false }));
      // Refresh chapters/audio info and manifest status after packaging attempt
      stableRefreshChaptersInfo().catch(() => {});
      checkManifestExists().catch(() => {});
    }
  };

  // Load project data
  // Helper to check if manifest exists
  const checkManifestExists = useCallback(async () => {
    if (!root) return;
    try {
      const manifestPath = `${root}/manifest.json`;
      const exists = await window.khipu!.call('fs:checkFileExists', { filePath: manifestPath });
      setManifestExists(exists);
    } catch (err) {
      console.error('Failed to check manifest:', err);
      setManifestExists(false);
    }
  }, [root]);

  // Helper to (re)query chapters audio info from main
  const stableRefreshChaptersInfo = useCallback(async () => {
    if (!root) return;
    try {
      const info = await window.khipu!.call("audio:chaptersInfo", { projectRoot: root });
      if (info && typeof info.count === "number") {
        setChaptersInfo({
          count: info.count,
          hasAudio: info.hasAudio,
          missingIds: Array.isArray(info.missingIds) ? info.missingIds : undefined,
          presentIds: Array.isArray(info.presentIds) ? info.presentIds : undefined,
        });
      }
    } catch (err) {
      console.error("Failed to query chapters audio info:", err);
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
                await stableRefreshChaptersInfo();
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

    // cleanup is optional (preload just forwards ipcRenderer.on). We won't remove listener here.
  }, [root, onStatus, stableRefreshChaptersInfo]);

  // Register IPC listener for audio chapter updates. Keep this at top-level (not nested inside other hooks).
  useEffect(() => {
    if (!window.khipu?.onAudioChaptersUpdated) {
      console.error("onAudioChaptersUpdated is not available in window.khipu");
      return;
    }

    const onUpdated = async () => {
      await stableRefreshChaptersInfo();
    };

    // Preload exposes a function that returns an unsubscribe function (or nothing)
    const unsub = window.khipu.onAudioChaptersUpdated(onUpdated) as unknown as (() => void) | undefined;

    return () => {
      if (typeof unsub === 'function') {
        try { unsub(); } catch { /* ignore */ }
      }
    };
  }, [stableRefreshChaptersInfo]);

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

  // Listen for job events and map updates to platforms by matching platform id in event text
  useEffect(() => {
    if (!window.khipu?.onJob) return;

    const listener = (e: unknown) => {
      try {
        const evt = e as Record<string, unknown>;
        const maybe = (k: string) => (typeof evt[k] === 'string' ? String(evt[k]) : undefined);
        const pct = typeof evt['pct'] === 'number' ? (evt['pct'] as number) : undefined;
        const text = [maybe('note'), maybe('path'), maybe('event'), maybe('jobId')].filter(Boolean).join(' ');
        platforms.forEach((p) => {
          if (!text.includes(p.id)) return;
          const running = maybe('event') !== 'done';
          const step = maybe('note') || maybe('event') || '';
          setJobProgress(prev => ({ ...prev, [p.id]: { running, step, pct } }));
        });
      } catch {
        // ignore
      }
    };

    const unsub = window.khipu.onJob(listener) as unknown as (() => void) | void;
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [platforms]);

  // Listen for job events and map updates to platforms by matching platform id in event text
  useEffect(() => {
    if (!window.khipu?.onJob) return;

    const listener = (e: unknown) => {
      try {
        const evt = e as Record<string, unknown>;
        const maybe = (k: string) => (typeof evt[k] === 'string' ? String(evt[k]) : undefined);
        const pct = typeof evt['pct'] === 'number' ? (evt['pct'] as number) : undefined;
        const text = [maybe('note'), maybe('path'), maybe('event'), maybe('jobId')].filter(Boolean).join(' ');
        platforms.forEach((p) => {
          if (!text.includes(p.id)) return;
          const running = maybe('event') !== 'done';
          const step = maybe('note') || maybe('event') || '';
          setJobProgress(prev => ({ ...prev, [p.id]: { running, step, pct } }));
        });
      } catch {
        // ignore
      }
    };

    const unsub = window.khipu.onJob(listener) as unknown as (() => void) | void;
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [platforms]);

  const { bookMeta } = useBookMeta(root || undefined);

  // Platform readiness now stores per-requirement details and overall ok status
  type PlatformStatus = { ok: boolean; canPrepare: boolean; details: Record<string, boolean>; reasons?: Record<string,string> };
  const [platformReadiness, setPlatformReadiness] = useState<Record<string, PlatformStatus>>({});

  // Helper: parse bitrate string like "192k" -> 192
  const parseKbps = (s?: string | number) => {
    if (s == null) return undefined;
    if (typeof s === 'number') return s;
    const m = String(s).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : undefined;
  };

  // Check platform requirements including non-binary audio spec checks
  const checkPlatformRequirements = useCallback((platform: PlatformConfig): PlatformStatus => {
    const hasTitle = !!(bookMeta?.title || cfg?.bookMeta?.title);
    const hasAuthor = !!((bookMeta?.authors && bookMeta.authors.length > 0) || (cfg?.bookMeta?.authors && cfg.bookMeta.authors.length > 0));
    const hasNarrator = !!((bookMeta?.narrators && bookMeta.narrators.length > 0) || (cfg?.bookMeta?.narrators && cfg.bookMeta.narrators.length > 0));
    const hasCover = !!(bookMeta?.coverImage || cfg?.bookMeta?.coverImage);
    const hasAudio = chaptersInfo.hasAudio > 0;
    const hasChapters = chaptersInfo.count > 0;

    const details: Record<string, boolean> = {
      title: hasTitle,
      author: hasAuthor,
      narrator: hasNarrator,
      cover: hasCover,
      audio: hasAudio,
      chapters: hasChapters,
    };

    const reasons: Record<string,string> = {};

    // Non-binary checks: compare productionSettings for platform-specific packaging
    type PackagingCfg = { mp3_bitrate?: string; aac_bitrate?: string; sr_hz?: number; channels?: number } | undefined;

    const pkg: PackagingCfg = (() => {
      if (!productionSettings) return undefined;
      switch (platform.id) {
        case 'apple': return productionSettings.packaging?.apple;
        case 'google':
        case 'spotify': return productionSettings.packaging?.gplay_spotify;
        case 'acx': return productionSettings.packaging?.acx;
        case 'kobo': return productionSettings.packaging?.kobo;
        default: return undefined;
      }
    })();

    // Check bitrate if platform expects a specific range/value
  const expectedBitrate = parseKbps(String(platform.audioSpec?.bitrate)) || undefined;
  const actualBitrate = pkg ? parseKbps(pkg.mp3_bitrate || pkg.aac_bitrate) : undefined;
    if (expectedBitrate && actualBitrate) {
      const ok = actualBitrate >= expectedBitrate;
      details['audio_bitrate'] = ok;
      if (!ok) reasons['audio_bitrate'] = `bitrate ${actualBitrate}kbps is less than required ${expectedBitrate}kbps`;
    } else if (expectedBitrate && !actualBitrate) {
      details['audio_bitrate'] = false;
      reasons['audio_bitrate'] = 'project packaging bitrate not configured';
    }

    // Sample rate
    const expectedSR = platform.audioSpec?.sampleRate;
  const actualSR = pkg ? (pkg.sr_hz) : undefined;
    if (expectedSR && actualSR) {
      const ok = Number(actualSR) === Number(expectedSR);
      details['audio_sampleRate'] = ok;
      if (!ok) reasons['audio_sampleRate'] = `sample rate ${actualSR} != required ${expectedSR}`;
    } else if (expectedSR && !actualSR) {
      details['audio_sampleRate'] = false;
      reasons['audio_sampleRate'] = 'project packaging sample rate not configured';
    }

    // Channels
    const expectedCh = platform.audioSpec?.channels;
  const actualCh = pkg ? (pkg.channels) : undefined;
    if (expectedCh && actualCh) {
      const ok = Number(actualCh) === Number(expectedCh);
      details['audio_channels'] = ok;
      if (!ok) reasons['audio_channels'] = `channels ${actualCh} != required ${expectedCh}`;
    } else if (expectedCh && actualCh == null) {
      details['audio_channels'] = false;
      reasons['audio_channels'] = 'project packaging channels not configured';
    }

    // If any of the platform.requirements are false, overall ok is false
    const binaryOk = platform.requirements.every((r) => !!details[r]);
    // Also require audio spec checks (if present in details)
    const specKeys = ['audio_bitrate','audio_sampleRate','audio_channels'];
    const specOk = specKeys.filter(k => k in details).every(k => !!details[k]);

  // canPrepare means packaging can run: only requires audio spec checks (generation-only issues like missing
  // title/author/cover/audio/chapters should NOT block packaging since they can only be resolved by generation)
  const canPrepare = specOk;
  const ok = binaryOk && specOk;
  return { ok, canPrepare, details, reasons };
  }, [bookMeta, cfg, chaptersInfo, productionSettings]);

  useEffect(() => {
    const map = platforms.reduce((acc, p) => {
      acc[p.id] = checkPlatformRequirements(p);
      return acc;
    }, {} as Record<string, PlatformStatus>);
    setPlatformReadiness(map);
  }, [platforms, chaptersInfo, bookMeta, cfg, productionSettings, checkPlatformRequirements]);

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
          <>
            <WorkflowCompleteButton 
              step="export"
              disabled={selectedPlatforms.length === 0 || selectedPlatforms.some(p => !platformReadiness[p.id]?.ok)}
            >
              {t("packaging.markComplete")}
            </WorkflowCompleteButton>
          </>
        }
      />

      {/* Universal Manifest Section */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "16px" }}>
          {t("packaging.universalManifest", "Universal Manifest")}
          <span style={{ 
            fontSize: "12px", 
            fontWeight: "400", 
            color: "var(--muted)", 
            marginLeft: "8px" 
          }}>
            {t("packaging.optional", "(Optional)")}
          </span>
        </h2>
        <div style={{
          padding: "20px",
          backgroundColor: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "8px"
        }}>
          <div style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "16px" }}>
            {t("packaging.manifestDescription", "The universal manifest pre-aggregates book metadata, chapter information, and audio file paths for faster packaging. Packagers can work without it by reading source files directly, but generating it improves performance.")}
          </div>
          
          {/* Status indicator */}
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "8px",
            marginBottom: "16px",
            padding: "12px",
            backgroundColor: manifestExists ? "rgba(76, 175, 80, 0.1)" : "rgba(158, 158, 158, 0.1)",
            borderRadius: "6px"
          }}>
            <span style={{ fontSize: "20px" }}>{manifestExists ? "✓" : "ℹ"}</span>
            <div>
              <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>
                {manifestExists 
                  ? t("packaging.manifestExists", "Manifest generated")
                  : t("packaging.manifestNotGenerated", "Manifest not yet generated")}
              </div>
              <div style={{ fontSize: "13px", color: "var(--muted)" }}>
                {manifestExists
                  ? t("packaging.manifestExistsDesc", "Packaging will use pre-aggregated data for best performance")
                  : t("packaging.manifestNotGeneratedDesc", "Packaging will scan source files directly (slower but works fine)")}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={async () => {
                if (!root) return;
                setGeneratingManifest(true);
                try {
                  onStatus?.(t('packaging.status.generatingManifest', 'Generating manifest...') || 'Generating manifest...');
                  const res = await window.khipu!.call('packaging:generateManifest', { projectRoot: root });
                  if (res?.success) {
                    onStatus?.(t('packaging.status.manifestGenerated', 'Manifest generated successfully') || 'Manifest generated');
                    await checkManifestExists();
                  } else {
                    onStatus?.(t('packaging.status.manifestFailed', 'Failed to generate manifest') || 'Failed to generate manifest');
                    console.warn('Manifest generation failed:', res);
                  }
                } catch (err) {
                  console.error('Failed to generate manifest:', err);
                  onStatus?.(t('packaging.status.manifestFailed', 'Failed to generate manifest') || 'Failed to generate manifest');
                } finally {
                  setGeneratingManifest(false);
                }
              }}
              disabled={generatingManifest}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                backgroundColor: "var(--accent)",
                color: "var(--bg)",
                border: "none",
                borderRadius: "6px",
                cursor: generatingManifest ? "not-allowed" : "pointer",
                opacity: generatingManifest ? 0.6 : 1
              }}
            >
              {generatingManifest 
                ? t("packaging.actions.generating", "Generating...") 
                : manifestExists
                  ? t("packaging.actions.regenerateManifest", "Regenerate Manifest")
                  : t("packaging.actions.generateManifest", "Generate Manifest")}
            </button>
            <button
              onClick={async () => {
                if (!root) return;
                const manifestPath = `${root}/manifest.json`;
                try {
                  const exists = await window.khipu!.call('fs:checkFileExists', { filePath: manifestPath });
                  if (exists) {
                    await window.khipu!.call('fs:openExternal', { path: manifestPath });
                  } else {
                    onStatus?.(t('packaging.manifestNotFound', 'Manifest not yet generated') || 'Manifest not yet generated');
                  }
                } catch (err) {
                  console.error('Failed to open manifest:', err);
                }
              }}
              disabled={!manifestExists}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                backgroundColor: manifestExists ? "var(--accent)" : "var(--border)",
                color: manifestExists ? "var(--bg)" : "var(--muted)",
                border: "none",
                borderRadius: "6px",
                cursor: manifestExists ? "pointer" : "not-allowed"
              }}
            >
              {t("packaging.actions.viewManifest", "View Manifest")}
            </button>
            <span style={{ fontSize: "13px", color: "var(--muted)" }}>
              {t("packaging.manifestLocation", "manifest.json in project root")}
            </span>
          </div>
        </div>
      </section>

      {/* Chapter Audio Status Section */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "16px" }}>
          {t("packaging.chapterAudioStatus", "Chapter Audio Status")}
        </h2>
        <div style={{
          padding: "20px",
          backgroundColor: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "8px"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <div>
              <div style={{ fontSize: "24px", fontWeight: "600", color: "var(--text)" }}>
                {chaptersInfo.hasAudio} / {chaptersInfo.count}
              </div>
              <div style={{ fontSize: "14px", color: "var(--muted)" }}>
                {t("packaging.chaptersComplete", "chapters with complete audio")}
              </div>
            </div>
            <button 
              onClick={() => stableRefreshChaptersInfo()}
              style={{
                padding: "8px 16px",
                fontSize: "14px",
                backgroundColor: "var(--accent)",
                color: "var(--bg)",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer"
              }}
            >
              {t("packaging.actions.refresh", "Refresh")}
            </button>
          </div>
          
          {/* Progress bar */}
          <div style={{
            width: "100%",
            height: "8px",
            backgroundColor: "var(--border)",
            borderRadius: "4px",
            overflow: "hidden",
            marginBottom: "16px"
          }}>
            <div style={{
              width: `${chaptersInfo.count > 0 ? (chaptersInfo.hasAudio / chaptersInfo.count) * 100 : 0}%`,
              height: "100%",
              backgroundColor: chaptersInfo.hasAudio === chaptersInfo.count ? "#4caf50" : "#2196f3",
              transition: "width 0.3s ease"
            }} />
          </div>

          {/* Missing chapters list */}
          {chaptersInfo.missingIds && chaptersInfo.missingIds.length > 0 && (
            <div style={{
              padding: "12px",
              backgroundColor: "var(--bg)",
              borderRadius: "6px",
              border: "1px solid var(--border)"
            }}>
              <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px", color: "var(--text)" }}>
                {t("packaging.missingChapters", "Chapters without complete audio:")}
              </div>
              <div style={{ fontSize: "13px", color: "var(--muted)", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {chaptersInfo.missingIds.map(id => (
                  <span key={id} style={{
                    padding: "4px 8px",
                    backgroundColor: "var(--panel)",
                    borderRadius: "4px",
                    border: "1px solid var(--border)"
                  }}>
                    {id}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "12px" }}>
                💡 {t("packaging.generateChaptersHint", "Generate complete chapter audio in the Audio Production page first")}
              </div>
            </div>
          )}

          {/* Success message when all complete */}
          {chaptersInfo.hasAudio === chaptersInfo.count && chaptersInfo.count > 0 && (
            <div style={{
              padding: "12px",
              backgroundColor: "#e8f5e9",
              borderRadius: "6px",
              border: "1px solid #4caf50",
              fontSize: "14px",
              color: "#2e7d32"
            }}>
              ✅ {t("packaging.allChaptersComplete", "All chapters have complete audio files. Ready for packaging!")}
            </div>
          )}
        </div>
      </section>

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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h3 style={{ 
                  fontSize: "16px", 
                  fontWeight: "600", 
                  color: "var(--text)", 
                  margin: 0
                }}>
                  {name}
                </h3>
                <div>
                  <button
                    onClick={() => preparePlatform(id)}
                    // Only disable when already preparing or when there is no audio/chapters at all.
                    disabled={!!preparing[id] || chaptersInfo.count === 0 || chaptersInfo.hasAudio === 0}
                    style={{ marginLeft: '8px' }}
                  >
                    {preparing[id] ? t('packaging.status.preparing') : t('packaging.prepare')}
                  </button>
                  {/* If packaging spec checks failed, show a subtle hint but don't block Prepare */}
                  
                </div>
              </div>
              <p style={{ fontSize: "14px", color: "var(--muted)" }}>
                Format: {packageFormat}
              </p>
              <div style={{ fontSize: '14px', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {requirements.map((req, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ marginRight: '8px', color: platformReadiness[id]?.details?.[req] ? 'green' : 'red' }}>
                      {platformReadiness[id]?.details?.[req] ? '✓' : '✗'}
                    </span>
                    <span>{t(`packaging.requirements.${req}`)}</span>
                  </div>
                ))}

                {/* show job progress if running or recently updated */}
                {jobProgress[id] && (
                  <div style={{ marginTop: '10px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '13px' }}>{jobProgress[id].step}</strong>
                      {jobProgress[id].pct != null && (
                        <span style={{ color: 'var(--muted)' }}>{Math.round((jobProgress[id].pct || 0) * 100)}%</span>
                      )}
                    </div>
                    {jobProgress[id].running && (
                      <div style={{ height: '6px', background: 'var(--border)', borderRadius: 4, marginTop: 6 }}>
                        <div style={{ height: '6px', background: 'var(--accent)', width: `${Math.min(100, (jobProgress[id].pct || 0) * 100)}%`, borderRadius: 4 }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}