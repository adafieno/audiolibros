// Utility to extract translation strings from the desktop app's format
export interface TranslationResource {
  [key: string]: {
    string: string;
    comment?: string;
  };
}

export function extractTranslationStrings(resource: TranslationResource): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(resource)) {
    if (value && typeof value === 'object' && 'string' in value) {
      result[key] = value.string;
    }
  }
  return result;
}
