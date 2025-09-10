import type { Voice } from "../types/voice";
import type { ProjectConfig } from "../types/config";

// Default audition text in multiple languages
const AUDITION_TEXTS: Record<string, string> = {
  "en-US": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  "en": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  "es-PE": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-ES": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-MX": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-US": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-EC": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "default": "Hello, this is a voice audition sample for your audiobook project."
};

// Token cache for Azure (following Python implementation pattern)
interface TokenCache {
  token: string | null;
  expiresAt: number; // epoch timestamp
  region: string;
}

const azureTokenCache: TokenCache = {
  token: null,
  expiresAt: 0,
  region: ""
};

export interface AuditionOptions {
  voice: Voice;
  config: ProjectConfig;
  text?: string;
  style?: string;
  styledegree?: number;
  rate_pct?: number;
  pitch_pct?: number;
}

export interface AuditionResult {
  success: boolean;
  audioUrl?: string;
  error?: string;
}

/**
 * Sleep with exponential backoff and jitter (following Python implementation)
 */
function sleepBackoff(attempt: number, base: number = 0.75, cap: number = 8.0): Promise<void> {
  const delay = Math.min(cap, base * Math.pow(2, attempt)) * (0.6 + Math.random() * 0.8);
  return new Promise(resolve => setTimeout(resolve, delay * 1000));
}

/**
 * Sleep based on Retry-After header (following Python implementation)
 */
function sleepRetryAfter(retryAfterHeader: string | null): Promise<boolean> {
  if (!retryAfterHeader) return Promise.resolve(false);
  
  const headerValue = retryAfterHeader.trim();
  
  // Check if it's numeric seconds
  if (/^\d+$/.test(headerValue)) {
    const seconds = Math.max(0, parseInt(headerValue));
    return new Promise(resolve => {
      setTimeout(() => resolve(true), seconds * 1000);
    });
  }
  
  // Try to parse as HTTP date
  try {
    const date = new Date(headerValue);
    if (!isNaN(date.getTime())) {
      const delayMs = Math.max(0, date.getTime() - Date.now());
      return new Promise(resolve => {
        setTimeout(() => resolve(true), delayMs);
      });
    }
  } catch {
    // Invalid date format, ignore
  }
  
  return Promise.resolve(false);
}

/**
 * Strip BOM from string (following Python implementation)
 */
function stripBom(text: string): string {
  if (text && text.charCodeAt(0) === 0xFEFF) {
    return text.slice(1);
  }
  return text;
}

/**
 * Validate and preprocess SSML (following Python implementation)
 */
function preflightSsml(ssmlXml: string, maxChars: number = 5000): string {
  const cleaned = stripBom(ssmlXml || "");
  if (!cleaned.trim()) {
    throw new Error("SSML is empty or contains only whitespace");
  }
  if (cleaned.length > maxChars) {
    console.warn(`SSML length (${cleaned.length}) exceeds recommended maximum (${maxChars})`);
  }
  return cleaned;
}

/**
 * Get or refresh Azure access token (following Python implementation pattern)
 */
async function getAzureToken(region: string, key: string, timeout: number = 10000): Promise<string> {
  const now = Date.now();
  
  // Check if we have a valid cached token for this region
  if (azureTokenCache.token && 
      azureTokenCache.region === region && 
      now < azureTokenCache.expiresAt) {
    return azureTokenCache.token;
  }
  
  // Fetch new token
  const tokenUrl = `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Length": "0",
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Failed to get Azure token: ${response.status} ${response.statusText}`);
    }
    
    const token = await response.text();
    
    // Cache token with 9-minute expiration (following Python implementation)
    azureTokenCache.token = token.trim();
    azureTokenCache.region = region;
    azureTokenCache.expiresAt = now + (9 * 60 * 1000); // 9 minutes
    
    return azureTokenCache.token;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get audition text for the given locale with intelligent fallback
 */
