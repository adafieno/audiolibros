import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useProject } from "../store/project";
import { WorkflowCompleteButton } from "../components/WorkflowCompleteButton";
import {
  loadProjectConfig, saveProjectConfig,
} from "../lib/config";
import type {
  ProjectConfig,
  LlmEngine, TtsEngine,
} from "../types/config";

export default function Project() {
  const { t } = useTranslation();
  const { root } = useProject();
  const [cfg, setCfg] = useState<ProjectConfig | null>(null);
  const [msg, setMsg] = useState("");

  // Load config on mount or project change
  useEffect(() => {
    if (!root) {
      setCfg(null);
      return;
    }
    
    loadProjectConfig(root)
      .then(setCfg)
      .catch(err => {
        console.error("Failed to load project config:", err);
        setMsg(t("project.loadError"));
      });
  }, [root, t]);

  // Helper to update nested config properties
  const update = <K extends keyof ProjectConfig>(
    key: K,
    value: ProjectConfig[K]
  ) => {
    if (!cfg) return;
    setCfg({ ...cfg, [key]: value });
  };

  // Helper for number inputs
  const onNumber = (fn: (n: number) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const n = parseInt(e.target.value, 10);
    if (!isNaN(n)) fn(n);
  };

  const saveAll = async () => {
    if (!root || !cfg) return;
    try {
      await saveProjectConfig(root, cfg);
      setMsg(t("project.saved"));
      setTimeout(() => setMsg(""), 2000);
    } catch (err) {
      console.error("Failed to save config:", err);
      setMsg(t("project.saveError"));
    }
  };

  if (!root) {
    return <div>{t("status.openProject")}</div>;
  }

  if (!cfg) {
    return <div>{t("project.loading")}</div>;
  }

  // Extract project settings with defaults
  const llm = cfg?.llm || { engine: { name: "openai", model: "gpt-4o" } };
  const tts = cfg?.tts || { engine: { name: "azure", voice: "es-PE-CamilaNeural" }, cache: true };

  // Type guard functions
  const isOpenAI = (engine: LlmEngine): engine is Extract<LlmEngine, { name: "openai" }> => 
    engine.name === "openai";
  const isLocalLLM = (engine: LlmEngine): engine is Extract<LlmEngine, { name: "local" }> => 
    engine.name === "local";
  const isAzureTTS = (engine: TtsEngine): engine is Extract<TtsEngine, { name: "azure" }> => 
    engine.name === "azure";
  const is11LabsTTS = (engine: TtsEngine): engine is Extract<TtsEngine, { name: "elevenlabs" }> => 
    engine.name === "elevenlabs";
  const isLocalTTS = (engine: TtsEngine): engine is Extract<TtsEngine, { name: "local" }> => 
    engine.name === "local";

  return (
    <div>
      <h2>{t("project.title")}</h2>
      {/* Project Language */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("project.general")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label>
            <div>{t("project.language")}</div>
            <input
              value={cfg?.language || ""}
              onChange={(e) => update("language", e.target.value)}
            />
          </label>
        </div>
      </section>

      {/* Manuscript Settings */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("project.manuscript")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          <label>
            <div>{t("project.chapterGlob")}</div>
            <input
              value={cfg?.manuscript?.chapterGlob || "analysis/chapters_txt/*.txt"}
              placeholder="analysis/chapters_txt/*.txt"
              onChange={(e) => update("manuscript", { chapterGlob: e.target.value })}
            />
          </label>
        </div>
      </section>

      {/* Planning */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("project.planning")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label>
            <div>{t("project.maxKb")}</div>
            <input
              type="number"
              value={cfg?.planning?.maxKb || 4}
              onChange={onNumber((n) => update("planning", { 
                maxKb: n, 
                llmAttribution: cfg?.planning?.llmAttribution || "on" 
              }))}
            />
          </label>
          <label>
            <div>{t("project.llmAttribution")}</div>
            <select
              value={cfg?.planning?.llmAttribution || "on"}
              onChange={(e) => update("planning", { 
                maxKb: cfg?.planning?.maxKb || 4, 
                llmAttribution: e.target.value as "on" | "off" 
              })}
            >
              <option value="on">{t("project.attributionOn")}</option>
              <option value="off">{t("project.attributionOff")}</option>
            </select>
          </label>
        </div>
      </section>

      {/* SSML Settings */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("project.ssml")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label>
            <div>{t("project.rate")}</div>
            <input
              value={cfg?.ssml?.rate || ""}
              onChange={(e) => update("ssml", { 
                ...cfg?.ssml, 
                rate: e.target.value 
              })}
            />
          </label>
          <label>
            <div>{t("project.pitch")}</div>
            <input
              value={cfg?.ssml?.pitch || ""}
              onChange={(e) => update("ssml", { 
                ...cfg?.ssml, 
                pitch: e.target.value 
              })}
            />
          </label>
          <label>
            <div>{t("project.breaks")}</div>
            <input
              type="number"
              value={cfg?.ssml?.breaksMs || 0}
              onChange={onNumber((n) => update("ssml", { 
                ...cfg?.ssml, 
                breaksMs: n 
              }))}
            />
          </label>
        </div>
      </section>

      {/* LLM Engine */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("project.llm")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 8, alignItems: "center" }}>
          <select
            value={llm.engine.name}
            onChange={(e) => {
              const name = e.target.value as LlmEngine["name"];
              if (name === "openai") {
                update("llm", { engine: { name: "openai", model: isOpenAI(llm.engine) ? llm.engine.model : "gpt-4o" } });
              } else {
                update("llm", { engine: { name: "local", model: isLocalLLM(llm.engine) ? llm.engine.model : "llama3.1", endpoint: isLocalLLM(llm.engine) ? llm.engine.endpoint : "http://localhost:8000" } });
              }
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="local">Local</option>
          </select>
          {isOpenAI(llm.engine) ? (
            <input
              placeholder={t("project.llmModel")}
              value={llm.engine.model}
              onChange={(e) => update("llm", { engine: { name: "openai", model: e.target.value } })}
            />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input
                placeholder={t("project.llmModelLocal")}
                value={llm.engine.model}
                onChange={(e) => update("llm", { engine: { name: "local", model: e.target.value, endpoint: isLocalLLM(llm.engine) ? llm.engine.endpoint : "http://localhost:8000" } })}
              />
              <input
                placeholder={t("project.llmEndpoint")}
                value={isLocalLLM(llm.engine) ? llm.engine.endpoint : ""}
                onChange={(e) => update("llm", { engine: { name: "local", model: llm.engine.model, endpoint: e.target.value } })}
              />
            </div>
          )}
        </div>
      </section>

      {/* TTS Engine */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("project.tts")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 8, alignItems: "center" }}>
          <select
            value={tts.engine.name}
            onChange={(e) => {
              const name = e.target.value as TtsEngine["name"];
              if (name === "azure") {
                update("tts", { engine: { name: "azure", voice: isAzureTTS(tts.engine) ? tts.engine.voice : "es-PE-CamilaNeural" }, cache: tts.cache });
              } else if (name === "elevenlabs") {
                update("tts", { engine: { name: "elevenlabs", voiceId: is11LabsTTS(tts.engine) ? tts.engine.voiceId : "" }, cache: tts.cache });
              } else {
                update("tts", { engine: { name: "local", model: isLocalTTS(tts.engine) ? (tts.engine.model ?? "") : "" }, cache: tts.cache });
              }
            }}
          >
            <option value="azure">Azure</option>
            <option value="elevenlabs">ElevenLabs</option>
            <option value="local">Local</option>
          </select>
          {isAzureTTS(tts.engine) && (
            <input
              placeholder={t("project.ttsVoiceAzure")}
              value={tts.engine.voice}
              onChange={(e) => update("tts", { engine: { name: "azure", voice: e.target.value }, cache: tts.cache })}
            />
          )}
          {is11LabsTTS(tts.engine) && (
            <input
              placeholder={t("project.ttsVoiceElevenlabs")}
              value={tts.engine.voiceId}
              onChange={(e) => update("tts", { engine: { name: "elevenlabs", voiceId: e.target.value }, cache: tts.cache })}
            />
          )}
          {isLocalTTS(tts.engine) && (
            <input
              placeholder={t("project.ttsModelLocal")}
              value={tts.engine.model ?? ""}
              onChange={(e) => update("tts", { engine: { name: "local", model: e.target.value }, cache: tts.cache })}
            />
          )}
          <label>
            <input
              type="checkbox"
              checked={tts.cache}
              onChange={(e) => update("tts", { engine: tts.engine, cache: e.target.checked })}
            />
            <span style={{ marginLeft: 8 }}>{t("project.ttsCacheEnabled")}</span>
          </label>
        </div>
      </section>

      {/* Credentials */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("project.creds")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label>
            <div>{t("project.azureKey")}</div>
            <input
              type="text"
              value={cfg.creds?.azure?.key ?? ""}
              onChange={e => update("creds", {
                ...cfg.creds,
                azure: { ...cfg.creds?.azure, key: e.target.value }
              })}
            />
          </label>
          <label>
            <div>{t("project.azureRegion")}</div>
            <input
              type="text"
              value={cfg.creds?.azure?.region ?? ""}
              onChange={e => update("creds", {
                ...cfg.creds,
                azure: { ...cfg.creds?.azure, region: e.target.value }
              })}
            />
          </label>
          <label>
            <div>{t("project.openaiKey")}</div>
            <input
              type="text"
              value={cfg.creds?.openai?.apiKey ?? ""}
              onChange={e => update("creds", {
                ...cfg.creds,
                openai: { ...cfg.creds?.openai, apiKey: e.target.value }
              })}
            />
          </label>
          <label>
            <div>{t("project.openaiBaseUrl")}</div>
            <input
              type="text"
              value={cfg.creds?.openai?.baseUrl ?? ""}
              onChange={e => update("creds", {
                ...cfg.creds,
                openai: { ...cfg.creds?.openai, baseUrl: e.target.value }
              })}
            />
          </label>
        </div>
      </section>

      {/* Export Settings */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("project.export")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          <label>
            <div>{t("project.outputDir")}</div>
            <input
              value={cfg?.export?.outputDir || "output"}
              placeholder="output"
              onChange={(e) => update("export", { 
                outputDir: e.target.value,
                platforms: cfg?.export?.platforms || {}
              })}
            />
          </label>
          <div style={{ marginTop: 8 }}>
            <div style={{ marginBottom: 8 }}>{t("project.platforms")}</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={cfg?.export?.platforms?.apple || false}
                  onChange={(e) => update("export", {
                    outputDir: cfg?.export?.outputDir || "output",
                    platforms: { ...cfg?.export?.platforms, apple: e.target.checked }
                  })}
                />
                <span>{t("project.platformApple")}</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={cfg?.export?.platforms?.google || false}
                  onChange={(e) => update("export", {
                    outputDir: cfg?.export?.outputDir || "output",
                    platforms: { ...cfg?.export?.platforms, google: e.target.checked }
                  })}
                />
                <span>{t("project.platformGoogle")}</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={cfg?.export?.platforms?.spotify || false}
                  onChange={(e) => update("export", {
                    outputDir: cfg?.export?.outputDir || "output",
                    platforms: { ...cfg?.export?.platforms, spotify: e.target.checked }
                  })}
                />
                <span>{t("project.platformSpotify")}</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Additional Credentials & Paths */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("project.advancedCreds")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={cfg?.creds?.useAppAzure || false}
              onChange={(e) => update("creds", {
                ...cfg.creds,
                useAppAzure: e.target.checked
              })}
            />
            <span>{t("project.useAppAzure")}</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={cfg?.creds?.useAppOpenAI || false}
              onChange={(e) => update("creds", {
                ...cfg.creds,
                useAppOpenAI: e.target.checked
              })}
            />
            <span>{t("project.useAppOpenAI")}</span>
          </label>
          <label>
            <div>{t("project.bookMetaPath")}</div>
            <input
              type="text"
              value={cfg?.creds?.paths?.bookMeta ?? ""}
              placeholder="path/to/book_meta.json"
              onChange={e => update("creds", {
                ...cfg.creds,
                paths: { ...cfg.creds?.paths, bookMeta: e.target.value }
              })}
            />
          </label>
          <label>
            <div>{t("project.productionPath")}</div>
            <input
              type="text"
              value={cfg?.creds?.paths?.production ?? ""}
              placeholder="path/to/production.json"
              onChange={e => update("creds", {
                ...cfg.creds,
                paths: { ...cfg.creds?.paths, production: e.target.value }
              })}
            />
          </label>
        </div>
      </section>

      <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={saveAll}>{t("project.save")}</button>
        <WorkflowCompleteButton step="project">
          {t("project.markComplete")}
        </WorkflowCompleteButton>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>{msg}</div>
      </div>
    </div>
  );
}
