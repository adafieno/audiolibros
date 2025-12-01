// Language and locale listing adapted from desktop locales.ts for web grouped selection
export interface LocaleInfo {
  code: string;
  name: string; // Native name with region
  englishName: string; // English name
}

export const SUPPORTED_LOCALES: LocaleInfo[] = [
  { code: 'ar-AE', name: 'العربية (الإمارات)', englishName: 'Arabic (United Arab Emirates)' },
  { code: 'ar-SA', name: 'العربية (السعودية)', englishName: 'Arabic (Saudi Arabia)' },
  { code: 'ar-EG', name: 'العربية (مصر)', englishName: 'Arabic (Egypt)' },
  { code: 'ar-MA', name: 'العربية (المغرب)', englishName: 'Arabic (Morocco)' },
  { code: 'ar-LB', name: 'العربية (لبنان)', englishName: 'Arabic (Lebanon)' },
  { code: 'bg-BG', name: 'Български (България)', englishName: 'Bulgarian (Bulgaria)' },
  { code: 'ca-ES', name: 'Català (Espanya)', englishName: 'Catalan (Spain)' },
  { code: 'cs-CZ', name: 'Čeština (Česká republika)', englishName: 'Czech (Czech Republic)' },
  { code: 'da-DK', name: 'Dansk (Danmark)', englishName: 'Danish (Denmark)' },
  { code: 'de-DE', name: 'Deutsch (Deutschland)', englishName: 'German (Germany)' },
  { code: 'de-AT', name: 'Deutsch (Österreich)', englishName: 'German (Austria)' },
  { code: 'de-CH', name: 'Deutsch (Schweiz)', englishName: 'German (Switzerland)' },
  { code: 'el-GR', name: 'Ελληνικά (Ελλάδα)', englishName: 'Greek (Greece)' },
  { code: 'en-US', name: 'English (United States)', englishName: 'English (United States)' },
  { code: 'en-GB', name: 'English (United Kingdom)', englishName: 'English (United Kingdom)' },
  { code: 'en-AU', name: 'English (Australia)', englishName: 'English (Australia)' },
  { code: 'en-CA', name: 'English (Canada)', englishName: 'English (Canada)' },
  { code: 'en-IN', name: 'English (India)', englishName: 'English (India)' },
  { code: 'en-IE', name: 'English (Ireland)', englishName: 'English (Ireland)' },
  { code: 'en-NZ', name: 'English (New Zealand)', englishName: 'English (New Zealand)' },
  { code: 'en-ZA', name: 'English (South Africa)', englishName: 'English (South Africa)' },
  { code: 'en-SG', name: 'English (Singapore)', englishName: 'English (Singapore)' },
  { code: 'en-PH', name: 'English (Philippines)', englishName: 'English (Philippines)' },
  { code: 'es-ES', name: 'Español (España)', englishName: 'Spanish (Spain)' },
  { code: 'es-MX', name: 'Español (México)', englishName: 'Spanish (Mexico)' },
  { code: 'es-AR', name: 'Español (Argentina)', englishName: 'Spanish (Argentina)' },
  { code: 'es-PE', name: 'Español (Perú)', englishName: 'Spanish (Peru)' },
  { code: 'es-CO', name: 'Español (Colombia)', englishName: 'Spanish (Colombia)' },
  { code: 'es-CL', name: 'Español (Chile)', englishName: 'Spanish (Chile)' },
  { code: 'es-UY', name: 'Español (Uruguay)', englishName: 'Spanish (Uruguay)' },
  { code: 'es-VE', name: 'Español (Venezuela)', englishName: 'Spanish (Venezuela)' },
  { code: 'es-US', name: 'Español (Estados Unidos)', englishName: 'Spanish (United States)' },
  { code: 'es-EC', name: 'Español (Ecuador)', englishName: 'Spanish (Ecuador)' },
  { code: 'es-PR', name: 'Español (Puerto Rico)', englishName: 'Spanish (Puerto Rico)' },
  { code: 'es-DO', name: 'Español (República Dominicana)', englishName: 'Spanish (Dominican Republic)' },
  { code: 'es-GT', name: 'Español (Guatemala)', englishName: 'Spanish (Guatemala)' },
  { code: 'es-HN', name: 'Español (Honduras)', englishName: 'Spanish (Honduras)' },
  { code: 'es-CR', name: 'Español (Costa Rica)', englishName: 'Spanish (Costa Rica)' },
  { code: 'es-PA', name: 'Español (Panamá)', englishName: 'Spanish (Panama)' },
  { code: 'es-PY', name: 'Español (Paraguay)', englishName: 'Spanish (Paraguay)' },
  { code: 'es-SV', name: 'Español (El Salvador)', englishName: 'Spanish (El Salvador)' },
  { code: 'es-NI', name: 'Español (Nicaragua)', englishName: 'Spanish (Nicaragua)' },
  { code: 'es-BO', name: 'Español (Bolivia)', englishName: 'Spanish (Bolivia)' },
  { code: 'es-CU', name: 'Español (Cuba)', englishName: 'Spanish (Cuba)' },
  { code: 'es-GQ', name: 'Español (Guinea Ecuatorial)', englishName: 'Spanish (Equatorial Guinea)' },
  { code: 'et-EE', name: 'Eesti (Eesti)', englishName: 'Estonian (Estonia)' },
  { code: 'eu-ES', name: 'Euskera (Espainia)', englishName: 'Basque (Spain)' },
  { code: 'fi-FI', name: 'Suomi (Suomi)', englishName: 'Finnish (Finland)' },
  { code: 'fr-FR', name: 'Français (France)', englishName: 'French (France)' },
  { code: 'fr-CA', name: 'Français (Canada)', englishName: 'French (Canada)' },
  { code: 'fr-BE', name: 'Français (Belgique)', englishName: 'French (Belgium)' },
  { code: 'fr-CH', name: 'Français (Suisse)', englishName: 'French (Switzerland)' },
  { code: 'gl-ES', name: 'Galego (España)', englishName: 'Galician (Spain)' },
  { code: 'he-IL', name: 'עברית (ישראל)', englishName: 'Hebrew (Israel)' },
  { code: 'hi-IN', name: 'हिन्दी (भारत)', englishName: 'Hindi (India)' },
  { code: 'hr-HR', name: 'Hrvatski (Hrvatska)', englishName: 'Croatian (Croatia)' },
  { code: 'hu-HU', name: 'Magyar (Magyarország)', englishName: 'Hungarian (Hungary)' },
  { code: 'id-ID', name: 'Bahasa Indonesia (Indonesia)', englishName: 'Indonesian (Indonesia)' },
  { code: 'it-IT', name: 'Italiano (Italia)', englishName: 'Italian (Italy)' },
  { code: 'ja-JP', name: '日本語 (日本)', englishName: 'Japanese (Japan)' },
  { code: 'ko-KR', name: '한국어 (대한민국)', englishName: 'Korean (South Korea)' },
  { code: 'lt-LT', name: 'Lietuvių (Lietuva)', englishName: 'Lithuanian (Lithuania)' },
  { code: 'lv-LV', name: 'Latviešu (Latvija)', englishName: 'Latvian (Latvia)' },
  { code: 'mt-MT', name: 'Malti (Malta)', englishName: 'Maltese (Malta)' },
  { code: 'nb-NO', name: 'Norsk bokmål (Norge)', englishName: 'Norwegian Bokmål (Norway)' },
  { code: 'nl-NL', name: 'Nederlands (Nederland)', englishName: 'Dutch (Netherlands)' },
  { code: 'nl-BE', name: 'Nederlands (België)', englishName: 'Dutch (Belgium)' },
  { code: 'pl-PL', name: 'Polski (Polska)', englishName: 'Polish (Poland)' },
  { code: 'pt-BR', name: 'Português (Brasil)', englishName: 'Portuguese (Brazil)' },
  { code: 'pt-PT', name: 'Português (Portugal)', englishName: 'Portuguese (Portugal)' },
  { code: 'ro-RO', name: 'Română (România)', englishName: 'Romanian (Romania)' },
  { code: 'ru-RU', name: 'Русский (Россия)', englishName: 'Russian (Russia)' },
  { code: 'sk-SK', name: 'Slovenčina (Slovensko)', englishName: 'Slovak (Slovakia)' },
  { code: 'sl-SI', name: 'Slovenščina (Slovenija)', englishName: 'Slovenian (Slovenia)' },
  { code: 'sv-SE', name: 'Svenska (Sverige)', englishName: 'Swedish (Sweden)' },
  { code: 'th-TH', name: 'ไทย (ไทย)', englishName: 'Thai (Thailand)' },
  { code: 'tr-TR', name: 'Türkçe (Türkiye)', englishName: 'Turkish (Turkey)' },
  { code: 'uk-UA', name: 'Українська (Україна)', englishName: 'Ukrainian (Ukraine)' },
  { code: 'vi-VN', name: 'Tiếng Việt (Việt Nam)', englishName: 'Vietnamese (Vietnam)' },
  { code: 'zh-CN', name: '中文 (简体，中国)', englishName: 'Chinese (Simplified, China)' },
  { code: 'zh-TW', name: '中文 (繁體，台灣)', englishName: 'Chinese (Traditional, Taiwan)' },
  { code: 'zh-HK', name: '中文 (粤语，香港)', englishName: 'Chinese (Cantonese, Hong Kong)' },
];

