/**
 * Hardware-style Toggle Switch Component
 */

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  color?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  color = '#4ade80',
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      style={{
        position: 'relative',
        width: '36px',
        height: '18px',
        borderRadius: '9px',
        background: checked 
          ? `linear-gradient(to bottom, ${color}, ${color}dd)` 
          : 'linear-gradient(to bottom, #2a2a2a, #1a1a1a)',
        border: '1px solid ' + (checked ? color : '#000'),
        boxShadow: checked 
          ? `inset 0 1px 3px rgba(0,0,0,0.5), 0 0 8px ${color}40`
          : 'inset 0 2px 4px rgba(0,0,0,0.8)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
        padding: 0,
        outline: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '2px',
          left: checked ? '20px' : '2px',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: checked 
            ? 'radial-gradient(circle at 35% 35%, #fff, #e0e0e0)'
            : 'radial-gradient(circle at 35% 35%, #555, #333)',
          boxShadow: checked
            ? `0 1px 3px rgba(0,0,0,0.4), 0 0 4px ${color}`
            : '0 1px 3px rgba(0,0,0,0.8)',
          transition: 'all 0.2s ease',
        }}
      />
    </button>
  );
}
