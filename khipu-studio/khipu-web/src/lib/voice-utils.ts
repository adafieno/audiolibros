import type { Voice } from './api/voices';

/**
 * Extract language code from locale (e.g., "es-PE" -> "es")
 */
export function getLanguageFromLocale(locale: string): string {
  return locale.split('-')[0];
}

/**
 * Get available languages from voice list
 */
export function getAvailableLanguages(voices: Voice[]): string[] {
  const languages = new Set<string>();
  voices.forEach(voice => {
    languages.add(getLanguageFromLocale(voice.locale));
  });
  return Array.from(languages).sort();
}

/**
 * Get available locales for a language
 */
export function getAvailableLocalesForLanguage(voices: Voice[], language: string): string[] {
  const locales = new Set<string>();
  voices.forEach(voice => {
    if (getLanguageFromLocale(voice.locale) === language) {
      locales.add(voice.locale);
    }
  });
  return Array.from(locales).sort();
}

/**
 * Filter voices by engine
 */
export function filterVoicesByEngine(voices: Voice[], engine: string): Voice[] {
  return voices.filter(voice => voice.engine === engine);
}

/**
 * Filter voices by language
 */
export function filterVoicesByLanguage(voices: Voice[], languages: string[]): Voice[] {
  if (languages.length === 0) return voices;
  
  return voices.filter(voice => {
    const voiceLanguage = getLanguageFromLocale(voice.locale);
    return languages.includes(voiceLanguage);
  });
}

/**
 * Filter voices by gender
 */
export function filterVoicesByGender(voices: Voice[], genders: string[]): Voice[] {
  if (genders.length === 0) return voices;
  return voices.filter(voice => genders.includes(voice.gender));
}

/**
 * Filter voices by locale
 */
export function filterVoicesByLocale(voices: Voice[], locales: string[]): Voice[] {
  if (locales.length === 0) return voices;
  return voices.filter(voice => locales.includes(voice.locale));
}

/**
 * Get default audition text for a locale
 */
export function getAuditionText(locale: string): string {
  const language = getLanguageFromLocale(locale);
  
  const auditionTexts: Record<string, string> = {
    'es': 'Hola, soy una voz que puedes usar para tu audiolibro. Esta es una muestra de cómo sueno cuando leo tu contenido.',
    'en': 'Hello, this is a voice audition sample for your audiobook project. This is how I sound when reading your content.',
    'fr': 'Bonjour, je suis une voix que vous pouvez utiliser pour votre livre audio. Ceci est un échantillon de la façon dont je sonne quand je lis votre contenu.',
    'pt': 'Olá, sou uma voz que você pode usar para seu audiolivro. Esta é uma amostra de como eu soou ao ler seu conteúdo.',
    'de': 'Hallo, ich bin eine Stimme, die Sie für Ihr Hörbuch verwenden können. Dies ist eine Probe, wie ich klinge, wenn ich Ihren Inhalt lese.',
    'it': 'Ciao, sono una voce che puoi usare per il tuo audiolibro. Questo è un campione di come suono quando leggo i tuoi contenuti.',
  };
  
  return auditionTexts[language] || auditionTexts['en'];
}
