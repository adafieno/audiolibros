// Type definition for the new translation format
export interface TranslationEntry {
  string: string;
  comment: string;
}

export type TranslationResource = Record<string, TranslationEntry | string>;

// Custom translation extractor utility for the new string/comment format
// This function should be imported and used in the i18n initialization
export function extractTranslationStrings(translations: TranslationResource): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(translations)) {
    if (value && typeof value === 'object' && 'string' in value) {
      // New format: { string: "text", comment: "description" }
      result[key] = value.string;
    } else if (typeof value === 'string') {
      // Legacy format: direct string
      result[key] = value;
    } else {
      // Skip invalid entries
      console.warn(`Invalid translation format for key: ${key}`);
    }
  }
  
  return result;
}
