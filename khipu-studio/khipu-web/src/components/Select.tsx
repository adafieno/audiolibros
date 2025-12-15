import React from 'react';

export type SelectSize = 'normal' | 'compact';

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: SelectSize;
}

/**
 * Standardized select/dropdown component with consistent styling
 */
export function Select({ 
  size = 'normal',
  className,
  style,
  children,
  ...props 
}: SelectProps) {
  const getSelectStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      fontFamily: 'inherit',
      border: '1px solid var(--border)',
      backgroundColor: 'var(--panel)',
      color: 'var(--text)',
      transition: 'all 0.2s ease',
      outline: 'none',
      cursor: 'pointer',
    };

    const sizeStyles: Record<SelectSize, React.CSSProperties> = {
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

  const handleFocus = (e: React.FocusEvent<HTMLSelectElement>) => {
    e.currentTarget.style.outline = '2px solid var(--accent)';
    e.currentTarget.style.outlineOffset = '2px';
    props.onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLSelectElement>) => {
    e.currentTarget.style.outline = 'none';
    props.onBlur?.(e);
  };

  return (
    <select
      {...props}
      className={className}
      style={getSelectStyles()}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {children}
    </select>
  );
}
