// Process Protection Context
// Tracks ongoing processes across the app to prevent navigation interruption

import { createContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface ProcessInfo {
  id: string;
  description: string;
  page: string;
}

interface ProcessProtectionContextType {
  activeProcesses: ProcessInfo[];
  hasActiveProcesses: boolean;
  registerProcess: (id: string, description: string, page: string) => void;
  unregisterProcess: (id: string) => void;
  getConfirmationMessage: () => string;
}

const ProcessProtectionContext = createContext<ProcessProtectionContextType | null>(null);

export { ProcessProtectionContext };

interface ProcessProtectionProviderProps {
  children: ReactNode;
}

export const ProcessProtectionProvider: React.FC<ProcessProtectionProviderProps> = ({ children }) => {
  const [activeProcesses, setActiveProcesses] = useState<ProcessInfo[]>([]);

  const hasActiveProcesses = activeProcesses.length > 0;

  const registerProcess = useCallback((id: string, description: string, page: string) => {
    setActiveProcesses(prev => {
      // Avoid duplicates
      if (prev.some(p => p.id === id)) {
        return prev;
      }
      return [...prev, { id, description, page }];
    });
  }, []);

  const unregisterProcess = useCallback((id: string) => {
    setActiveProcesses(prev => prev.filter(p => p.id !== id));
  }, []);

  const getConfirmationMessage = useCallback(() => {
    if (activeProcesses.length === 0) return '';
    
    if (activeProcesses.length === 1) {
      const process = activeProcesses[0];
      return `You have an ongoing process: "${process.description}" on the ${process.page} page. Navigating away will interrupt it. Are you sure you want to continue?`;
    }
    
    const processList = activeProcesses.map(p => `• ${p.description} (${p.page})`).join('\n');
    return `You have ${activeProcesses.length} ongoing processes:\n\n${processList}\n\nNavigating away will interrupt them. Are you sure you want to continue?`;
  }, [activeProcesses]);

  return (
    <ProcessProtectionContext.Provider value={{
      activeProcesses,
      hasActiveProcesses,
      registerProcess,
      unregisterProcess,
      getConfirmationMessage
    }}>
      {children}
    </ProcessProtectionContext.Provider>
  );
};