import type { Voice } from "../types/voice";
import type { ProjectConfig } from "../types/config";

// Default audition text in multiple languages
const AUDITION_TEXTS: Record<string, string> = {
  // English variants
  "en-US": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  "en-GB": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  "en-AU": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  "en-CA": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  "en-IE": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  "en-IN": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  "en-NZ": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  "en-ZA": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  "en-SG": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  "en-HK": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  "en-PH": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  "en-KE": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  "en-NG": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  "en-TZ": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  "en": "Hello, I'm a voice you can use for your audiobook. This is a sample of how I sound when reading your content.",
  
  // Spanish variants
  "es-AR": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-BO": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-CL": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-CO": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-CR": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-CU": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-DO": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-EC": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-ES": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-GQ": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-GT": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-HN": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-MX": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-NI": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-PA": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-PE": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-PR": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-PY": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-SV": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-US": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-UY": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es-VE": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",
  "es": "Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.",

  // French variants
  "fr-FR": "Bonjour, je suis une voix que vous pouvez utiliser pour votre livre audio. Ceci est un échantillon de la façon dont je sonne quand je lis votre contenu.",
  "fr-CA": "Bonjour, je suis une voix que vous pouvez utiliser pour votre livre audio. Ceci est un échantillon de la façon dont je sonne quand je lis votre contenu.",
  "fr": "Bonjour, je suis une voix que vous pouvez utiliser pour votre livre audio. Ceci est un échantillon de la façon dont je sonne quand je lis votre contenu.",

  // German variants  
  "de-DE": "Hallo, ich bin eine Stimme, die Sie für Ihr Hörbuch verwenden können. Dies ist eine Probe davon, wie ich klinge, wenn ich Ihren Inhalt lese.",
  "de-AT": "Hallo, ich bin eine Stimme, die Sie für Ihr Hörbuch verwenden können. Dies ist eine Probe davon, wie ich klinge, wenn ich Ihren Inhalt lese.",
  "de-CH": "Hallo, ich bin eine Stimme, die Sie für Ihr Hörbuch verwenden können. Dies ist eine Probe davon, wie ich klinge, wenn ich Ihren Inhalt lese.",
  "de": "Hallo, ich bin eine Stimme, die Sie für Ihr Hörbuch verwenden können. Dies ist eine Probe davon, wie ich klinge, wenn ich Ihren Inhalt lese.",

  // Italian variants
  "it-IT": "Ciao, sono una voce che puoi usare per il tuo audiolibro. Questo è un esempio di come suono quando leggo il tuo contenuto.",
  "it": "Ciao, sono una voce che puoi usare per il tuo audiolibro. Questo è un esempio di come suono quando leggo il tuo contenuto.",

  // Portuguese variants
  "pt-BR": "Olá, sou uma voz que você pode usar para seu audiolivro. Esta é uma amostra de como eu soou quando leio seu conteúdo.",
  "pt-PT": "Olá, sou uma voz que pode usar para o seu audiolivro. Esta é uma amostra de como soou quando leio o seu conteúdo.",
  "pt": "Olá, sou uma voz que você pode usar para seu audiolivro. Esta é uma amostra de como eu soou quando leio seu conteúdo.",

  // Chinese variants
  "zh-CN": "你好，我是一个可以用于您的有声书的语音。这是我阅读您的内容时声音的样本。",
  "zh-HK": "你好，我是一個可以用於您的有聲書的語音。這是我閱讀您的內容時聲音的樣本。",
  "zh-TW": "你好，我是一個可以用於您的有聲書的語音。這是我閱讀您的內容時聲音的樣本。",
  "zh": "你好，我是一个可以用于您的有声书的语音。这是我阅读您的内容时声音的样本。",

  // Japanese
  "ja-JP": "こんにちは、私はあなたのオーディオブックに使用できる音声です。これは、私があなたのコンテンツを読むときの音のサンプルです。",
  "ja": "こんにちは、私はあなたのオーディオブックに使用できる音声です。これは、私があなたのコンテンツを読むときの音のサンプルです。",

  // Korean
  "ko-KR": "안녕하세요, 저는 오디오북에 사용할 수 있는 음성입니다. 이것은 제가 당신의 콘텐츠를 읽을 때 어떤 소리를 내는지에 대한 샘플입니다.",
  "ko": "안녕하세요, 저는 오디오북에 사용할 수 있는 음성입니다. 이것은 제가 당신의 콘텐츠를 읽을 때 어떤 소리를 내는지에 대한 샘플입니다.",

  // Hindi
  "hi-IN": "नमस्ते, मैं एक आवाज़ हूँ जिसका उपयोग आप अपनी ऑडियो बुक के लिए कर सकते हैं। यह इस बात का नमूना है कि जब मैं आपकी सामग्री पढ़ती हूँ तो मैं कैसी आवाज़ करती हूँ।",
  "hi": "नमस्ते, मैं एक आवाज़ हूँ जिसका उपयोग आप अपनी ऑडियो बुक के लिए कर सकते हैं। यह इस बात का नमूना है कि जब मैं आपकी सामग्री पढ़ती हूँ तो मैं कैसी आवाज़ करती हूँ।",

  // Arabic variants
  "ar-AE": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
  "ar-BH": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
  "ar-DZ": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
  "ar-EG": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
  "ar-IQ": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
  "ar-JO": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
  "ar-KW": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
  "ar-LB": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
  "ar-LY": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
  "ar-MA": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",
  "ar": "مرحبا، أنا صوت يمكنك استخدامه لكتابك الصوتي. هذه عينة من صوتي عندما أقرأ محتواك.",

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
  
  console.log('🔍 Debug - Azure Token Request:', {
    region,
    hasKey: !!key,
    keyLength: key?.length,
    hasCachedToken: !!azureTokenCache.token,
    cacheRegion: azureTokenCache.region,
    cacheExpired: now >= azureTokenCache.expiresAt
  });
  
  // Check if we have a valid cached token for this region
  if (azureTokenCache.token && 
      azureTokenCache.region === region && 
      now < azureTokenCache.expiresAt) {
    console.log('✅ Using cached Azure token');
    return azureTokenCache.token;
  }
  
  // Fetch new token
  const tokenUrl = `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
  
  console.log('🔄 Fetching new Azure token from:', tokenUrl);
  
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
    
    console.log('🔍 Debug - Azure Token Response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('❌ Azure token request failed:', { 
        status: response.status, 
        statusText: response.statusText,
        error: errorText 
      });
      throw new Error(`Failed to get Azure token: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
    }
    
    const token = await response.text();
    
    console.log('✅ Azure token obtained successfully, length:', token.trim().length);
    
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
 * Get audition text for the given locale with intelligent fallback and project pauses
 */
