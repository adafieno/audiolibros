import { Navigate, useLocation } from "react-router-dom";
import { useProject } from "../store/project";
import React from "react";

export function RequireProject({ children }: { children: React.ReactElement }) {
  const root = useProject((s) => s.root);
  const loc = useLocation();
  if (!root) return <Navigate to="/" state={{ from: loc }} replace />;
  return children;
}
