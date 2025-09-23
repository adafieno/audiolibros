// Helper to inject <phoneme> tags into plain text using a pronunciation map
export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
}

export function injectPhonemes(text: string, pronunciationMap?: Record<string, string>): string {
  if (!text || !pronunciationMap) return text;

  // If the text already looks like SSML (contains tags), don't attempt to re-process.
  if (/[<>]/.test(text)) return text;

  const keys = Object.keys(pronunciationMap || {});
  if (keys.length === 0) return text;

  // Sort keys by length (longer keys first) to prefer longest-match
  keys.sort((a, b) => b.length - a.length);

  // Escape keys for use in RegExp
  const escaped = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  // Build a word-boundary aware regex (unicode enabled)
  const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'giu');

  const replaced = text.replace(pattern, (match) => {
    // Find the canonical key ignoring case
    const key = keys.find(k => k.toLowerCase() === match.toLowerCase());
    if (!key) return match;
    const ipa = pronunciationMap[key];
    if (!ipa) return match;

    const ph = escapeXml(ipa);
    const original = escapeXml(match);
    return `<phoneme ph="${ph}">${original}</phoneme>`;
  });

  return replaced;
}
