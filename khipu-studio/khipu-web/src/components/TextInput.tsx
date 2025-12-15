import React from 'react';

export type TextInputSize = 'normal' | 'compact';

export interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: TextInputSize;
}

/**
 * Standardized text input component with consistent styling
 */
export function TextInput({ 
  size = 'normal',
  className,
  style,
  ...props 
}: TextInputProps) {
  const getInputStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      fontFamily: 'inherit',
      border: '1px solid var(--border)',
      backgroundColor: 'var(--panel)',
      color: 'var(--text)',
      transition: 'all 0.2s ease',
      outline: 'none',
    };

    const sizeStyles: Record<TextInputSize, React.CSSProperties> = {
      normal: {
        padding: '10px 12px',
        fontSize: '14px',
        borderRadius: '8px',
      },
      compact: {
        padding: '4px 8px',
        fontSize: '12px',
        borderRadius: '4px',
      }
    };

    return {
      ...baseStyles,
      ...sizeStyles[size],
      ...style,
    };
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.outline = '2px solid var(--accent)';
    e.currentTarget.style.outlineOffset = '2px';
    props.onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.outline = 'none';
    props.onBlur?.(e);
  };

  return (
    <input
      {...props}
      className={className}
      style={getInputStyles()}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}
