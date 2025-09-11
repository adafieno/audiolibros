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
  const isAzureOpenAI = (engine: LlmEngine): engine is Extract<LlmEngine, { name: "azure-openai" }> => 
    engine.name === "azure-openai";
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
      
      {/* Manuscript Settings - Remove chapter pattern */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("project.manuscript")}</h3>
        <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "8px" }}>
          Chapter files are automatically detected from: analysis/chapters_txt/*.txt
        </p>
      </section>

      {/* Planning - Remove max KB and add pauses */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("project.planning")}</h3>
        <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "16px" }}>
          Configure pause durations (in milliseconds) to be inserted in the planning:
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <label>
            <div>Sentence Pause</div>
            <input
              type="number"
              value={cfg?.planning?.pauses?.sentence || 200}
              onChange={onNumber((n) => update("planning", { 
                maxKb: 4, // Hardcoded 
                pauses: { 
                  ...cfg?.planning?.pauses, 
                  sentence: n 
                }
              }))}
            />
          </label>
          <label>
            <div>Paragraph Pause</div>
            <input
              type="number"
              value={cfg?.planning?.pauses?.paragraph || 500}
              onChange={onNumber((n) => update("planning", { 
                maxKb: 4, // Hardcoded 
                pauses: { 
                  ...cfg?.planning?.pauses, 
                  paragraph: n 
                }
              }))}
            />
          </label>
          <label>
            <div>Chapter Pause</div>
            <input
              type="number"
              value={cfg?.planning?.pauses?.chapter || 1000}
              onChange={onNumber((n) => update("planning", { 
                maxKb: 4, // Hardcoded 
                pauses: { 
                  ...cfg?.planning?.pauses, 
                  chapter: n 
                }
              }))}
            />
          </label>
        </div>
      </section>

      {/* SSML Settings - Remove rate and pitch (per-segment now), keep general breaks */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("project.ssml")}</h3>
        <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "8px" }}>
          Rate and pitch are configured per segment. General break settings:
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          <label>
            <div>Default Break Duration (ms)</div>
            <input
              type="number"
              value={cfg?.ssml?.breaksMs || 0}
              onChange={onNumber((n) => update("ssml", { 
                breaksMs: n 
              }))}
            />
          </label>
        </div>
      </section>

      {/* LLM Engine - Add Azure OpenAI option */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("project.llm")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 8, alignItems: "center" }}>
          <select
            value={llm.engine.name}
            onChange={(e) => {
              const name = e.target.value as LlmEngine["name"];
              if (name === "openai") {
                update("llm", { engine: { name: "openai", model: isOpenAI(llm.engine) ? llm.engine.model : "gpt-4o" } });
              } else if (name === "azure-openai") {
                update("llm", { engine: { name: "azure-openai", model: isAzureOpenAI(llm.engine) ? llm.engine.model : "gpt-4o", endpoint: isAzureOpenAI(llm.engine) ? llm.engine.endpoint : "" } });
              } else {
                update("llm", { engine: { name: "local", model: isLocalLLM(llm.engine) ? llm.engine.model : "llama3.1", endpoint: isLocalLLM(llm.engine) ? llm.engine.endpoint : "http://localhost:8000" } });
              }
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="azure-openai">Azure OpenAI</option>
            <option value="local">Local</option>
          </select>
          {isOpenAI(llm.engine) ? (
            <input
              placeholder={t("project.llmModel")}
              value={llm.engine.model}
              onChange={(e) => update("llm", { engine: { name: "openai", model: e.target.value } })}
            />
          ) : isAzureOpenAI(llm.engine) ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <input
                placeholder="Model (gpt-4o)"
                value={llm.engine.model}
                onChange={(e) => update("llm", { engine: { name: "azure-openai", model: e.target.value, endpoint: isAzureOpenAI(llm.engine) ? llm.engine.endpoint : "", apiVersion: isAzureOpenAI(llm.engine) ? llm.engine.apiVersion : "" } })}
              />
              <input
                placeholder="Endpoint URL"
                value={isAzureOpenAI(llm.engine) ? llm.engine.endpoint : ""}
                onChange={(e) => update("llm", { engine: { name: "azure-openai", model: llm.engine.model, endpoint: e.target.value, apiVersion: isAzureOpenAI(llm.engine) ? llm.engine.apiVersion : "" } })}
              />
              <input
                placeholder="API Version (2024-02-15-preview)"
                value={isAzureOpenAI(llm.engine) ? (llm.engine.apiVersion ?? "") : ""}
                onChange={(e) => update("llm", { engine: { name: "azure-openai", model: llm.engine.model, endpoint: isAzureOpenAI(llm.engine) ? llm.engine.endpoint : "", apiVersion: e.target.value } })}
              />
            </div>
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
              onChange={(e) => update("tts", { engine: { name: "local", model: e.target.value }, cache: true })}
            />
          )}
          <div style={{ fontSize: "14px", color: "var(--muted)", gridColumn: "1 / -1" }}>
            TTS caching is always enabled for optimal performance.
          </div>
        </div>
      </section>

      {/* TTS Credentials */}
      <section style={{ marginTop: 24 }}>
        <h3>TTS Service Credentials</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label>
            <input
              type="checkbox"
              checked={cfg?.creds?.tts?.useAppAzure || false}
              onChange={(e) => update("creds", {
                ...cfg.creds,
                tts: { ...cfg.creds?.tts, useAppAzure: e.target.checked }
              })}
            />
            <span style={{ marginLeft: 8 }}>Use application Azure credentials</span>
          </label>
          <div></div>
          {!cfg?.creds?.tts?.useAppAzure && (
            <>
              <label>
                <div>Azure TTS Key</div>
                <input
                  type="text"
                  value={cfg.creds?.tts?.azure?.key ?? ""}
                  onChange={e => update("creds", {
                    ...cfg.creds,
                    tts: { 
                      ...cfg.creds?.tts, 
                      azure: { ...cfg.creds?.tts?.azure, key: e.target.value }
                    }
                  })}
                />
              </label>
              <label>
                <div>Azure Region</div>
                <input
                  type="text"
                  value={cfg.creds?.tts?.azure?.region ?? ""}
                  onChange={e => update("creds", {
                    ...cfg.creds,
                    tts: { 
                      ...cfg.creds?.tts, 
                      azure: { ...cfg.creds?.tts?.azure, region: e.target.value }
                    }
                  })}
                />
              </label>
            </>
          )}
        </div>
      </section>

      {/* LLM Credentials */}
      <section style={{ marginTop: 24 }}>
        <h3>LLM Service Credentials</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label>
            <input
              type="checkbox"
              checked={cfg?.creds?.llm?.useAppOpenAI || false}
              onChange={(e) => update("creds", {
                ...cfg.creds,
                llm: { ...cfg.creds?.llm, useAppOpenAI: e.target.checked }
              })}
            />
            <span style={{ marginLeft: 8 }}>Use application OpenAI credentials</span>
          </label>
          <div></div>
          {!cfg?.creds?.llm?.useAppOpenAI && (
            <>
              <label>
                <div>OpenAI API Key</div>
                <input
                  type="text"
                  value={cfg.creds?.llm?.openai?.apiKey ?? ""}
                  onChange={e => update("creds", {
                    ...cfg.creds,
                    llm: { 
                      ...cfg.creds?.llm, 
                      openai: { ...cfg.creds?.llm?.openai, apiKey: e.target.value }
                    }
                  })}
                />
              </label>
              <label>
                <div>OpenAI Base URL</div>
                <input
                  type="text"
                  value={cfg.creds?.llm?.openai?.baseUrl ?? ""}
                  onChange={e => update("creds", {
                    ...cfg.creds,
                    llm: { 
                      ...cfg.creds?.llm, 
                      openai: { ...cfg.creds?.llm?.openai, baseUrl: e.target.value }
                    }
                  })}
                />
              </label>
              <label>
                <div>Azure OpenAI API Key</div>
                <input
                  type="text"
                  value={cfg.creds?.llm?.azureOpenAI?.apiKey ?? ""}
                  onChange={e => update("creds", {
                    ...cfg.creds,
                    llm: { 
                      ...cfg.creds?.llm, 
                      azureOpenAI: { ...cfg.creds?.llm?.azureOpenAI, apiKey: e.target.value }
                    }
                  })}
                />
              </label>
              <label>
                <div>Azure OpenAI Endpoint</div>
                <input
                  type="text"
                  value={cfg.creds?.llm?.azureOpenAI?.endpoint ?? ""}
                  onChange={e => update("creds", {
                    ...cfg.creds,
                    llm: { 
                      ...cfg.creds?.llm, 
                      azureOpenAI: { ...cfg.creds?.llm?.azureOpenAI, endpoint: e.target.value }
                    }
                  })}
                />
              </label>
            </>
          )}
        </div>
      </section>

      {/* Packaging Settings */}
      <section style={{ marginTop: 24 }}>
        <h3>Packaging</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          <label>
            <div>Output Directory</div>
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
            <div style={{ marginBottom: 8 }}>Target Platforms</div>
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
                <span>Apple Books</span>
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
                <span>Google Play</span>
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
                <span>Spotify</span>
              </label>
            </div>
          </div>
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
