// Comprehensive list of Azure Text-to-Speech supported locales
// This list is based on Azure Cognitive Services Speech Service supported languages
// https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support

export interface LocaleInfo {
  code: string;
  name: string;
  englishName: string;
  region?: string;
}

export const SUPPORTED_LOCALES: LocaleInfo[] = [
  // Arabic
  { code: "ar-AE", name: "العربية (الإمارات)", englishName: "Arabic (United Arab Emirates)" },
  { code: "ar-BH", name: "العربية (البحرين)", englishName: "Arabic (Bahrain)" },
  { code: "ar-DZ", name: "العربية (الجزائر)", englishName: "Arabic (Algeria)" },
  { code: "ar-EG", name: "العربية (مصر)", englishName: "Arabic (Egypt)" },
  { code: "ar-IQ", name: "العربية (العراق)", englishName: "Arabic (Iraq)" },
  { code: "ar-JO", name: "العربية (الأردن)", englishName: "Arabic (Jordan)" },
  { code: "ar-KW", name: "العربية (الكويت)", englishName: "Arabic (Kuwait)" },
  { code: "ar-LB", name: "العربية (لبنان)", englishName: "Arabic (Lebanon)" },
  { code: "ar-LY", name: "العربية (ليبيا)", englishName: "Arabic (Libya)" },
  { code: "ar-MA", name: "العربية (المغرب)", englishName: "Arabic (Morocco)" },
  { code: "ar-OM", name: "العربية (عُمان)", englishName: "Arabic (Oman)" },
  { code: "ar-QA", name: "العربية (قطر)", englishName: "Arabic (Qatar)" },
  { code: "ar-SA", name: "العربية (السعودية)", englishName: "Arabic (Saudi Arabia)" },
  { code: "ar-SY", name: "العربية (سوريا)", englishName: "Arabic (Syria)" },
  { code: "ar-TN", name: "العربية (تونس)", englishName: "Arabic (Tunisia)" },
  { code: "ar-YE", name: "العربية (اليمن)", englishName: "Arabic (Yemen)" },

  // Bulgarian
  { code: "bg-BG", name: "Български (България)", englishName: "Bulgarian (Bulgaria)" },

  // Catalan
  { code: "ca-ES", name: "Català (Espanya)", englishName: "Catalan (Spain)" },

  // Czech
  { code: "cs-CZ", name: "Čeština (Česká republika)", englishName: "Czech (Czech Republic)" },

  // Danish
  { code: "da-DK", name: "Dansk (Danmark)", englishName: "Danish (Denmark)" },

  // German
  { code: "de-AT", name: "Deutsch (Österreich)", englishName: "German (Austria)" },
  { code: "de-CH", name: "Deutsch (Schweiz)", englishName: "German (Switzerland)" },
  { code: "de-DE", name: "Deutsch (Deutschland)", englishName: "German (Germany)" },

  // Greek
  { code: "el-GR", name: "Ελληνικά (Ελλάδα)", englishName: "Greek (Greece)" },

  // English
  { code: "en-AU", name: "English (Australia)", englishName: "English (Australia)" },
  { code: "en-CA", name: "English (Canada)", englishName: "English (Canada)" },
  { code: "en-GB", name: "English (United Kingdom)", englishName: "English (United Kingdom)" },
  { code: "en-HK", name: "English (Hong Kong)", englishName: "English (Hong Kong)" },
  { code: "en-IE", name: "English (Ireland)", englishName: "English (Ireland)" },
  { code: "en-IN", name: "English (India)", englishName: "English (India)" },
  { code: "en-KE", name: "English (Kenya)", englishName: "English (Kenya)" },
  { code: "en-NG", name: "English (Nigeria)", englishName: "English (Nigeria)" },
  { code: "en-NZ", name: "English (New Zealand)", englishName: "English (New Zealand)" },
  { code: "en-PH", name: "English (Philippines)", englishName: "English (Philippines)" },
  { code: "en-SG", name: "English (Singapore)", englishName: "English (Singapore)" },
  { code: "en-TZ", name: "English (Tanzania)", englishName: "English (Tanzania)" },
  { code: "en-US", name: "English (United States)", englishName: "English (United States)" },
  { code: "en-ZA", name: "English (South Africa)", englishName: "English (South Africa)" },

  // Spanish
  { code: "es-AR", name: "Español (Argentina)", englishName: "Spanish (Argentina)" },
  { code: "es-BO", name: "Español (Bolivia)", englishName: "Spanish (Bolivia)" },
  { code: "es-CL", name: "Español (Chile)", englishName: "Spanish (Chile)" },
  { code: "es-CO", name: "Español (Colombia)", englishName: "Spanish (Colombia)" },
  { code: "es-CR", name: "Español (Costa Rica)", englishName: "Spanish (Costa Rica)" },
  { code: "es-CU", name: "Español (Cuba)", englishName: "Spanish (Cuba)" },
  { code: "es-DO", name: "Español (República Dominicana)", englishName: "Spanish (Dominican Republic)" },
  { code: "es-EC", name: "Español (Ecuador)", englishName: "Spanish (Ecuador)" },
  { code: "es-ES", name: "Español (España)", englishName: "Spanish (Spain)" },
  { code: "es-GQ", name: "Español (Guinea Ecuatorial)", englishName: "Spanish (Equatorial Guinea)" },
  { code: "es-GT", name: "Español (Guatemala)", englishName: "Spanish (Guatemala)" },
  { code: "es-HN", name: "Español (Honduras)", englishName: "Spanish (Honduras)" },
  { code: "es-MX", name: "Español (México)", englishName: "Spanish (Mexico)" },
  { code: "es-NI", name: "Español (Nicaragua)", englishName: "Spanish (Nicaragua)" },
  { code: "es-PA", name: "Español (Panamá)", englishName: "Spanish (Panama)" },
  { code: "es-PE", name: "Español (Perú)", englishName: "Spanish (Peru)" },
  { code: "es-PR", name: "Español (Puerto Rico)", englishName: "Spanish (Puerto Rico)" },
  { code: "es-PY", name: "Español (Paraguay)", englishName: "Spanish (Paraguay)" },
  { code: "es-SV", name: "Español (El Salvador)", englishName: "Spanish (El Salvador)" },
  { code: "es-US", name: "Español (Estados Unidos)", englishName: "Spanish (United States)" },
  { code: "es-UY", name: "Español (Uruguay)", englishName: "Spanish (Uruguay)" },
  { code: "es-VE", name: "Español (Venezuela)", englishName: "Spanish (Venezuela)" },

  // Estonian
  { code: "et-EE", name: "Eesti (Eesti)", englishName: "Estonian (Estonia)" },

  // Basque
  { code: "eu-ES", name: "Euskera (Espainia)", englishName: "Basque (Spain)" },

  // Finnish
  { code: "fi-FI", name: "Suomi (Suomi)", englishName: "Finnish (Finland)" },

  // French
  { code: "fr-BE", name: "Français (Belgique)", englishName: "French (Belgium)" },
  { code: "fr-CA", name: "Français (Canada)", englishName: "French (Canada)" },
  { code: "fr-CH", name: "Français (Suisse)", englishName: "French (Switzerland)" },
  { code: "fr-FR", name: "Français (France)", englishName: "French (France)" },

  // Galician
  { code: "gl-ES", name: "Galego (España)", englishName: "Galician (Spain)" },

  // Hebrew
  { code: "he-IL", name: "עברית (ישראל)", englishName: "Hebrew (Israel)" },

  // Hindi
  { code: "hi-IN", name: "हिन्दी (भारत)", englishName: "Hindi (India)" },

  // Croatian
  { code: "hr-HR", name: "Hrvatski (Hrvatska)", englishName: "Croatian (Croatia)" },

  // Hungarian
  { code: "hu-HU", name: "Magyar (Magyarország)", englishName: "Hungarian (Hungary)" },

  // Indonesian
  { code: "id-ID", name: "Bahasa Indonesia (Indonesia)", englishName: "Indonesian (Indonesia)" },

  // Italian
  { code: "it-IT", name: "Italiano (Italia)", englishName: "Italian (Italy)" },

  // Japanese
  { code: "ja-JP", name: "日本語 (日本)", englishName: "Japanese (Japan)" },

  // Korean
  { code: "ko-KR", name: "한국어 (대한민국)", englishName: "Korean (South Korea)" },

  // Lithuanian
  { code: "lt-LT", name: "Lietuvių (Lietuva)", englishName: "Lithuanian (Lithuania)" },

  // Latvian
  { code: "lv-LV", name: "Latviešu (Latvija)", englishName: "Latvian (Latvia)" },

  // Maltese
  { code: "mt-MT", name: "Malti (Malta)", englishName: "Maltese (Malta)" },

  // Norwegian
  { code: "nb-NO", name: "Norsk bokmål (Norge)", englishName: "Norwegian Bokmål (Norway)" },

  // Dutch
  { code: "nl-BE", name: "Nederlands (België)", englishName: "Dutch (Belgium)" },
  { code: "nl-NL", name: "Nederlands (Nederland)", englishName: "Dutch (Netherlands)" },

  // Polish
  { code: "pl-PL", name: "Polski (Polska)", englishName: "Polish (Poland)" },

  // Portuguese
  { code: "pt-BR", name: "Português (Brasil)", englishName: "Portuguese (Brazil)" },
  { code: "pt-PT", name: "Português (Portugal)", englishName: "Portuguese (Portugal)" },

  // Romanian
  { code: "ro-RO", name: "Română (România)", englishName: "Romanian (Romania)" },

  // Russian
  { code: "ru-RU", name: "Русский (Россия)", englishName: "Russian (Russia)" },

  // Slovak
  { code: "sk-SK", name: "Slovenčina (Slovensko)", englishName: "Slovak (Slovakia)" },

  // Slovenian
  { code: "sl-SI", name: "Slovenščina (Slovenija)", englishName: "Slovenian (Slovenia)" },

  // Swedish
  { code: "sv-SE", name: "Svenska (Sverige)", englishName: "Swedish (Sweden)" },

  // Thai
  { code: "th-TH", name: "ไทย (ไทย)", englishName: "Thai (Thailand)" },

  // Turkish
  { code: "tr-TR", name: "Türkçe (Türkiye)", englishName: "Turkish (Turkey)" },

  // Ukrainian
  { code: "uk-UA", name: "Українська (Україна)", englishName: "Ukrainian (Ukraine)" },

  // Vietnamese
  { code: "vi-VN", name: "Tiếng Việt (Việt Nam)", englishName: "Vietnamese (Vietnam)" },

  // Chinese
  { code: "zh-CN", name: "中文 (简体，中国)", englishName: "Chinese (Simplified, China)" },
  { code: "zh-HK", name: "中文 (粤语，香港)", englishName: "Chinese (Cantonese, Hong Kong)" },
  { code: "zh-TW", name: "中文 (繁體，台灣)", englishName: "Chinese (Traditional, Taiwan)" },
];

