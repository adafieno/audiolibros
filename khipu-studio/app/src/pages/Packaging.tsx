import { useProject } from "../store/project";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useMemo, useCallback } from "react";
import type { BookMeta, ProjectConfig, ProductionSettings } from "../types/config";
import { PageHeader } from "../components/PageHeader";
import { WorkflowCompleteButton } from "../components/WorkflowCompleteButton";
import { StandardButton } from "../components/StandardButton";

interface PackagingRequirement {
  id: string;
  key: string;
  category: "metadata" | "files" | "audio" | "technical";
  required: boolean;
  platforms: string[];
  validator: () => boolean;
}

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
  // ...existing translation function `t` from useTranslation
  const { root, markStepCompleted, isStepCompleted } = useProject();
  
  const [cfg, setCfg] = useState<ProjectConfig | null>(null);
  const [bookMeta, setBookMeta] = useState<BookMeta | null>(null);
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null);
  const [productionSettings, setProductionSettings] = useState<ProductionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [chaptersInfo, setChaptersInfo] = useState<{ count: number; hasAudio: number; missingIds?: string[] }>({ count: 0, hasAudio: 0 });

  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [packagingProgress, setPackagingProgress] = useState<Record<string, string>>({});

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

        // Load book metadata
        const bookData = await window.khipu!.call("fs:read", {
          projectRoot: root,
          relPath: "book.meta.json",
          json: true
        }) as BookMeta;
        setBookMeta(bookData);

        // Load production settings
        const prodSettings = await window.khipu!.call("fs:read", {
          projectRoot: root,
          relPath: "production.settings.json",
          json: true
        }) as ProductionSettings;
        setProductionSettings(prodSettings);

        // Try to load manifest.json if present. If it's missing, create one from bookMeta and save it.
        try {
          const mf = await window.khipu!.call("fs:read", {
            projectRoot: root,
            relPath: "manifest.json",
            json: true
          });
          setManifest(mf as Record<string, unknown>);
        } catch (e) {
          console.debug('manifest.json not found or failed to read:', e);
          // If bookMeta is available, create a minimal manifest and persist it so later reads are consistent
          if (bookData && typeof bookData === 'object') {
            try {
              const newManifest = {
                metadata: bookData,
                createdAt: new Date().toISOString()
              } as Record<string, unknown>;
              const wrote = await window.khipu!.call("fs:write", {
                projectRoot: root,
                relPath: "manifest.json",
                json: true,
                content: newManifest
              });
              if (wrote) {
                // read it back to ensure consistent shape
                const mf2 = await window.khipu!.call("fs:read", { projectRoot: root, relPath: 'manifest.json', json: true });
                setManifest(mf2 as Record<string, unknown>);
              }
            } catch (we) {
              console.warn('Failed to create manifest.json from book meta:', we);
            }
          }
        }

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

  // Define all packaging requirements
  const requirements: PackagingRequirement[] = useMemo(() => [
    // Metadata requirements
    {
      id: "title",
      key: "packaging.requirements.title",
      category: "metadata",
      required: true,
      platforms: ["apple", "google", "spotify", "acx", "kobo"],
      validator: () => Boolean(bookMeta?.title?.trim())
    },
    {
      id: "author",
      key: "packaging.requirements.author",
      category: "metadata",
      required: true,
      platforms: ["apple", "google", "spotify", "acx", "kobo"],
      validator: () => Boolean(bookMeta?.authors?.length)
    },
    {
      id: "narrator",
      key: "packaging.requirements.narrator",
      category: "metadata",
      required: true,
      platforms: ["apple", "google", "spotify", "acx", "kobo"],
      validator: () => Boolean(bookMeta?.narrators?.length)
    },
    {
      id: "description",
      key: "packaging.requirements.description",
      category: "metadata",
      required: true,
      platforms: ["apple", "google", "spotify", "acx", "kobo"],
      validator: () => Boolean(bookMeta?.description?.trim())
    },
    // ISBN field remains in book metadata but is no longer required for packaging
    {
      id: "keywords",
      key: "packaging.requirements.keywords",
      category: "metadata",
      required: false,
      platforms: ["apple", "google", "spotify", "acx", "kobo"],
      validator: () => Boolean(bookMeta?.keywords?.length)
    },
    {
      id: "categories",
      key: "packaging.requirements.categories",
      category: "metadata",
      required: false,
      platforms: ["apple", "google", "spotify", "acx", "kobo"],
      validator: () => Boolean(bookMeta?.categories?.length)
    },
    
    // File requirements
    {
      id: "cover",
      key: "packaging.requirements.cover",
      category: "files",
      required: true,
      platforms: ["apple", "google", "spotify", "acx", "kobo"],
      validator: () => {
        // Check if cover image exists - for now just check if it's specified in book meta
        return Boolean(bookMeta?.coverImage);
      }
    },
    
    // Audio requirements
    {
      id: "audioComplete",
      key: "packaging.requirements.audioComplete",
      category: "audio",
      required: true,
      platforms: ["apple", "google", "spotify", "acx", "kobo"],
      // complete only when every chapter has audio
      validator: () => chaptersInfo.hasAudio === chaptersInfo.count && chaptersInfo.count > 0
    },
    
    // Technical requirements
    {
      id: "outputDirectory",
      key: "packaging.requirements.outputDirectory",
      category: "technical",
      required: true,
      platforms: ["apple", "google", "spotify", "acx", "kobo"],
      validator: () => Boolean(cfg?.export?.outputDir?.trim())
    }
  ], [bookMeta, cfg, chaptersInfo]);

  // Calculate readiness for each platform
  const platformReadiness = useMemo(() => {
    return platforms.map(platform => {
      if (!platform.enabled) {
        return { ...platform, ready: false, missing: [], score: 0 };
      }

      const platformRequirements = requirements.filter(req => 
        req.platforms.includes(platform.id) && req.required
      );
      
      const satisfied = platformRequirements.filter(req => req.validator());
      const missing = platformRequirements.filter(req => !req.validator());
      
      return {
        ...platform,
        ready: missing.length === 0,
        missing: missing.map(req => req.key),
        score: platformRequirements.length > 0 ? satisfied.length / platformRequirements.length : 0
      };
    });
  }, [platforms, requirements]);

  const enabledPlatforms = platformReadiness.filter(p => p.enabled);
  const readyPlatforms = enabledPlatforms.filter(p => p.ready);

  // Compute a simple manifest progress summary (based on book metadata + audio coverage)
  const manifestProgress = useMemo(() => {
    const requiredFields = ["title", "authors", "narrators", "description", "coverImage"];

    // Helper to map keys to friendly labels (use translations only)
    const friendlyLabel = (k: string) => {
      switch (k) {
        case 'title': return t('packaging.fields.title');
        case 'authors': return t('packaging.fields.authors');
        case 'narrators': return t('packaging.fields.narrators');
        case 'description': return t('packaging.fields.description');
        case 'coverImage': return t('packaging.fields.coverImage');
        default: return k;
      }
    };

    // Prefer manifest metadata if present (manifest.metadata or root). If manifest is missing,
    // fall back to project book metadata (`bookMeta`). Compute percent and missing fields from
    // whichever source is available so UI reflects actual data.
    const manifestMeta = manifest ? (((manifest as Record<string, unknown>).metadata ?? manifest) as Record<string, unknown>) : null;
    const source = (manifestMeta ?? (bookMeta as Record<string, unknown> | null));

    const presentCount = source ? requiredFields.reduce((acc, field) => {
      const val = (source as Record<string, unknown>)[field] as string | string[] | undefined;
      const has = Array.isArray(val) ? val.length > 0 : (typeof val === 'string' ? val.trim().length > 0 : Boolean(val));
      return acc + (has ? 1 : 0);
    }, 0) : 0;

    const percent = Math.round((presentCount / requiredFields.length) * 100);

    const missingFields = requiredFields.filter(f => {
      const val = source ? (source[f as keyof typeof source] as string | string[] | undefined) : undefined;
      const has = Array.isArray(val) ? val.length > 0 : (typeof val === 'string' ? val.trim().length > 0 : Boolean(val));
      return !has;
    }).map(friendlyLabel);

    const status = percent === 0 ? 'empty' as const : (percent >= 100 ? 'complete' as const : 'partial' as const);
    return { percent, status, missingFields };
  }, [manifest, bookMeta, t]);

  const handlePlatformSelection = (platformId: string) => {
    setSelectedPlatforms((prev) => {
      if (prev.includes(platformId)) {
        return prev.filter((id) => id !== platformId);
      } else {
        return [...prev, platformId];
      }
    });
  };

  const startPackaging = async () => {
    if (!root || selectedPlatforms.length === 0) return;

    for (const platformId of selectedPlatforms) {
      setPackagingProgress((prev) => ({ ...prev, [platformId]: 'in-progress' }));

      try {
        const result = await window.khipu!.call("packaging:create", { projectRoot: root, platformId });
        if (result.success) {
          setPackagingProgress((prev) => ({ ...prev, [platformId]: 'completed' }));
        } else {
          setPackagingProgress((prev) => ({ ...prev, [platformId]: 'failed' }));
        }
      } catch (e) {
        setPackagingProgress((prev) => ({ ...prev, [platformId]: 'failed' }));
      }
    }
  };

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

  return (
    <div style={{ maxWidth: "100%" }}>
      <PageHeader 
        title={t("packaging.title")}
        description={t("packaging.description")}
        actions={
          <WorkflowCompleteButton 
            step="export"
            disabled={enabledPlatforms.length === 0 || readyPlatforms.length === 0}
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
          {/* Enabled Platforms */}
          <div style={{
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
              {t("packaging.overview.platforms")}
            </h3>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--accent)" }}>
              {enabledPlatforms.length}
            </div>
            <div style={{ fontSize: "14px", color: "var(--muted)" }}>
              {t("packaging.overview.platformsEnabled")}
            </div>
          </div>

          {/* Ready to Package */}
          <div style={{
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
              {t("packaging.overview.ready")}
            </h3>
            <div style={{ fontSize: "24px", fontWeight: "700", color: readyPlatforms.length === enabledPlatforms.length ? "var(--success)" : "var(--warning)" }}>
              {readyPlatforms.length}/{enabledPlatforms.length}
            </div>
            <div style={{ fontSize: "14px", color: "var(--muted)" }}>
              {t("packaging.overview.readyPlatforms")}
            </div>
          </div>

          {/* Audio Progress */}
          <div style={{
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
              {t("packaging.overview.audio")}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: "24px", fontWeight: "700", color: chaptersInfo.hasAudio === chaptersInfo.count ? "var(--success)" : "var(--warning)" }}>
                {chaptersInfo.hasAudio}/{chaptersInfo.count}
              </div>
              <div style={{ fontSize: '13px', padding: '6px 10px', borderRadius: 6, backgroundColor: chaptersInfo.count === 0 ? 'var(--error-bg)' : (chaptersInfo.hasAudio === chaptersInfo.count ? 'var(--success-bg)' : 'var(--warning-bg)'), color: 'var(--text)' }}>
                {chaptersInfo.count === 0 ? t('packaging.status.noChapters') : (chaptersInfo.hasAudio === chaptersInfo.count ? t('packaging.status.audioAllPresent') : t('packaging.status.audioPartial'))}
              </div>
            </div>
            <div style={{ fontSize: "14px", color: "var(--muted)" }}>
              {t("packaging.overview.chaptersAudio")}
            </div>
                  {chaptersInfo.missingIds && chaptersInfo.missingIds.length > 0 && (
                    <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--muted)" }}>
                      <strong>Missing audio for:</strong> {chaptersInfo.missingIds.join(", ")}
                    </div>
                  )}
          </div>
          {/* Manifest Progress Card */}
          <div style={{
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
            }}>{t("packaging.overview.manifestProgress")}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: "24px", fontWeight: "700", color: manifestProgress.percent >= 100 ? "var(--success)" : "var(--warning)" }}>
                {manifestProgress.percent}%
              </div>
              {/* single manifest badge: Complete / Partial / Not found */}
              <div style={{ fontSize: '13px', padding: '6px 10px', borderRadius: 6, backgroundColor: (manifestProgress.status === 'complete' ? 'var(--success-bg)' : (manifestProgress.status === 'partial' ? 'var(--warning-bg)' : 'var(--error-bg)')), color: 'var(--text)' }}>
                {manifestProgress.status === 'complete' ? t('packaging.status.manifestComplete') : (manifestProgress.status === 'partial' ? t('packaging.status.manifestPartial') : t('packaging.status.manifestEmpty'))}
              </div>
              {/* audio badge intentionally removed from manifest card; audio status is shown in the Audio Progress card above */}
              {/* no refresh button for manifest - keep layout consistent with Audio Progress */}
            </div>
            <div style={{ fontSize: "14px", color: "var(--muted)" }}>
              {t('packaging.overview.metadataCompletion')}
            </div>
            <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--muted)" }}>
              <strong>{t('packaging.overview.missingItemsPrefix')}</strong>{' '}
              {manifestProgress.missingFields && manifestProgress.missingFields.length > 0 ? manifestProgress.missingFields.join(', ') : t('packaging.overview.none')}
            </div>
          </div>
        </div>
      </section>

      {/* Platform Checklist */}
      <section>
        <h2 style={{ 
          fontSize: "20px", 
          fontWeight: "600", 
          color: "var(--text)", 
          marginBottom: "16px" 
        }}>
          {t("packaging.platforms.title")}
        </h2>

        {enabledPlatforms.length === 0 ? (
          <div style={{
            padding: "32px",
            textAlign: "center",
            backgroundColor: "var(--panel)",
            border: "1px dashed var(--border)",
            borderRadius: "8px"
          }}>
            <p style={{ color: "var(--text)", marginBottom: "8px" }}>
              {t("packaging.platforms.noneEnabled")}
            </p>
            <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "16px" }}>
              {t("packaging.platforms.enableInstructions")}
            </p>
            <StandardButton 
              onClick={() => window.location.href = "/project"}
              variant="secondary"
            >
              {t("packaging.platforms.goToProject")}
            </StandardButton>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {enabledPlatforms.map(platform => (
              <div
                key={platform.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  backgroundColor: "var(--panel)",
                  overflow: "hidden"
                }}
              >
                {/* Platform Header */}
                <div style={{
                  padding: "16px",
                  borderBottom: "1px solid var(--border)",
                  backgroundColor: platform.ready ? "var(--success-bg)" : "var(--warning-bg)"
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <h3 style={{ 
                        fontSize: "18px", 
                        fontWeight: "600", 
                        color: "var(--text)", 
                        marginBottom: "4px" 
                      }}>
                        {platform.ready ? "✅" : "⚠️"} {platform.name}
                      </h3>
                      <div style={{ fontSize: "14px", color: "var(--muted)" }}>
                        {t("packaging.platforms.format")}: {platform.packageFormat} • {platform.audioSpec.format} {platform.audioSpec.bitrate}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ 
                        fontSize: "18px", 
                        fontWeight: "700", 
                        color: platform.ready ? "var(--success)" : "var(--warning)" 
                      }}>
                        {Math.round(platform.score * 100)}%
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                        {t("packaging.platforms.complete")}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Requirements List */}
                <div style={{ padding: "16px" }}>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {requirements
                      .filter(req => req.platforms.includes(platform.id) && req.required)
                      .map(req => {
                        // default satisfied boolean
                        const satisfied = req.validator();

                        // Special-case audioComplete: show red when none, partial (warning) when some, ok when all
                        let status: 'ok' | 'partial' | 'error' = satisfied ? 'ok' : 'error';
                        if (req.id === 'audioComplete') {
                          if (chaptersInfo.count === 0 || chaptersInfo.hasAudio === 0) {
                            status = 'error';
                          } else if (chaptersInfo.hasAudio > 0 && chaptersInfo.hasAudio < chaptersInfo.count) {
                            status = 'partial';
                          } else if (chaptersInfo.hasAudio === chaptersInfo.count) {
                            status = 'ok';
                          }
                        }

                        const bg = status === 'ok' ? 'var(--success-bg)' : (status === 'partial' ? 'var(--warning-bg)' : 'var(--error-bg)');
                        const border = status === 'ok' ? 'var(--success)' : (status === 'partial' ? 'var(--warning)' : 'var(--error)');
                        const icon = status === 'ok' ? '✅' : (status === 'partial' ? '⚠️' : '❌');

                        return (
                          <div
                            key={req.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              padding: "8px 12px",
                              backgroundColor: bg,
                              border: `1px solid ${border}`,
                              borderRadius: "4px"
                            }}
                          >
                            <span style={{ marginRight: "8px", fontSize: "16px" }}>
                              {icon}
                            </span>
                            <span style={{ flex: 1, color: "var(--text)" }}>
                              {t(req.key)}
                            </span>
                          </div>
                        );
                      })}
                  </div>

                  {platform.ready && (
                    <div style={{ marginTop: "16px", textAlign: "center" }}>
                      <StandardButton
                        variant="primary"
                        onClick={async () => {
                          try {
                            onStatus?.(`Creating package for ${platform.name}...`);
                            const resUnknown: unknown = await window.khipu!.call('packaging:create', { projectRoot: root!, platformId: platform.id });

                            // Structured report handling (main process may return { success, outDir, errors:[], warnings:[], details:{}})
                            const res = (resUnknown && typeof resUnknown === 'object') ? (resUnknown as { success?: boolean; outDir?: string; errors?: string[]; warnings?: string[]; error?: string }) : { success: false };

                            if (res && res.success) {
                              const outDir = res.outDir;
                              onStatus?.(t('packaging.status.packageCreated', { platform: platform.name, out: outDir }));

                              // If there are warnings, show them along with success
                              if (Array.isArray(res.warnings) && res.warnings.length > 0) {
                                const msg = `${t('packaging.status.packageCreatedAlert', { platform: platform.name, out: outDir })}\n\nWarnings:\n- ${res.warnings.join('\n- ')}`;
                                alert(msg);
                              } else {
                                alert(t('packaging.status.packageCreatedAlert', { platform: platform.name, out: outDir }));
                              }
                            } else {
                              // Try to surface structured errors or fallback to error string
                              let errMsg = 'Unknown error';
                              if (res) {
                                if (Array.isArray(res.errors) && res.errors.length > 0) errMsg = res.errors.join('\n');
                                else if (res.error) errMsg = String(res.error);
                                else errMsg = JSON.stringify(res);
                              }
                              onStatus?.(t('packaging.status.packageFailed', { platform: platform.name }));
                              alert(`${t('packaging.status.packageFailedAlert', { platform: platform.name, error: errMsg })}`);
                            }
                          } catch (e) {
                            console.error('Packaging failed:', e);
                            onStatus?.(t('packaging.status.packageFailed', { platform: platform.name }));
                            alert(t('packaging.status.packageFailedAlert', { platform: platform.name, error: String(e) }));
                          }
                        }}
                      >
                        {t("packaging.platforms.createPackage")} {platform.name}
                      </StandardButton>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Platform Requirements Checklists */}
      <section style={{ marginBottom: "32px" }}>
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", 
          gap: "16px" 
        }}>
          {platformReadiness.map(({ id, ready, missing, score }) => (
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
                {t(`packaging.${id}`)}
              </h3>
              <p style={{ fontSize: "14px", color: ready ? "var(--success)" : "var(--warning)" }}>
                {ready ? t("packaging.ready") : t("packaging.missing")}
              </p>
              <ul style={{ fontSize: "14px", color: "var(--muted)" }}>
                {missing.map((requirement, index) => (
                  <li key={index}>{t(`packaging.requirements.${requirement}`)}</li>
                ))}
              </ul>
              <p style={{ fontSize: "14px", color: "var(--text)" }}>
                {t("packaging.score", { score: Math.round(score * 100) })}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Platform Selection and Packaging Section */}
      <section style={{ marginTop: "32px", padding: "16px", borderRadius: "8px", backgroundColor: "var(--panel)", border: "1px solid var(--border)" }}>
        <h2 style={{ 
          fontSize: "20px", 
          fontWeight: "600", 
          color: "var(--text)", 
          marginBottom: "16px" 
        }}>
          {t("packaging.selectPlatforms")}
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "16px", marginBottom: "16px" }}>
          {['apple', 'google', 'spotify', 'acx', 'kobo'].map((platform) => (
            <div key={platform} style={{ 
              padding: "16px", 
              borderRadius: "8px", 
              backgroundColor: selectedPlatforms.includes(platform) ? "var(--primary-bg)" : "var(--panel)", 
              border: `1px solid ${selectedPlatforms.includes(platform) ? 'var(--primary)' : 'var(--border)'}`,
              cursor: "pointer",
              transition: "background-color 0.3s, border-color 0.3s"
            }}
            onClick={() => handlePlatformSelection(platform)}
            >
              <h3 style={{ 
                fontSize: "18px", 
                fontWeight: "600", 
                color: selectedPlatforms.includes(platform) ? "var(--primary)" : "var(--text)", 
                marginBottom: "8px" 
              }}>
                {selectedPlatforms.includes(platform) ? "✅" : "⚙️"} {t(`platforms.${platform}`)}
              </h3>
              <div style={{ fontSize: "14px", color: "var(--muted)" }}>
                {t("packaging.platforms.format")}: {platforms.find(p => p.id === platform)?.packageFormat} • {platforms.find(p => p.id === platform)?.audioSpec.format} {platforms.find(p => p.id === platform)?.audioSpec.bitrate}
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center" }}>
          <StandardButton 
            onClick={startPackaging} 
            disabled={selectedPlatforms.length === 0}
            style={{ 
              padding: "12px 24px", 
              fontSize: "16px", 
              fontWeight: "500", 
              borderRadius: "4px", 
              backgroundColor: "var(--accent)", 
              color: "var(--text)", 
              border: "none",
              cursor: "pointer",
              transition: "background-color 0.3s, transform 0.3s",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              justifyContent: "center"
            }}
          >
            {t("packaging.startPackaging")}
            {selectedPlatforms.length > 0 && (
              <span style={{ 
                fontSize: "14px", 
                fontWeight: "400", 
                color: "var(--text)", 
                backgroundColor: "var(--primary)", 
                borderRadius: "12px", 
                padding: "4px 8px" 
              }}>
                {selectedPlatforms.length}
              </span>
            )}
          </StandardButton>
        </div>

        {/* Packaging Progress */}
        <div style={{ marginTop: "24px" }}>
          <h3 style={{ 
            fontSize: "16px", 
            fontWeight: "600", 
            color: "var(--text)", 
            marginBottom: "8px" 
          }}>
            {t("packaging.progress")}
          </h3>
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
            gap: "16px" 
          }}>
            {Object.entries(packagingProgress).map(([platform, status]) => (
              <div key={platform} style={{ 
                padding: "12px", 
                borderRadius: "8px", 
                backgroundColor: "var(--panel)", 
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: "4px"
              }}>
                <div style={{ 
                  fontSize: "16px", 
                  fontWeight: "500", 
                  color: "var(--text)", 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "8px" 
                }}>
                  <span style={{ 
                    display: "inline-block", 
                    width: "24px", 
                    height: "24px", 
                    borderRadius: "50%", 
                    backgroundColor: status === 'completed' ? 'var(--success)' : (status === 'in-progress' ? 'var(--warning)' : 'var(--error)'),
                    transition: "background-color 0.3s"
                  }}></span>
                  {t(`platforms.${platform}`)}
                </div>
                <div style={{ 
                  fontSize: "14px", 
                  color: "var(--muted)", 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "4px" 
                }}>
                  {status === 'completed' && (
                    <span style={{ 
                      color: "var(--success)", 
                      fontWeight: "500" 
                    }}>
                      {t("packaging.status.completed")}
                    </span>
                  )}
                  {status === 'in-progress' && (
                    <span style={{ 
                      color: "var(--warning)", 
                      fontWeight: "500" 
                    }}>
                      {t("packaging.status.inProgress")}
                    </span>
                  )}
                  {status === 'failed' && (
                    <span style={{ 
                      color: "var(--error)", 
                      fontWeight: "500" 
                    }}>
                      {t("packaging.status.failed")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}