function getAuditionText(locale: string, config: ProjectConfig, customText?: string): string {
  let text = customText;

  if (!text) {
    // Try exact locale match first
    if (AUDITION_TEXTS[locale]) {
      text = AUDITION_TEXTS[locale];
    } else {
      // Try language code fallback (e.g., "es-AR" -> "es")
      const language = locale.split('-')[0];
      if (AUDITION_TEXTS[language]) {
        text = AUDITION_TEXTS[language];
      } else {
        // Final fallback
        text = AUDITION_TEXTS["default"];
      }
    }
  }

  // Apply project pause settings to make auditions more representative
  if (config.pauses) {
    const pauses = config.pauses;
    
    // Add sentence pauses (replace periods, exclamation marks, question marks)
    if (pauses.sentenceMs !== undefined) {
      text = text.replace(/[.!?]+/g, match => {
        const breakTime = Math.round(pauses.sentenceMs! / 100) / 10; // Convert ms to seconds with 1 decimal
        return `${match}<break time="${breakTime}s"/>`;
      });
    }
    
    // Add comma pauses if configured
    if (pauses.commaMs !== undefined) {
      text = text.replace(/,/g, () => {
        const breakTime = Math.round(pauses.commaMs! / 100) / 10; // Convert ms to seconds with 1 decimal
        return `,<break time="${breakTime}s"/>`;
      });
    }
    
    // Add colon pauses if configured
    if (pauses.colonMs !== undefined) {
      text = text.replace(/:/g, () => {
        const breakTime = Math.round(pauses.colonMs! / 100) / 10; // Convert ms to seconds with 1 decimal
        return `:<break time="${breakTime}s"/>`;
      });
    }
  }

  return text;
}

/**
 * Generate TTS audition for Azure Speech Services (enhanced following Python implementation)
 */
async function auditAzureVoice(voice: Voice, config: ProjectConfig, text: string, options?: { style?: string; styledegree?: number; rate_pct?: number; pitch_pct?: number }): Promise<AuditionResult> {
  // Use TTS-specific credentials
  const credentials = config.creds?.tts?.azure;
  
  if (!credentials?.key || !credentials?.region) {
    console.error("❌ Azure TTS Error: Missing credentials", { 
      hasKey: !!credentials?.key, 
      hasRegion: !!credentials?.region
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
      
      const url = `https://${credentials.region}.tts.speech.microsoft.com/cognitiveservices/v1`;
      console.log(`🔍 Debug - Azure TTS Request (attempt ${attempt + 1}):`, {
        url,
        hasToken: !!token,
        tokenLength: token?.length,
        region: credentials.region,
        textLength: text.length
      });
      
      try {
        const response = await fetch(url, {
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
  const credentials = config.creds?.llm?.openai; // Reusing OpenAI creds section for ElevenLabs
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
  const credentials = config.creds?.llm?.openai;
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
  const text = getAuditionText(voice.locale, config, options.text);

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