// Helper function to get locale display name
export function getLocaleDisplayName(code: string, showEnglish: boolean = true): string {
  const locale = SUPPORTED_LOCALES.find(l => l.code === code);
  if (!locale) return code;
  
  if (showEnglish && locale.englishName !== locale.name) {
    return `${locale.name} - ${locale.englishName}`;
  }
  return locale.name;
}

// Helper function to group locales by language family
export function getGroupedLocales(): { [key: string]: LocaleInfo[] } {
  const grouped: { [key: string]: LocaleInfo[] } = {};
  
  SUPPORTED_LOCALES.forEach(locale => {
    const lang = locale.code.split('-')[0];
    const langName = getLanguageName(lang);
    
    if (!grouped[langName]) {
      grouped[langName] = [];
    }
    grouped[langName].push(locale);
  });
  
  return grouped;
}

function getLanguageName(langCode: string): string {
  const langNames: { [key: string]: string } = {
    'ar': 'Arabic',
    'bg': 'Bulgarian', 
    'ca': 'Catalan',
    'cs': 'Czech',
    'da': 'Danish',
    'de': 'German',
    'el': 'Greek',
    'en': 'English',
    'es': 'Spanish',
    'et': 'Estonian',
    'eu': 'Basque',
    'fi': 'Finnish',
    'fr': 'French',
    'gl': 'Galician',
    'he': 'Hebrew',
    'hi': 'Hindi',
    'hr': 'Croatian',
    'hu': 'Hungarian',
    'id': 'Indonesian',
    'it': 'Italian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'lt': 'Lithuanian',
    'lv': 'Latvian',
    'mt': 'Maltese',
    'nb': 'Norwegian',
    'nl': 'Dutch',
    'pl': 'Polish',
    'pt': 'Portuguese',
    'ro': 'Romanian',
    'ru': 'Russian',
    'sk': 'Slovak',
    'sl': 'Slovenian',
    'sv': 'Swedish',
    'th': 'Thai',
    'tr': 'Turkish',
    'uk': 'Ukrainian',
    'vi': 'Vietnamese',
    'zh': 'Chinese'
  };
  
  return langNames[langCode] || langCode.toUpperCase();
}
