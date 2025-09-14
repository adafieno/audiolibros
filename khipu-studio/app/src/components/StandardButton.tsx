import React, { type ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning';
export type ButtonSize = 'compact' | 'normal' | 'large';

export interface StandardButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: React.ReactNode;
}

/**
 * Standardized button component with consistent styling and accessibility
 */
export function StandardButton({ 
  variant = 'primary', 
  size = 'normal', 
  loading = false,
  disabled,
  children,
  ...props 
}: StandardButtonProps) {
  const getButtonStyles = () => {
    const baseStyles = {
      fontFamily: 'inherit',
      fontWeight: '500',
      cursor: loading || disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.2s ease',
      border: '1px solid transparent',
      borderRadius: '8px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      opacity: loading || disabled ? 0.6 : 1,
    };

    // Size-specific styles
    const sizeStyles = {
      compact: {
        padding: '4px 8px',
        fontSize: '12px',
        minHeight: '32px',
        minWidth: '32px',
        borderRadius: '4px',
      },
      normal: {
        padding: '10px 16px',
        fontSize: '14px',
        minHeight: '44px',
        minWidth: '44px',
      },
      large: {
        padding: '12px 20px',
        fontSize: '16px',
        minHeight: '48px',
        minWidth: '48px',
      }
    };

    // Variant-specific styles
    const variantStyles = {
      primary: {
        background: 'var(--btn-bg)',
        color: 'var(--btn-fg)',
        border: '1px solid var(--btn-bg)',
      },
      secondary: {
        background: 'var(--panel)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
      },
      success: {
        background: 'var(--success)',
        color: 'white',
        border: '1px solid var(--success)',
      },
      danger: {
        background: 'var(--error)',
        color: 'white',
        border: '1px solid var(--error)',
      },
      warning: {
        background: 'var(--warning)',
        color: 'white',
        border: '1px solid var(--warning)',
      }
    };

    return {
      ...baseStyles,
      ...sizeStyles[size],
      ...variantStyles[variant],
    };
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (loading || disabled) return;
    
    const button = e.currentTarget;
    switch (variant) {
      case 'primary':
        button.style.background = 'var(--btn-bg-h)';
        break;
      case 'secondary':
        button.style.background = 'var(--panelAccent)';
        button.style.borderColor = 'var(--accent)';
        break;
      case 'success':
        button.style.background = '#059669';
        break;
      case 'danger':
        button.style.background = '#dc2626';
        break;
      case 'warning':
        button.style.background = '#d97706';
        break;
    }
    
    if (size !== 'compact') {
      button.style.transform = 'translateY(-1px)';
      button.style.boxShadow = 'var(--shadow-md)';
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (loading || disabled) return;
    
    const button = e.currentTarget;
    const variantStyles = {
      primary: 'var(--btn-bg)',
      secondary: 'var(--panel)',
      success: 'var(--success)',
      danger: 'var(--error)',
      warning: 'var(--warning)',
    };
    
    button.style.background = variantStyles[variant];
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = 'var(--shadow-sm)';
    
    if (variant === 'secondary') {
      button.style.borderColor = 'var(--border)';
    }
  };

  return (
    <button
      {...props}
      disabled={loading || disabled}
      style={getButtonStyles()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={(e) => {
        e.currentTarget.style.outline = '2px solid var(--focus)';
        e.currentTarget.style.outlineOffset = '2px';
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.outline = 'none';
        props.onBlur?.(e);
      }}
    >
      {loading && (
        <div style={{
          width: '16px',
          height: '16px',
          border: '2px solid currentColor',
          borderTop: '2px solid transparent',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
      )}
      {children}
    </button>
  );
}

export default StandardButton;