function getAuditionText(locale: string, customText?: string): string {
  if (customText) return customText;
  
  // Try exact locale match first
  if (AUDITION_TEXTS[locale]) {
    return AUDITION_TEXTS[locale];
  }
  
  // Try language code fallback (e.g., "es-AR" -> "es")
  const language = locale.split('-')[0];
  if (AUDITION_TEXTS[language]) {
    return AUDITION_TEXTS[language];
  }
  
  // Final fallback
  return AUDITION_TEXTS["default"];
}

/**
 * Generate TTS audition for Azure Speech Services (enhanced following Python implementation)
 */
async function auditAzureVoice(voice: Voice, config: ProjectConfig, text: string, options?: { style?: string; styledegree?: number; rate_pct?: number; pitch_pct?: number }): Promise<AuditionResult> {
  // Handle both useAppAzure and project-level credentials
  let credentials: { key?: string; region?: string } | undefined;
  
  if (config.creds?.useAppAzure) {
    // Use app-level credentials - these should be provided via IPC or configuration
    // For now, return an error as this feature needs to be implemented
    return { success: false, error: "App-level Azure credentials not implemented yet. Please configure project-level credentials." };
  } else {
    // Use project-level credentials
    credentials = config.creds?.azure;
  }
  
  if (!credentials?.key || !credentials?.region) {
    console.error("❌ Azure TTS Error: Missing credentials", { 
      hasKey: !!credentials?.key, 
      hasRegion: !!credentials?.region,
      useAppAzure: config.creds?.useAppAzure 
    });
    return { success: false, error: "Azure credentials not configured in project. Please add Azure key and region in Project settings." };
  }

  console.log("🎤 Azure TTS: Attempting audition", { 
    voice: voice.id, 
    locale: voice.locale,
    hasKey: !!credentials.key,
    hasRegion: !!credentials.region,
    region: credentials.region 
  });
  
  const maxRetries = 4;
  const timeoutMs = 30000;
  const retryStatuses = new Set([408, 429, 500, 502, 503, 504]);
  
  // Preprocess SSML
  const ssmlText = preflightSsml(text);
  
  // Build prosody attributes
  let prosodyAttrs = "";
  if (options?.rate_pct) {
    prosodyAttrs += ` rate="${options.rate_pct > 0 ? '+' : ''}${options.rate_pct}%"`;
  }
  if (options?.pitch_pct) {
    prosodyAttrs += ` pitch="${options.pitch_pct > 0 ? '+' : ''}${options.pitch_pct}%"`;
  }
  
  // Build SSML with proper nesting: voice -> express-as (if style) -> prosody (if prosody attrs) -> text
  let innerContent = ssmlText;
  
  // Wrap in prosody if we have prosody attributes
  if (prosodyAttrs) {
    innerContent = `<prosody${prosodyAttrs}>${innerContent}</prosody>`;
  }
  
  // Wrap in express-as if we have style
  if (options?.style && options.style !== "none") {
    const styledegree = options?.styledegree !== undefined ? ` styledegree="${options.styledegree}"` : "";
    innerContent = `<mstts:express-as style="${options.style}"${styledegree}>${innerContent}</mstts:express-as>`;
  }
  
  const ssml = `
    <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${voice.locale}">
      <voice name="${voice.id}">
        ${innerContent}
      </voice>
    </speak>
  `;
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Get fresh token if needed
      const token = await getAzureToken(credentials.region, credentials.key, 10000);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const response = await fetch(
          `https://${credentials.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/ssml+xml; charset=utf-8",
              "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
              "User-Agent": "KhipuStudio/1.0",
              "Accept": "*/*",
              "Connection": "keep-alive",
            },
            body: ssml,
            signal: controller.signal,
          }
        );
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          return { success: true, audioUrl };
        }
        
        // Handle token expiration (401/403)
        if (response.status === 401 || response.status === 403) {
          azureTokenCache.token = null;
          azureTokenCache.expiresAt = 0;
        }
        
        // Handle rate limiting (429)
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          if (await sleepRetryAfter(retryAfter)) {
            continue; // Don't count as attempt if we used Retry-After
          } else {
            await sleepBackoff(attempt);
          }
          lastError = new Error(`Rate limited (429) on attempt ${attempt + 1}`);
          continue;
        }
        
        // Handle retryable errors
        if (retryStatuses.has(response.status)) {
          await sleepBackoff(attempt);
          lastError = new Error(`HTTP ${response.status} on attempt ${attempt + 1}: ${response.statusText}`);
          continue;
        }
        
        // Non-retryable error
        const errorText = await response.text().catch(() => "");
        return { 
          success: false, 
          error: `Azure TTS error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText.slice(0, 200)}` : ""}` 
        };
        
      } finally {
        clearTimeout(timeoutId);
      }
      
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        lastError = new Error(`Request timeout on attempt ${attempt + 1}`);
      } else if (error instanceof TypeError && error.message.includes("fetch")) {
        lastError = new Error(`Network error on attempt ${attempt + 1}: ${error.message}`);
      } else {
        lastError = error instanceof Error ? error : new Error(`Unknown error on attempt ${attempt + 1}`);
      }
      
      if (attempt < maxRetries) {
        await sleepBackoff(attempt);
      }
    }
  }
  
  return { 
    success: false, 
    error: `Azure TTS failed after ${maxRetries + 1} attempts: ${lastError?.message || "Unknown error"}` 
  };
}

