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
  const [chaptersInfo, setChaptersInfo] = useState<{ count: number; hasAudio: number; missingIds?: string[] }>({ count: 0, hasAudio: 0 });

  const [preparing, setPreparing] = useState<Record<string, boolean>>({});
  const [jobProgress, setJobProgress] = useState<Record<string, { running: boolean; step?: string; pct?: number }>>({});

  const preparePlatform = async (platformId: string) => {
    if (!root) return;
    setPreparing(prev => ({ ...prev, [platformId]: true }));
    // initialize job progress for UI
    setJobProgress(prev => ({ ...prev, [platformId]: { running: true, step: t('packaging.status.preparing'), pct: 0 } }));
    try {
      onStatus?.(t('packaging.status.preparing') || `Preparing package for ${platformId}`);
      const res = await window.khipu!.call('packaging:create', { projectRoot: root, platformId });
      if (res?.success) {
        onStatus?.(t('packaging.status.prepared') || `Package prepared for ${platformId}`);
        setJobProgress(prev => ({ ...prev, [platformId]: { running: false, step: t('packaging.status.prepared'), pct: 100 } }));
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
      // Refresh chapters/audio info after packaging attempt
      stableRefreshChaptersInfo().catch(() => {});
    }
  };

  // Load project data
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
        });
      }
    } catch {
      console.error("Failed to refresh chapters info");
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