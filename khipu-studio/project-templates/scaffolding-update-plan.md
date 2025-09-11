# Optimized Project Scaffolding Implementation

## Current Scaffolding Analysis

The current `createScaffold` function in `main.cjs` is mostly good but needs these updates to match our optimized structure:

### Current Issues:
1. **Missing art directory** - Cover images should go in `art/`
2. **Incomplete path tracking** - Missing comprehensive paths section
3. **No coverImage path** - Template doesn't specify where covers go
4. **Old paths format** - Uses simple paths instead of comprehensive tracking

## Recommended Updates

### 1. Update main.cjs createScaffold function:

```javascript
async function createScaffold(root) {
  await ensureDirs(root, [
    "analysis/chapters_txt",
    "art",                    // ✅ Add art directory for covers
    "dossier", 
    "ssml/plans",
    "ssml/xml",
    "cache/tts",
    "audio/chapters",
    "audio/book", 
    "exports",
  ]);

  // project.khipu.json — optimized with comprehensive path tracking
  const projectCfg = {
    version: 1,
    language: "es-PE",
    paths: {                                    // ✅ Comprehensive path tracking
      bookMeta: "book.meta.json",
      production: "production.settings.json",
      manuscript: "analysis/chapters_txt",
      dossier: "dossier",
      ssml: "ssml/plans",
      audio: "audio", 
      cache: "cache",
      exports: "exports",
      art: "art"                               // ✅ Art directory for covers
    },
    planning: { maxKb: 48, llmAttribution: "off" },
    ssml: {},
    tts: { engine: { name: "azure", voice: "es-PE-CamilaNeural" }, cache: true },
    llm: { engine: { name: "openai", model: "gpt-4o" } },
    export: { outputDir: "exports", platforms: { apple: false, google: false, spotify: false } },
    creds: { useAppAzure: false, useAppOpenAI: false },
    workflow: {                                // ✅ Add workflow tracking
      project: { complete: false },
      characters: { complete: false },
      planning: { complete: false },
      ssml: { complete: false },
      audio: { complete: false }
    }
  };
  await writeJson(path.join(root, "project.khipu.json"), projectCfg);

  // book.meta.json — template ready for book information
  await writeJson(path.join(root, "book.meta.json"), {
    title: "",
    subtitle: "",
    authors: [],
    narrators: [],
    language: "es-PE", 
    description: "",
    keywords: [],
    categories: [],
    publisher: "",
    publication_date: "",
    rights: "",
    series: { name: "", number: null },
    sku: "",
    isbn: "", 
    disclosure_digital_voice: false
    // ✅ Note: coverImage will be added when user selects cover
  });
  
  // ... rest of production.settings.json stays the same
}
```

### 2. Create README template in art directory:

```markdown
# Cover Art Directory

Place your book cover image here. Requirements:
- **Format:** JPEG (.jpg)
- **Dimensions:** 3000×3000 pixels (recommended)
- **Naming:** Use descriptive names like `cover_3000.jpg`

The cover image path will be automatically added to `book.meta.json` when you select it through the Book page.
```

### 3. Update Application Code

The application already handles the optimized structure correctly, but we should ensure the Home.tsx project loading also works with the new paths structure.

## Implementation Priority

1. **High Priority:** Update `createScaffold` in main.cjs with comprehensive paths
2. **Medium Priority:** Add art directory creation and README
3. **Low Priority:** Add workflow tracking (nice to have)

## Migration Compatibility

The updated scaffolding is fully compatible with:
- ✅ Existing projects (paths work as fallbacks)
- ✅ Migration script (detects and fixes old structure)  
- ✅ Current application code (already supports both formats)

## Testing Strategy

1. Create new project with updated scaffold
2. Verify all paths resolve correctly
3. Test cover image selection and path tracking
4. Confirm compatibility with existing projects