/**
 * Generate TTS audition for ElevenLabs (enhanced with retry logic)
 */
async function auditElevenLabsVoice(voice: Voice, config: ProjectConfig, text: string): Promise<AuditionResult> {
  const credentials = config.creds?.openai; // Reusing OpenAI creds section for ElevenLabs
  if (!credentials?.apiKey) {
    return { success: false, error: "ElevenLabs API key not configured" };
  }
  
  const maxRetries = 3;
  const timeoutMs = 30000;
  const retryStatuses = new Set([429, 500, 502, 503, 504]);
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}`,
          {
            method: "POST",
            headers: {
              "Accept": "audio/mpeg",
              "Content-Type": "application/json",
              "xi-api-key": credentials.apiKey,
            },
            body: JSON.stringify({
              text: preflightSsml(text),
              model_id: "eleven_monolingual_v1",
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.5,
              },
            }),
            signal: controller.signal,
          }
        );
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          return { success: true, audioUrl };
        }
        
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          if (await sleepRetryAfter(retryAfter)) {
            continue;
          } else {
            await sleepBackoff(attempt);
          }
          lastError = new Error(`Rate limited (429) on attempt ${attempt + 1}`);
          continue;
        }
        
        // Handle retryable errors
        if (retryStatuses.has(response.status)) {
          await sleepBackoff(attempt);
          lastError = new Error(`HTTP ${response.status} on attempt ${attempt + 1}: ${response.statusText}`);
          continue;
        }
        
        // Non-retryable error
        const errorText = await response.text().catch(() => "");
        return { 
          success: false, 
          error: `ElevenLabs TTS error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText.slice(0, 200)}` : ""}` 
        };
        
      } finally {
        clearTimeout(timeoutId);
      }
      
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        lastError = new Error(`Request timeout on attempt ${attempt + 1}`);
      } else if (error instanceof TypeError && error.message.includes("fetch")) {
        lastError = new Error(`Network error on attempt ${attempt + 1}: ${error.message}`);
      } else {
        lastError = error instanceof Error ? error : new Error(`Unknown error on attempt ${attempt + 1}`);
      }
      
      if (attempt < maxRetries) {
        await sleepBackoff(attempt);
      }
    }
  }
  
  return { 
    success: false, 
    error: `ElevenLabs TTS failed after ${maxRetries + 1} attempts: ${lastError?.message || "Unknown error"}` 
  };
}

/**
 * Generate TTS audition for OpenAI (enhanced with retry logic)
 */
