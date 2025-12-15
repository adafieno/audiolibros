import React, { type ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'ghost' | 'outline';
export type ButtonSize = 'compact' | 'normal' | 'large';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: React.ReactNode;
}

/**
 * Standardized button component with consistent styling and accessibility
 */
export function Button({ 
  variant = 'primary', 
  size = 'normal', 
  loading = false,
  disabled,
  children,
  className,
  style,
  onMouseEnter,
  onMouseLeave,
  ...props 
}: ButtonProps) {
  const getButtonStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
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
    const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
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
    const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
      primary: {
        background: 'var(--accent)',
        color: 'white',
        border: '1px solid var(--accent)',
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
        background: '#f59e0b',
        color: 'white',
        border: '1px solid #f59e0b',
      },
      ghost: {
        background: 'transparent',
        color: 'var(--text)',
        border: '1px solid transparent',
      },
      outline: {
        background: 'transparent',
        color: 'var(--accent)',
        border: '1px solid var(--accent)',
      }
    };

    return {
      ...baseStyles,
      ...sizeStyles[size],
      ...variantStyles[variant],
      ...style,
    };
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (loading || disabled) return;
    
    const button = e.currentTarget;
    switch (variant) {
      case 'primary':
        button.style.opacity = '0.9';
        break;
      case 'secondary':
        button.style.background = 'var(--panel-hover)';
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
      case 'ghost':
        button.style.background = 'var(--panel)';
        break;
      case 'outline':
        button.style.background = 'var(--accent)';
        button.style.color = 'white';
        break;
    }
    
    if (size !== 'compact') {
      button.style.transform = 'translateY(-1px)';
      button.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)';
    }

    onMouseEnter?.(e);
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (loading || disabled) return;
    
    const button = e.currentTarget;
    const variantStyles: Record<ButtonVariant, string> = {
      primary: 'var(--accent)',
      secondary: 'var(--panel)',
      success: 'var(--success)',
      danger: 'var(--error)',
      warning: '#f59e0b',
      ghost: 'transparent',
      outline: 'transparent',
    };

    button.style.background = variantStyles[variant];
    button.style.opacity = '1';
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = 'none';
    
    // Reset border for secondary
    if (variant === 'secondary') {
      button.style.borderColor = 'var(--border)';
    }
    // Reset color for outline
    if (variant === 'outline') {
      button.style.color = 'var(--accent)';
    }

    onMouseLeave?.(e);
  };

  return (
    <button
      {...props}
      disabled={loading || disabled}
      style={getButtonStyles()}
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {loading && (
        <div style={{
          width: '16px',
          height: '16px',
          border: '2px solid currentColor',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
      )}
      {children}
    </button>
  );
}

export default Button;
