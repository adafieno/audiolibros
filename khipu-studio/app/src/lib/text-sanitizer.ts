/**
 * Text sanitization utilities for TTS compatibility
 * 
 * This module provides functions to clean and normalize text for optimal TTS rendering,
 * replacing problematic characters and sequences that commonly cause TTS failures.
 */

export interface SanitizationRule {
  pattern: RegExp;
  replacement: string;
  description: string;
}

export interface SanitizationOptions {
  preserveFormatting: boolean;
  language: string;
  customRules?: SanitizationRule[];
}

/**
 * Common problematic characters and sequences for TTS engines
 */
const TTS_PROBLEMATIC_RULES: SanitizationRule[] = [
  // Unicode quotation marks -> ASCII equivalents (including U+201C and U+201D)
  { pattern: /[""""\u201C\u201D]/g, replacement: '"', description: 'Smart quotes to straight quotes' },
  { pattern: /['']/g, replacement: "'", description: 'Smart apostrophes to straight apostrophes' },
  
  // Ellipsis -> three periods
  { pattern: /…/g, replacement: '...', description: 'Ellipsis to three dots' },
  
  // Non-breaking spaces -> regular spaces
  { pattern: /\u00A0/g, replacement: ' ', description: 'Non-breaking spaces to regular spaces' },
  
  // Zero-width characters (invisible but can confuse TTS)
  { pattern: /[\u200B-\u200D\uFEFF]/g, replacement: '', description: 'Remove zero-width characters' },
  
  // Multiple consecutive spaces (but not line breaks) -> single space
  { pattern: /[ \t]{2,}/g, replacement: ' ', description: 'Multiple spaces to single space' },
  
  // Normalize line breaks
  { pattern: /\r\n/g, replacement: '\n', description: 'Windows line endings to Unix' },
  { pattern: /\r/g, replacement: '\n', description: 'Mac line endings to Unix' },
  
  // Remove trailing whitespace from lines
  { pattern: /[ \t]+$/gm, replacement: '', description: 'Remove trailing whitespace' },
  
  // Mathematical symbols -> text equivalents
  { pattern: /×/g, replacement: ' por ', description: 'Multiplication sign to "por"' },
  { pattern: /÷/g, replacement: ' entre ', description: 'Division sign to "entre"' },
  { pattern: /±/g, replacement: ' más o menos ', description: 'Plus-minus to "más o menos"' },
  
  // Currency symbols (context-dependent, basic conversion)
  { pattern: /\$/g, replacement: ' dólares', description: 'Dollar sign to "dólares"' },
  { pattern: /€/g, replacement: ' euros', description: 'Euro sign to "euros"' },
  { pattern: /£/g, replacement: ' libras', description: 'Pound sign to "libras"' },
  
  // Percentage symbol
  { pattern: /%/g, replacement: ' por ciento', description: 'Percent to "por ciento"' },
  
  // Ampersand
  { pattern: /&/g, replacement: ' y ', description: 'Ampersand to "y"' },
  
  // Degree symbol
  { pattern: /°/g, replacement: ' grados', description: 'Degree symbol to "grados"' },
];

/**
 * Language-specific sanitization rules
 */
const LANGUAGE_RULES: Record<string, SanitizationRule[]> = {
  'es': [
    // Spanish-specific rules
    { pattern: /º/g, replacement: '', description: 'Remove ordinal indicator' },
    { pattern: /ª/g, replacement: '', description: 'Remove feminine ordinal indicator' },
  ],
  'en': [
    // English-specific rules
    { pattern: /\$/g, replacement: ' dollars', description: 'Dollar sign to "dollars"' },
    { pattern: /%/g, replacement: ' percent', description: 'Percent to "percent"' },
    { pattern: /&/g, replacement: ' and ', description: 'Ampersand to "and"' },
    { pattern: /°/g, replacement: ' degrees', description: 'Degree symbol to "degrees"' },
  ]
};

/**
 * Sanitize text for TTS compatibility
 */
export function sanitizeTextForTTS(
  text: string, 
  options: Partial<SanitizationOptions> = {}
): { sanitized: string; changes: number; appliedRules: string[] } {
  const opts: SanitizationOptions = {
    preserveFormatting: true,
    language: 'es', // Default to Spanish
    ...options
  };

  let sanitized = text;
  let totalChanges = 0;
  const appliedRules: string[] = [];

  // Apply common TTS problematic rules
  for (const rule of TTS_PROBLEMATIC_RULES) {
    const matches = sanitized.match(rule.pattern);
    if (matches) {
      sanitized = sanitized.replace(rule.pattern, rule.replacement);
      totalChanges += matches.length;
      appliedRules.push(rule.description);
    }
  }

  // Apply language-specific rules
  const langRules = LANGUAGE_RULES[opts.language] || [];
  for (const rule of langRules) {
    const matches = sanitized.match(rule.pattern);
    if (matches) {
      sanitized = sanitized.replace(rule.pattern, rule.replacement);
      totalChanges += matches.length;
      appliedRules.push(`${opts.language}: ${rule.description}`);
    }
  }

  // Apply custom rules if provided
  if (opts.customRules) {
    for (const rule of opts.customRules) {
      const matches = sanitized.match(rule.pattern);
      if (matches) {
        sanitized = sanitized.replace(rule.pattern, rule.replacement);
        totalChanges += matches.length;
        appliedRules.push(`Custom: ${rule.description}`);
      }
    }
  }

  // Final cleanup - normalize whitespace if not preserving formatting
  if (!opts.preserveFormatting) {
    const beforeWhitespace = sanitized;
    sanitized = sanitized
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .replace(/[ \t]+/g, ' ')    // Multiple spaces/tabs to single space
      .trim();                    // Remove leading/trailing whitespace
    
    if (beforeWhitespace !== sanitized) {
      appliedRules.push('Normalized whitespace');
    }
  }

  return {
    sanitized,
    changes: totalChanges,
    appliedRules
  };
}

/**
 * Preview sanitization changes without applying them
 */
export function previewSanitization(
  text: string,
  options: Partial<SanitizationOptions> = {}
): {
  hasChanges: boolean;
  changes: number;
  preview: string;
  appliedRules: string[];
} {
  const result = sanitizeTextForTTS(text, options);
  
  return {
    hasChanges: result.changes > 0,
    changes: result.changes,
    preview: result.sanitized,
    appliedRules: result.appliedRules
  };
}

/**
 * Get a diff-like representation of changes
 */
export function getSanitizationDiff(
  original: string,
  sanitized: string
): { line: number; original: string; sanitized: string }[] {
  const originalLines = original.split('\n');
  const sanitizedLines = sanitized.split('\n');
  const maxLines = Math.max(originalLines.length, sanitizedLines.length);
  const diffs: { line: number; original: string; sanitized: string }[] = [];

  for (let i = 0; i < maxLines; i++) {
    const orig = originalLines[i] || '';
    const sani = sanitizedLines[i] || '';
    
    if (orig !== sani) {
      diffs.push({
        line: i + 1,
        original: orig,
        sanitized: sani
      });
    }
  }

  return diffs;
}

/**
 * Check if text contains potentially problematic characters for TTS
 */
export function hasProblematicCharacters(text: string, language: string = 'es'): {
  hasProblems: boolean;
  issues: { character: string; position: number; description: string }[];
} {
  const issues: { character: string; position: number; description: string }[] = [];
  const allRules = [...TTS_PROBLEMATIC_RULES, ...(LANGUAGE_RULES[language] || [])];

  for (const rule of allRules) {
    let match;
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags);
    
    while ((match = regex.exec(text)) !== null) {
      issues.push({
        character: match[0],
        position: match.index,
        description: rule.description
      });
      
      // Avoid infinite loop with global regexes
      if (!regex.global) break;
    }
  }

  return {
    hasProblems: issues.length > 0,
    issues
  };
}

/**
 * Batch sanitize multiple text files/chapters
 */
export function sanitizeTextBatch(
  texts: { id: string; content: string }[],
  options: Partial<SanitizationOptions> = {}
): {
  results: Array<{
    id: string;
    original: string;
    sanitized: string;
    changes: number;
    appliedRules: string[];
  }>;
  totalChanges: number;
} {
  const results = texts.map(({ id, content }) => {
    const result = sanitizeTextForTTS(content, options);
    return {
      id,
      original: content,
      sanitized: result.sanitized,
      changes: result.changes,
      appliedRules: result.appliedRules
    };
  });

  const totalChanges = results.reduce((sum, result) => sum + result.changes, 0);

  return {
    results,
    totalChanges
  };
}