// Navigation Guard Hook
// Prevents navigation when processes are active

import { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useProcessProtection } from './useProcessProtection';

export const useNavigationGuard = () => {
  const { hasActiveProcesses, getConfirmationMessage } = useProcessProtection();
  const navigate = useNavigate();
  const location = useLocation();

  // Override the navigate function to check for active processes
  const guardedNavigate = useCallback((to: string) => {
    if (hasActiveProcesses) {
      const message = getConfirmationMessage();
      if (window.confirm(message)) {
        // User confirmed - allow navigation
        navigate(to);
      }
      // User cancelled - stay on current page
      return;
    }
    
    // No active processes - allow navigation
    navigate(to);
  }, [hasActiveProcesses, getConfirmationMessage, navigate]);

  // Intercept browser back/forward navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasActiveProcesses) {
        e.preventDefault();
        e.returnValue = 'You have ongoing processes that will be interrupted if you leave.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasActiveProcesses]);

  // Handle popstate (back/forward buttons)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (hasActiveProcesses) {
        const message = getConfirmationMessage();
        if (!window.confirm(message)) {
          // User cancelled - push current location back to history
          e.preventDefault();
          window.history.pushState(null, '', location.pathname);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [hasActiveProcesses, getConfirmationMessage, location.pathname]);

  return { guardedNavigate };
};