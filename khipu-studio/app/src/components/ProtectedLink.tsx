// Protected Link Component
// Navigation link that checks for active processes before allowing navigation

import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigationGuard } from '../hooks/useNavigationGuard';

interface ProtectedLinkProps {
  to: string;
  children: React.ReactNode;
  className?: string;
  onClick?: (e?: React.MouseEvent) => void;
}

export const ProtectedLink: React.FC<ProtectedLinkProps> = ({ 
  to, 
  children, 
  className, 
  onClick 
}) => {
  const { guardedNavigate } = useNavigationGuard();
  const location = useLocation();

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    // Don't navigate if we're already on the target page
    if (location.pathname === to) {
      return;
    }

    // Call any provided onClick handler first
    if (onClick) {
      onClick(e);
    }

    // Use the guarded navigation
    guardedNavigate(to);
  }, [to, location.pathname, guardedNavigate, onClick]);

  return (
    <a
      href={to}
      className={className}
      onClick={handleClick}
    >
      {children}
    </a>
  );
};