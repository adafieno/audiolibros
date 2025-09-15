// Process Protection Hook
// Custom hook for accessing the process protection context

import { useContext } from 'react';
import { ProcessProtectionContext } from '../contexts/ProcessProtectionContext';

export const useProcessProtection = () => {
  const context = useContext(ProcessProtectionContext);
  if (!context) {
    throw new Error('useProcessProtection must be used within a ProcessProtectionProvider');
  }
  return context;
};