export function getLocaleDisplayName(code: string): string {
  const locale = SUPPORTED_LOCALES.find(l => l.code === code);
  if (!locale) return code;
  return locale.name !== locale.englishName ? `${locale.name} - ${locale.englishName}` : locale.name;
}

export function getGroupedLocales(): { [group: string]: LocaleInfo[] } {
  const grouped: { [group: string]: LocaleInfo[] } = {};
  for (const loc of SUPPORTED_LOCALES) {
    const prefix = loc.code.split('-')[0];
    const group = mapLangPrefix(prefix);
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(loc);
  }
  return grouped;
}

function mapLangPrefix(prefix: string): string {
  const map: Record<string, string> = {
    ar: 'Arabic', bg: 'Bulgarian', ca: 'Catalan', cs: 'Czech', da: 'Danish', de: 'German', el: 'Greek', en: 'English', es: 'Spanish', et: 'Estonian', eu: 'Basque', fi: 'Finnish', fr: 'French', gl: 'Galician', he: 'Hebrew', hi: 'Hindi', hr: 'Croatian', hu: 'Hungarian', id: 'Indonesian', it: 'Italian', ja: 'Japanese', ko: 'Korean', lt: 'Lithuanian', lv: 'Latvian', mt: 'Maltese', nb: 'Norwegian', nl: 'Dutch', pl: 'Polish', pt: 'Portuguese', ro: 'Romanian', ru: 'Russian', sk: 'Slovak', sl: 'Slovenian', sv: 'Swedish', th: 'Thai', tr: 'Turkish', uk: 'Ukrainian', vi: 'Vietnamese', zh: 'Chinese'
  };
  return map[prefix] || prefix.toUpperCase();
}
