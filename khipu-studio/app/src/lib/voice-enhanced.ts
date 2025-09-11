import type { Voice, VoiceInventory } from '../types/voice'

/**
 * Enhanced voice filtering and management utilities
 */

/**
 * Extract language code from locale (e.g., "es-PE" -> "es")
 */
export function getLanguageFromLocale(locale: string): string {
  return locale.split('-')[0]
}

/**
 * Get all unique languages from a list of voices
 */
export function getAvailableLanguages(voices: Voice[]): string[] {
  const languages = new Set<string>()
  voices.forEach(voice => {
    languages.add(getLanguageFromLocale(voice.locale))
  })
  return Array.from(languages).sort()
}

/**
 * Filter voices by multiple languages (supports multi-language books)
 */
export function filterVoicesByLanguages(voices: Voice[], languages: string[]): Voice[] {
  if (languages.length === 0) return voices
  
  return voices.filter(voice => {
    const voiceLanguage = getLanguageFromLocale(voice.locale)
    return languages.includes(voiceLanguage)
  })
}

/**
 * Filter voices prioritizing the primary language but including all variants
 */
export function filterVoicesWithPriority(voices: Voice[], primaryLocale: string, additionalLanguages: string[] = []): Voice[] {
  const primaryLanguage = getLanguageFromLocale(primaryLocale)
  const allLanguages = [primaryLanguage, ...additionalLanguages].filter((lang, index, arr) => arr.indexOf(lang) === index)
  
  const filtered = filterVoicesByLanguages(voices, allLanguages)
  
  // Sort so primary language voices come first, then by locale alphabetically
  return filtered.sort((a, b) => {
    const aLang = getLanguageFromLocale(a.locale)
    const bLang = getLanguageFromLocale(b.locale)
    
    if (aLang === primaryLanguage && bLang !== primaryLanguage) return -1
    if (bLang === primaryLanguage && aLang !== primaryLanguage) return 1
    
    // Within same language, prioritize primary locale
    if (aLang === bLang) {
      if (a.locale === primaryLocale) return -1
      if (b.locale === primaryLocale) return 1
      return a.locale.localeCompare(b.locale)
    }
    
    return aLang.localeCompare(bLang)
  })
}

/**
 * Enhanced filter for project voices with multi-language support
 */
export function filterVoicesForMultilingualProject(
  voices: Voice[], 
  engine: string, 
  primaryLocale: string, 
  additionalLanguages: string[] = []
): Voice[] {
  // First filter by engine
  const engineFiltered = voices.filter(voice => voice.engine === engine)
  
  // Then filter by languages with priority
  return filterVoicesWithPriority(engineFiltered, primaryLocale, additionalLanguages)
}

/**
 * Group voices by language for better UI organization
 */
export function groupVoicesByLanguage(voices: Voice[]): Record<string, Voice[]> {
  return voices.reduce((groups, voice) => {
    const language = getLanguageFromLocale(voice.locale)
    if (!groups[language]) {
      groups[language] = []
    }
    groups[language].push(voice)
    return groups
  }, {} as Record<string, Voice[]>)
}

/**
 * Get voice count statistics by language
 */
export interface LanguageStats {
  language: string
  count: number
  locales: string[]
}

export function getLanguageStats(voices: Voice[]): LanguageStats[] {
  const stats: Record<string, LanguageStats> = {}
  
  voices.forEach(voice => {
    const language = getLanguageFromLocale(voice.locale)
    if (!stats[language]) {
      stats[language] = {
        language,
        count: 0,
        locales: []
      }
    }
    stats[language].count++
    if (!stats[language].locales.includes(voice.locale)) {
      stats[language].locales.push(voice.locale)
    }
  })
  
  return Object.values(stats).sort((a, b) => b.count - a.count)
}

/**
 * Merge comprehensive voice inventory with existing selected voices
 */
export async function mergeVoiceInventories(
  existingInventory: VoiceInventory,
  comprehensiveVoices: Voice[]
): Promise<VoiceInventory> {
  // Create a map of existing voices by ID for quick lookup
  const existingVoiceIds = new Set(existingInventory.voices.map(v => v.id))
  const existingSelectedIds = new Set(existingInventory.selectedVoiceIds || [])
  
  // Merge voices: keep existing ones, add new ones
  const mergedVoices = [
    ...existingInventory.voices,
    ...comprehensiveVoices.filter(voice => !existingVoiceIds.has(voice.id))
  ]
  
  // Preserve existing selections
  const selectedVoiceIds = Array.from(existingSelectedIds)
  
  return {
    voices: mergedVoices,
    selectedVoiceIds
  }
}
