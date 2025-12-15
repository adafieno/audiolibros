# UI Styling Consistency Audit
**Generated:** December 14, 2025  
**Scope:** khipu-web (React/TanStack Router)

This document audits all UI elements across pages for styling consistency, identifying issues and recommendations for standardization.

---

## STANDARDIZED COMPONENTS

### ✅ Button Component (`/components/Button.tsx`)
**Variants:** primary, secondary, success, danger, warning, ghost, outline  
**Sizes:** compact (32px), normal (44px), large (48px)  
**Styles:**
- Border radius: `8px` (compact: `4px`)
- Padding: `10px 16px` (normal)
- Font size: `14px` (normal)
- Uses CSS variables for colors
- Hover effects with transform and shadow
- Loading state with spinner

---

## PAGE-BY-PAGE AUDIT

### 1. **Projects (Home) - `projects.index.tsx`**

#### ✅ Correct Elements:
- Page title/subtitle structure
- Uses CSS variables for colors

#### ❌ Issues Found:

**Search Input**
```tsx
className="px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)', width: '200px' }}
```
- ❌ Uses Tailwind `rounded-md` instead of explicit borderRadius
- ❌ `focus:ring-blue-500` hardcoded, should use CSS variable
- ❌ No standard input component

**Status Dropdown**
```tsx
className="px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
```
- ❌ Same issues as search input
- ❌ No standard select component

**New Project Button (Link styled as button)**
```tsx
className="px-4 py-2 rounded-lg hover:opacity-90 transition-colors"
style={{ backgroundColor: 'var(--accent)', color: 'white' }}
```
- ❌ NOT using Button component
- ❌ Padding (px-4 py-2) doesn't match Button component standards (10px 16px)
- ❌ `rounded-lg` is different from Button's `borderRadius: '8px'`

**Status Pills on Project Cards**
```tsx
className="ml-2 px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap"
className={project.status === 'completed' ? 'bg-green-100 text-green-800' : ...}
```
- ❌ Hardcoded Tailwind colors: `bg-green-100`, `text-green-800`, `bg-blue-100`, etc.
- ❌ Inconsistent with workflow completion pills which use `#22c55e` and `#052e12`
- ❌ Should use CSS variables

**Pagination Buttons**
```tsx
className={page === data.page ? 'px-4 py-2 rounded-md bg-blue-600 text-white' : 'px-4 py-2 rounded-md bg-white text-gray-700 hover:bg-gray-50'}
```
- ❌ Hardcoded colors (`bg-blue-600`, `bg-white`, `text-gray-700`)
- ❌ NOT using Button component
- ❌ `rounded-md` instead of Button's `8px`

---

### 2. **Project Properties - `projects.$projectId.properties.tsx`**

#### ✅ Correct Elements:
- Title/subtitle with `text-sm` class
- Completion pill: `padding: '0.25rem 0.75rem'`, `borderRadius: '9999px'`, `background: '#22c55e'`, `color: '#052e12'`

#### ❌ Issues Found:

**Input Fields (TTS, LLM configs)**
```tsx
className="w-full px-3 py-2 border rounded-md"
style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
```
- ❌ Tailwind `rounded-md` mixed with inline styles
- ❌ No standard input component
- ❌ Padding (px-3 py-2) should be standardized

**Dropdown/Select Elements**
```tsx
className="w-32 px-2 py-1 border rounded text-sm"
style={{ backgroundColor: 'var(--panel)', borderColor: 'var(--border)', color: 'var(--text)' }}
```
- ❌ Inconsistent padding (px-2 py-1) vs other selects
- ❌ Mix of Tailwind and inline styles

**Checkbox Elements**
```tsx
type="checkbox"
style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
```
- ✅ Good: Uses CSS variable for accent color
- ⚠️ No standardized checkbox component

---

### 3. **Manuscript - `projects.$projectId.manuscript.tsx`**

#### ✅ Correct Elements:
- Uses Button component correctly
- Title/subtitle structure correct

#### ❌ Issues Found:

**File Input (hidden, triggers via label)**
```tsx
<input type="file" ... style={{ display: 'none' }} />
<label style={{ display: 'inline-block' }}>
  <Button variant="primary">Import Document</Button>
</label>
```
- ✅ Good pattern wrapping Button in label

