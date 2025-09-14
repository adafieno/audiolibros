import type { StandardButtonProps } from './StandardButton';

/**
 * Quick utility functions for common button styles
 */
export const ButtonStyles = {
  primary: (props: Partial<StandardButtonProps> = {}) => 
    ({ variant: 'primary' as const, ...props }),
  secondary: (props: Partial<StandardButtonProps> = {}) => 
    ({ variant: 'secondary' as const, ...props }),
  success: (props: Partial<StandardButtonProps> = {}) => 
    ({ variant: 'success' as const, ...props }),
  danger: (props: Partial<StandardButtonProps> = {}) => 
    ({ variant: 'danger' as const, ...props }),
  warning: (props: Partial<StandardButtonProps> = {}) => 
    ({ variant: 'warning' as const, ...props }),
  compact: (props: Partial<StandardButtonProps> = {}) => 
    ({ size: 'compact' as const, ...props }),
  large: (props: Partial<StandardButtonProps> = {}) => 
    ({ size: 'large' as const, ...props }),
};