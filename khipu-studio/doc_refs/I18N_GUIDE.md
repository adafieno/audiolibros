# Internationalization (i18n) and Localization (l10n) Guide

## Overview

Khipu Studio uses **i18next** with React hooks for internationalization, supporting multiple languages with automatic detection and seamless switching. This guide covers how to implement, maintain, and extend the i18n system.

## Architecture

### Tech Stack
- **i18next**: Core internationalization framework
- **react-i18next**: React integration with hooks
- **i18next-icu**: ICU message format support for advanced formatting
- **i18next-browser-languagedetector**: Automatic language detection

### File Structure
```
app/src/
├── i18n.ts                    # i18n configuration
├── components/
│   └── LangSelector.tsx       # Language switching component
└── locales/
    ├── en-US/
    │   └── common.json        # English translations
    └── es-PE/
        └── common.json        # Spanish (Peru) translations
```

## Implementation Guide

### 1. Using Translations in Components

#### Basic Usage
```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  
  return (
    <div>
      <h1>{t("page.title")}</h1>
      <p>{t("page.description")}</p>
    </div>
  );
}
```

#### With Interpolation
```tsx
function StatusComponent({ progress, filename }) {
  const { t } = useTranslation();
  
  return (
    <div>
      {/* Simple interpolation */}
      <p>{t("status.progress", { pct: progress, note: filename })}</p>
      
      {/* Number formatting */}
      <p>{t("stats.characters", { count: 1250 })}</p>
    </div>
  );
}
```

#### Conditional Translations
```tsx
function ButtonComponent({ isCompleted, isLoading }) {
  const { t } = useTranslation();
  
  const getButtonText = () => {
    if (isLoading) return t("common.loading");
    if (isCompleted) return t("workflow.buttonCompleted");
    return t("common.save");
  };
  
  return <button>{getButtonText()}</button>;
}
```

### 2. Translation Key Organization

#### Naming Convention
Use **dot notation** with logical grouping:

```json
{
  "nav.home": "Home",
  "nav.project": "Project",
  "nav.settings": "Settings",
  
  "project.title": "Project Configuration",
  "project.save": "Save",
  "project.loading": "Loading...",
  
  "status.ready": "Ready",
  "status.generating": "Generating…",
  "status.completed": "Completed ✔",
  
  "workflow.readyToStart": "Workflow: Ready to start",
  "workflow.completed": "Completed: {{steps}}",
  "workflow.buttonCompleted": "✓ Completed"
}
```

#### Key Categories
- **`nav.*`** - Navigation elements
- **`status.*`** - Status messages and indicators
- **`project.*`** - Project configuration interface
- **`home.*`** - Home page content
- **`settings.*`** - Settings page content
- **`workflow.*`** - Workflow-related messages
- **`plan.*`** - Planning page content
- **`manu.*`** - Manuscript editor content

### 3. Advanced Formatting

#### ICU Message Format
The project supports ICU formatting for complex messages:

```json
{
  "status.progress": "Progress: {{pct, number}}% {{note}}",
  "manu.characters": "Characters: {{count, number}}",
  "files.selected": "{count, plural, =0 {No files} =1 {One file} other {# files}} selected",
  "time.relative": "{minutes, plural, =0 {just now} =1 {1 minute ago} other {# minutes ago}}"
}
```

#### Date and Time Formatting
```json
{
  "project.lastSaved": "Last saved: {{date, datetime}}",
  "export.timestamp": "Generated on {{date, date, ::yyyyMMdd}}"
}
```

Usage in components:
```tsx
const { t } = useTranslation();
const lastSaved = new Date();

return (
  <p>{t("project.lastSaved", { date: lastSaved })}</p>
);
```

## Adding New Languages

### 1. Create Locale Files
```bash
# Create new language directory
mkdir -p src/locales/fr-FR
cp src/locales/en-US/common.json src/locales/fr-FR/common.json
```

### 2. Update i18n Configuration
```typescript
// src/i18n.ts
import frFR from "./locales/fr-FR/common.json";

i18n.init({
  fallbackLng: "es-PE",
  supportedLngs: ["es-PE", "en-US", "fr-FR"], // Add new language
  resources: {
    "es-PE": { common: esPE },
    "en-US": { common: enUS },
    "fr-FR": { common: frFR }  // Add new resource
  }
});
```

### 3. Update Language Selector
```typescript
// src/components/LangSelector.tsx
const LANGS: Lang[] = [
  { code: "es-PE", label: "Español (Perú)" },
  { code: "en-US", label: "English (US)" },
  { code: "fr-FR", label: "Français (France)" } // Add new language
];
```

## Translation Workflow

### 1. Developer Workflow

#### Adding New Translatable Text
1. **Identify the text** that needs translation
2. **Choose appropriate key** following naming convention
3. **Add to all locale files** with English as base
4. **Use in component** with `useTranslation` hook

```tsx
// Before
<button>Save Project</button>

// After
<button>{t("project.save")}</button>
```