---

### 4. **Casting - `projects.$projectId.casting.tsx`**

#### ✅ Correct Elements:
- Uses Button component correctly (Select All, Deselect All)
- Completion pill standardized
- Title/subtitle structure correct

#### ❌ Issues Found:

**Filter Dropdowns (Gender, Locale, Language)**
```tsx
style={{
  padding: '8px 12px',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  backgroundColor: 'var(--panel)',
  color: 'var(--text)',
  fontSize: '14px',
}}
```
- ⚠️ Uses explicit values but no standard select component
- ✅ Uses CSS variables
- ⚠️ borderRadius '4px' different from inputs elsewhere

**Show Selected Checkbox**
```tsx
<input type="checkbox" ... style={{ marginRight: '8px', accentColor: 'var(--accent)' }} />
```
- ✅ Uses CSS variable
- ⚠️ No standard checkbox component

**Voice Cards**
```tsx
style={{
  backgroundColor: isSelected ? 'var(--accent-100)' : 'var(--panel)',
  border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
  borderRadius: '8px',
  padding: '16px',
}}
```
- ✅ Uses CSS variables
- ✅ Consistent borderRadius

**Audition Buttons in Cards**
```tsx
<Button variant="primary" size="compact">Audition</Button>
```
- ✅ Correctly uses Button component with compact size

---

### 5. **Characters - `projects.$projectId.characters.tsx`**

#### ✅ Correct Elements:
- Uses Button component throughout
- Completion pill standardized
- Title/subtitle structure correct

#### ❌ Issues Found:

**Character Cards**
```tsx
style={{
  backgroundColor: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '16px',
}}
```
- ✅ Uses CSS variables consistently
- ✅ Consistent borderRadius

**Inline Edit Input Fields**
```tsx
<input
  type="text"
  value={character.name}
  onChange={...}
  style={{
    width: '100%',
    padding: '4px 8px',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    backgroundColor: 'var(--panel)',
    color: 'var(--text)',
    fontSize: '14px',
  }}
/>
```
- ⚠️ Inline editing inputs have different padding (4px 8px) vs standard inputs (px-3 py-2)
- ✅ Uses CSS variables
- ⚠️ borderRadius '4px' vs '8px' elsewhere

**Voice Dropdown in Cards**
```tsx
<select
  value={character.voiceAssignment?.voiceId || ''}
  onChange={...}
  style={{
    width: '100%',
    padding: '4px 8px',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    backgroundColor: 'var(--panel)',
    color: 'var(--text)',
    fontSize: '12px',
  }}
>
```
- ⚠️ Small padding (4px 8px) and fontSize (12px) for compact display
- ✅ Uses CSS variables consistently

**Range Sliders (Rate, Pitch, Style Degree)**
```tsx
<input
  type="range"
  min="-50"
  max="50"
  value={character.voiceAssignment?.rate_pct || 0}
  onChange={...}
  style={{ width: '100%', accentColor: 'var(--accent)' }}
/>
```
- ✅ Uses CSS variable for accent color
- ✅ Simple, effective styling

---

### 6. **Orchestration - `projects.$projectId.orchestration.tsx`**

#### Status: Placeholder page
- Simple "Coming Soon" message
- Title/subtitle structure correct
- No interactive elements yet

---

### 7. **Audio Production - `projects.$projectId.audio-production.tsx`**

#### Status: Placeholder page
- Simple "Coming Soon" message
- Title/subtitle structure correct
- No interactive elements yet

---

## SUMMARY OF ISSUES

### 🔴 Critical Issues (Must Fix):

1. **Inconsistent Button Usage**
   - Projects page: New Project button NOT using Button component
   - Projects page: Pagination buttons NOT using Button component
   - **Fix:** Replace with Button component

2. **Status Pills Inconsistency**
   - Projects page: Uses Tailwind hardcoded colors (`bg-green-100`, etc.)
   - Other pages: Use standardized completion pills (`#22c55e`, `#052e12`)
   - **Fix:** Create standard StatusPill component or unify styling

3. **Mixed Styling Approaches**
   - Some elements use Tailwind classes (`rounded-md`, `px-3 py-2`)
   - Others use inline styles (`borderRadius: '8px'`, `padding: '12px 16px'`)
   - **Fix:** Standardize on one approach (preferably inline with CSS variables)