async function auditOpenAIVoice(voice: Voice, config: ProjectConfig, text: string): Promise<AuditionResult> {
  const credentials = config.creds?.openai;
  if (!credentials?.apiKey) {
    return { success: false, error: "OpenAI API key not configured" };
  }
  
  const maxRetries = 3;
  const timeoutMs = 30000;
  const retryStatuses = new Set([429, 500, 502, 503, 504]);
  const baseUrl = credentials.baseUrl || "https://api.openai.com";
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const response = await fetch(`${baseUrl}/v1/audio/speech`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${credentials.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "tts-1",
            input: preflightSsml(text),
            voice: voice.id,
            response_format: "mp3",
          }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);
          return { success: true, audioUrl };
        }
        
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          if (await sleepRetryAfter(retryAfter)) {
            continue;
          } else {
            await sleepBackoff(attempt);
          }
          lastError = new Error(`Rate limited (429) on attempt ${attempt + 1}`);
          continue;
        }
        
        // Handle retryable errors
        if (retryStatuses.has(response.status)) {
          await sleepBackoff(attempt);
          lastError = new Error(`HTTP ${response.status} on attempt ${attempt + 1}: ${response.statusText}`);
          continue;
        }
        
        // Non-retryable error
        const errorText = await response.text().catch(() => "");
        return { 
          success: false, 
          error: `OpenAI TTS error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText.slice(0, 200)}` : ""}` 
        };
        
      } finally {
        clearTimeout(timeoutId);
      }
      
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        lastError = new Error(`Request timeout on attempt ${attempt + 1}`);
      } else if (error instanceof TypeError && error.message.includes("fetch")) {
        lastError = new Error(`Network error on attempt ${attempt + 1}: ${error.message}`);
      } else {
        lastError = error instanceof Error ? error : new Error(`Unknown error on attempt ${attempt + 1}`);
      }
      
      if (attempt < maxRetries) {
        await sleepBackoff(attempt);
      }
    }
  }
  
  return { 
    success: false, 
    error: `OpenAI TTS failed after ${maxRetries + 1} attempts: ${lastError?.message || "Unknown error"}` 
  };
}

/**
 * Generate TTS audition for any supported engine with automatic caching
 */
export async function generateAudition(options: AuditionOptions): Promise<AuditionResult> {
  // Check if caching is enabled in the config (defaults to true)
  const useCache = options.config.tts?.cache !== false;
  
  if (useCache) {
    // Use the cached version for better performance
    const { generateCachedAudition } = await import("./audio-cache");
    return generateCachedAudition(options, true);
  }
  
  // Fall back to direct generation
  return generateAuditionDirect(options);
}

/**
 * Generate TTS audition directly without caching
 */
export async function generateAuditionDirect(options: AuditionOptions): Promise<AuditionResult> {
  const { voice, config } = options;
  const text = getAuditionText(voice.locale, options.text);

  // Extract prosody options for engines that support them
  const prosodyOptions = {
    style: options.style,
    styledegree: options.styledegree,
    rate_pct: options.rate_pct,
    pitch_pct: options.pitch_pct
  };

  switch (voice.engine) {
    case "azure":
      return auditAzureVoice(voice, config, text, prosodyOptions);
    
    case "elevenlabs":
      return auditElevenLabsVoice(voice, config, text);
    
    case "openai":
      return auditOpenAIVoice(voice, config, text);
    
    case "google":
      return { 
        success: false, 
        error: "Google Cloud TTS auditions not yet implemented" 
      };
    
    case "local":
      return { 
        success: false, 
        error: "Local TTS auditions not yet implemented" 
      };
    
    default:
      return { 
        success: false, 
        error: `Unsupported TTS engine: ${voice.engine}` 
      };
  }
}

/**
 * Clean up audio URL to prevent memory leaks
 */
export function cleanupAudioUrl(audioUrl: string) {
  if (audioUrl.startsWith("blob:")) {
    URL.revokeObjectURL(audioUrl);
  }
}
