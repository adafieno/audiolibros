import type { VoiceInventory, Voice } from '../types/voice'
import { readJSON, writeJSON } from './fs'

/**
 * Load voice inventory from the project directory
 */
export async function loadVoiceInventory(projectPath: string): Promise<VoiceInventory> {
  try {
    const inventory = await readJSON<VoiceInventory>(projectPath, 'voice_inventory.json')
    return inventory || { voices: [] }
  } catch (error) {
    console.warn('Failed to load voice inventory, using empty inventory:', error)
    return { voices: [] }
  }
}

/**
 * Save voice inventory to the project directory
 */
export async function saveVoiceInventory(projectPath: string, inventory: VoiceInventory): Promise<void> {
  try {
    await writeJSON(projectPath, 'voice_inventory.json', inventory)
  } catch (error) {
    console.error('Failed to save voice inventory:', error)
    throw error
  }
}

/**
 * Filter voices by TTS engine
 */
export function filterVoicesByEngine(voices: Voice[], engine: string): Voice[] {
  return voices.filter(voice => voice.engine === engine)
}

/**
 * Extract language code from locale (e.g., "es-PE" -> "es")
 */
function getLanguageFromLocale(locale: string): string {
  return locale.split('-')[0]
}

/**
 * Filter voices by language, showing project locale + other variants of same language
 */
export function filterVoicesByLanguage(voices: Voice[], projectLocale: string): Voice[] {
  const projectLanguage = getLanguageFromLocale(projectLocale)
  
  return voices.filter(voice => {
    const voiceLanguage = getLanguageFromLocale(voice.locale)
    return voiceLanguage === projectLanguage
  })
}

/**
 * Filter voices by both engine and language
 */
export function filterVoicesForProject(voices: Voice[], engine: string, projectLocale: string): Voice[] {
  const engineFiltered = filterVoicesByEngine(voices, engine)
  return filterVoicesByLanguage(engineFiltered, projectLocale)
}

/**
 * Group voices by engine
 */
export function groupVoicesByEngine(voices: Voice[]): Record<string, Voice[]> {
  return voices.reduce((groups, voice) => {
    if (!groups[voice.engine]) {
      groups[voice.engine] = []
    }
    groups[voice.engine].push(voice)
    return groups
  }, {} as Record<string, Voice[]>)
}

/**
 * Bootstrap default voice inventory for a new project
 */
export async function bootstrapVoiceInventory(projectPath: string): Promise<void> {
  try {
    // Load comprehensive voice inventory from app data
    const comprehensiveInventoryModule = await import('../data/comprehensive-azure-voices.json')
    const comprehensiveInventory = comprehensiveInventoryModule.default as VoiceInventory
    
    // Save comprehensive inventory to project directory
    await saveVoiceInventory(projectPath, comprehensiveInventory)
  } catch (error) {
    console.error('Failed to bootstrap comprehensive voice inventory, falling back to default:', error)
    try {
      // Fallback to original default inventory
      const defaultInventoryModule = await import('../data/default-voice-inventory.json')
      const defaultInventory = defaultInventoryModule.default as VoiceInventory
      await saveVoiceInventory(projectPath, defaultInventory)
    } catch (fallbackError) {
      console.error('Failed to load fallback inventory:', fallbackError)
      // Create empty inventory as last resort
      await saveVoiceInventory(projectPath, { voices: [] })
    }
  }
}