#### Key Addition Example
```json
// en-US/common.json
{
  "project.save": "Save Project",
  "project.saveSuccess": "Project saved successfully!"
}

// es-PE/common.json
{
  "project.save": "Guardar Proyecto",
  "project.saveSuccess": "¡Proyecto guardado exitosamente!"
}
```

### 2. Translation Workflow

#### For Translators
1. **Copy English file** as starting point
2. **Translate values** (never change keys)
3. **Maintain interpolation placeholders** exactly
4. **Test in application** to ensure proper formatting

#### Quality Assurance
- **Context matters**: Understand where text appears
- **Consistency**: Use same terms throughout
- **Placeholders**: Keep `{{variable}}` intact
- **Formatting**: Maintain punctuation and spacing

## Best Practices

### 1. Component Implementation

#### Do ✅
```tsx
const { t } = useTranslation();

// Use semantic keys
<h1>{t("project.title")}</h1>

// Include context in key names
<button>{t("project.save")}</button>
<button>{t("project.saveAndClose")}</button>

// Use interpolation for dynamic content
<p>{t("status.progress", { pct: 75, note: "Processing..." })}</p>
```

#### Don't ❌
```tsx
// Don't hardcode strings
<h1>Project Configuration</h1>

// Don't use generic keys without context
<button>{t("save")}</button>

// Don't concatenate translations
<p>{t("hello")} {userName} {t("welcome")}</p>
```

### 2. Key Management

#### Naming Best Practices
- Use **descriptive, hierarchical keys**
- Include **context** in key names
- Keep keys **consistent** across features
- Use **present tense** for actions

```json
{
  "good": {
    "nav.home": "Home",
    "project.title": "Project Configuration", 
    "project.saveButton": "Save Configuration",
    "status.generating": "Generating…"
  },
  "avoid": {
    "home": "Home",
    "title": "Project Configuration",
    "save": "Save",
    "gen": "Generating…"
  }
}
```

#### Interpolation Guidelines
- Use **clear variable names**: `{{fileName}}` not `{{f}}`
- Include **formatting hints**: `{{count, number}}`
- Provide **context** in comments when needed

### 3. File Organization

#### Single vs Multiple Files
Currently using single `common.json` per locale, but can split by feature:

```
locales/
├── en-US/
│   ├── common.json      # Shared/general terms
│   ├── navigation.json  # Navigation items
│   ├── project.json     # Project configuration
│   └── workflow.json    # Workflow-specific terms
└── es-PE/
    ├── common.json
    ├── navigation.json
    ├── project.json
    └── workflow.json
```

## Testing and Validation

### 1. Manual Testing
- **Switch languages** using language selector
- **Verify all text** translates correctly
- **Check formatting** of numbers, dates, plurals
- **Test edge cases** (very long/short translations)

### 2. Automated Validation
Create validation scripts to ensure:
- **All keys exist** in all locale files
- **No missing translations**
- **Interpolation placeholders** match
- **JSON syntax** is valid

### 3. Layout Testing
Different languages have different text lengths:
- **German**: Often 30% longer than English
- **Spanish**: Usually 15-20% longer than English
- **Chinese**: Often shorter but may need different font

Test UI with longer translations to ensure proper layout.

## Common Patterns

### 1. Conditional Text
```tsx
const getStatusText = (status: string) => {
  switch(status) {
    case 'loading': return t("status.loading");
    case 'success': return t("status.success");
    case 'error': return t("status.error");
    default: return t("status.unknown");
  }
};
```

### 2. Dynamic Lists
```tsx
const navItems = [
  { to: "/", label: t("nav.home") },
  { to: "/project", label: t("nav.project") },
  { to: "/settings", label: t("nav.settings") }
];
```

### 3. Form Validation Messages
```json
{
  "validation.required": "This field is required",
  "validation.email": "Please enter a valid email address",
  "validation.minLength": "Must be at least {{min}} characters"
}
```

## Maintenance

### 1. Regular Tasks
- **Audit unused keys** and remove them
- **Check for missing translations** across locales
- **Update translations** when UI text changes
- **Review translation quality** with native speakers

### 2. Version Control
- **Track translation changes** in commits
- **Use clear commit messages** for translation updates
- **Consider separate PRs** for translation-only changes

### 3. Performance
- **Lazy load** large translation files if needed
- **Split namespaces** by features for better performance
- **Cache translations** appropriately

## Troubleshooting

### Common Issues

1. **Missing translations show key instead of text**
   - Check if key exists in locale file
   - Verify correct namespace usage
   - Ensure language is properly loaded

2. **Interpolation not working**
   - Check placeholder syntax: `{{variable}}`
   - Verify variable names match between template and component
   - Ensure ICU plugin is loaded for complex formatting

3. **Language detection not working**
   - Check browser language settings
   - Verify localStorage key (`khipu.lang`)
   - Ensure LanguageDetector is properly configured

4. **Layout breaks with translations**
   - Test with longer German/Spanish text
   - Use flexible CSS layouts
   - Consider text overflow handling

This comprehensive guide should help maintain and extend the internationalization system in Khipu Studio effectively.
