# Standardized Button System

This app now uses a standardized button system for consistency across all pages. Use the `StandardButton` component for all new buttons and gradually migrate existing ones.

## Usage

```tsx
import StandardButton from '../components/StandardButton';
import { ButtonStyles } from '../components/button-utils';

// Basic usage
<StandardButton variant="primary">Save</StandardButton>
<StandardButton variant="secondary">Cancel</StandardButton>
<StandardButton variant="success">Complete</StandardButton>
<StandardButton variant="danger">Delete</StandardButton>
<StandardButton variant="warning">Caution</StandardButton>

// With different sizes
<StandardButton size="compact">Small</StandardButton>
<StandardButton size="normal">Normal</StandardButton>
<StandardButton size="large">Large</StandardButton>

// Loading state
<StandardButton loading={isLoading}>Processing...</StandardButton>

// Using utilities (alternative approach)
<StandardButton {...ButtonStyles.primary()}>Primary</StandardButton>
<StandardButton {...ButtonStyles.secondary({ size: 'compact' })}>Compact Secondary</StandardButton>
```

## Migration Guide

Replace existing buttons with the standardized component:

### Before:
```tsx
<button 
  style={{ 
    padding: "6px 12px", 
    fontSize: "14px",
    backgroundColor: "var(--accent)",
    color: "white"
  }}
>
  Action
</button>
```

### After:
```tsx
<StandardButton variant="primary">Action</StandardButton>
```

## Color Scheme

- **Primary**: Uses `--btn-bg` and `--btn-fg` (green theme)
- **Secondary**: Uses `--panel` background with `--border` 
- **Success**: Uses `--success` color (green)
- **Danger**: Uses `--error` color (red)
- **Warning**: Uses `--warning` color (orange)

## Accessibility Features

- Minimum 44px touch target for normal/large sizes
- WCAG compliant color contrast
- Focus indicators with `--focus` color
- Loading state with spinner
- Proper disabled states
- Keyboard navigation support

## CSS Variables Used

The button system relies on CSS variables defined in `index.css`:
- `--btn-bg` / `--btn-bg-h` - Primary button colors
- `--btn-fg` - Button text color
- `--panel` / `--panelAccent` - Secondary button colors
- `--border` - Border colors
- `--success` / `--error` / `--warning` - Status colors
- `--focus` - Focus outline color
- `--shadow-sm` / `--shadow-md` - Button shadows