4. **Focus Ring Colors**
   - Some inputs use `focus:ring-blue-500` (hardcoded)
   - Should use CSS variable like `var(--accent)`
   - **Fix:** Create standard focus style

### 🟡 Medium Priority:

5. **No Standard Input Component**
   - Inputs have varying padding: `px-3 py-2`, `4px 8px`, `8px 12px`
   - Border radius varies: `rounded-md`, `4px`, `8px`
   - **Fix:** Create TextInput component

6. **No Standard Select Component**
   - Selects have varying padding and styling
   - **Fix:** Create Select/Dropdown component

7. **Checkbox Styling**
   - Currently just using native checkboxes with `accentColor`
   - **Fix:** Consider standard Checkbox component for consistency

8. **Card Styling Variations**
   - Character cards: `borderRadius: '8px'`, `padding: '16px'`
   - Voice cards: `borderRadius: '8px'`, `padding: '16px'`
   - **Fix:** ✅ Already consistent, but could create Card component

### 🟢 Low Priority:

9. **Compact vs Normal Sizing**
   - Inline edit inputs use smaller padding (4px 8px)
   - This is intentional for compact display
   - **Fix:** Document this as intentional design pattern

10. **Border Radius Standardization**
    - Most use `8px` for major elements
    - Compact elements use `4px`
    - Pills use `9999px` (full rounded)
    - **Fix:** ✅ Already fairly consistent, document standards

---

## RECOMMENDED STANDARDS

### Button Standards (Already Established ✅)
- Component: `/components/Button.tsx`
- Border radius: `8px` (compact: `4px`)
- Padding: `10px 16px` (normal), `4px 8px` (compact)
- Font size: `14px` (normal), `12px` (compact)

### Proposed Input Standards
```tsx
interface StandardInputProps {
  size?: 'normal' | 'compact';
}

// Normal:
padding: '10px 12px',
fontSize: '14px',
borderRadius: '8px',
border: '1px solid var(--border)',
backgroundColor: 'var(--panel)',
color: 'var(--text)',

// Compact (for inline editing):
padding: '4px 8px',
fontSize: '12px',
borderRadius: '4px',
```

### Proposed Select Standards
```tsx
// Same as Input standards
// Add dropdown arrow styling
```

### Proposed Pill Standards
```tsx
// Completion Pills (workflow status):
padding: '0.25rem 0.75rem',  // 4px 12px
borderRadius: '9999px',
fontSize: '0.875rem',  // 14px
fontWeight: 500,
background: '#22c55e',  // green success
color: '#052e12',  // dark green text

// Status Pills (project status):
padding: '4px 12px',
borderRadius: '9999px',
fontSize: '12px',
fontWeight: 500,
// Colors based on status:
- draft: 'bg: var(--muted)', color: 'var(--text-muted)'
- in_progress: 'bg: var(--accent-light)', color: 'var(--accent-dark)'
- completed: 'bg: var(--success-light)', color: 'var(--success-dark)'
```

### Focus Ring Standard
```tsx
focus: {
  outline: '2px solid var(--accent)',
  outlineOffset: '2px',
}
// Remove Tailwind focus:ring-blue-500
```

---

## ACTION ITEMS

### Phase 1: Critical Fixes
- [ ] Create standard TextInput component
- [ ] Create standard Select component
- [ ] Replace Link-as-button with Button component on Projects page
- [ ] Replace pagination buttons with Button component
- [ ] Standardize status pills (create StatusPill component)
- [ ] Remove all hardcoded Tailwind color classes

### Phase 2: Consistency
- [ ] Audit all focus states, replace `focus:ring-blue-500` with CSS variable
- [ ] Create Checkbox component (optional)
- [ ] Document compact vs normal sizing conventions
- [ ] Add CSS variables for missing colors (success-light, accent-light, etc.)

### Phase 3: Documentation
- [ ] Document all standard components in Storybook or README
- [ ] Create design system guide
- [ ] Add linting rules to catch hardcoded colors

---

## NOTES

- **Button component is well-designed and should be the model for other components**
- **Most pages use CSS variables correctly (good!)**
- **Main issue is mixing Tailwind classes with inline styles**
- **Need standard Input/Select components to match Button quality**
