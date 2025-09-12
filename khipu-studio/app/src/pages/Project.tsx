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

// Password field component with visibility toggle
function PasswordField({ 
  label, 
  value, 
  onChange, 
  placeholder 
}: { 
  label: string; 
  value: string; 
  onChange: (value: string) => void; 
  placeholder?: string; 
}) {
  const [showPassword, setShowPassword] = useState(false);
  
  return (
    <label>
      <div>{label}</div>
      <div style={{ position: "relative" }}>
        <input
          type={showPassword ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{ paddingRight: "32px" }}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          style={{
            position: "absolute",
            right: "4px",
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "16px",
            color: "var(--muted)",
            padding: "2px",
            borderRadius: "2px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "24px",
            height: "24px"
          }}
        >
          {showPassword ? "🙈" : "👁️"}
        </button>
      </div>
    </label>
  );
}

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
      
      {/* Planning - Remove max KB and add pauses */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("project.planning")}</h3>
        <p style={{ fontSize: "14px", color: "var(--muted)", marginBottom: "16px" }}>
          {t("project.pauseConfiguration")}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          <label>
            <div>{t("project.sentencePause")}</div>
            <input
              type="number"
              value={cfg?.pauses?.sentenceMs || 500}
              onChange={onNumber((n) => update("pauses", { 
                ...cfg?.pauses, 
                sentenceMs: n 
              }))}
            />
          </label>
          <label>
            <div>{t("project.paragraphPause")}</div>
            <input
              type="number"
              value={cfg?.pauses?.paragraphMs || 1000}
              onChange={onNumber((n) => update("pauses", { 
                ...cfg?.pauses, 
                paragraphMs: n 
              }))}
            />
          </label>
          <label>
            <div>{t("project.chapterPause")}</div>
            <input
              type="number"
              value={cfg?.pauses?.chapterMs || 3000}
              onChange={onNumber((n) => update("pauses", { 
                ...cfg?.pauses, 
                chapterMs: n 
              }))}
            />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <label>
            <div>{t("project.commaPause")}</div>
            <input
              type="number"
              value={cfg?.pauses?.commaMs || 300}
              onChange={onNumber((n) => update("pauses", { 
                ...cfg?.pauses, 
                commaMs: n 
              }))}
            />
          </label>
          <label>
            <div>{t("project.colonPause")}</div>
            <input
              type="number"
              value={cfg?.pauses?.colonMs || 400}
              onChange={onNumber((n) => update("pauses", { 
                ...cfg?.pauses, 
                colonMs: n 
              }))}
            />
          </label>
          <label>
            <div>{t("project.semicolonPause")}</div>
            <input
              type="number"
              value={cfg?.pauses?.semicolonMs || 350}
              onChange={onNumber((n) => update("pauses", { 
                ...cfg?.pauses, 
                semicolonMs: n 
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
            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 200px", gap: 8 }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 8 }}>
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

        {/* OpenAI Credentials - Show only when OpenAI is selected */}
        {isOpenAI(llm.engine) && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ fontSize: "16px", marginBottom: 12 }}>{t("project.openaiCredentials")}</h4>
            <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 12, alignItems: "start" }}>
              <PasswordField
                label={t("project.openaiApiKey")}
                value={cfg?.creds?.llm?.openai?.apiKey || ""}
                onChange={(value) => update("creds", {
                  ...cfg?.creds,
                  llm: { 
                    ...cfg?.creds?.llm, 
                    openai: { ...cfg?.creds?.llm?.openai, apiKey: value }
                  }
                })}
                placeholder="sk-..."
              />
              <label>
                <div>{t("project.openaiBaseUrl")}</div>
                <input
                  type="text"
                  value={cfg?.creds?.llm?.openai?.baseUrl || ""}
                  placeholder="https://api.openai.com/v1"
                  onChange={(e) => update("creds", {
                    ...cfg?.creds,
                    llm: { 
                      ...cfg?.creds?.llm, 
                      openai: { ...cfg?.creds?.llm?.openai, baseUrl: e.target.value }
                    }
                  })}
                />
              </label>
            </div>
          </div>
        )}

        {/* Azure OpenAI Credentials - Show only when Azure OpenAI is selected */}
        {isAzureOpenAI(llm.engine) && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ fontSize: "16px", marginBottom: 12 }}>{t("project.azureOpenaiCredentials")}</h4>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
              <PasswordField
                label={t("project.azureOpenaiApiKey")}
                value={cfg?.creds?.llm?.azureOpenAI?.apiKey || ""}
                onChange={(value) => update("creds", {
                  ...cfg?.creds,
                  llm: { 
                    ...cfg?.creds?.llm, 
                    azureOpenAI: { ...cfg?.creds?.llm?.azureOpenAI, apiKey: value }
                  }
                })}
                placeholder={t("project.azureOpenaiApiKeyPlaceholder")}
              />
            </div>
          </div>
        )}
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
            {t("project.ttsCachingInfo")}
          </div>
        </div>
        
        {/* Azure TTS Credentials - Show only when Azure is selected */}
        {isAzureTTS(tts.engine) && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ fontSize: "16px", marginBottom: 12 }}>{t("project.azureTtsCredentials")}</h4>
            <div style={{ display: "grid", gridTemplateColumns: "300px 200px", gap: 12, alignItems: "start" }}>
              <PasswordField
                label={t("project.azureTtsKey")}
                value={cfg?.creds?.tts?.azure?.key || ""}
                onChange={(value) => update("creds", {
                  ...cfg?.creds,
                  tts: { 
                    ...cfg?.creds?.tts, 
                    azure: { ...cfg?.creds?.tts?.azure, key: value }
                  }
                })}
                placeholder="Enter Azure TTS API key"
              />
              <label>
                <div>{t("project.azureRegion")}</div>
                <input
                  type="text"
                  value={cfg?.creds?.tts?.azure?.region || ""}
                  placeholder="e.g., eastus"
                  onChange={(e) => update("creds", {
                    ...cfg?.creds,
                    tts: { 
                      ...cfg?.creds?.tts, 
                      azure: { ...cfg?.creds?.tts?.azure, region: e.target.value }
                    }
                  })}
                />
              </label>
            </div>
          </div>
        )}
      </section>

      {/* Packaging Settings */}
      <section style={{ marginTop: 24 }}>
        <h3>{t("project.packaging")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
          <label>
            <div>{t("project.outputDirectory")}</div>
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
            <div style={{ marginBottom: 8 }}>{t("project.targetPlatforms")}</div>
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
