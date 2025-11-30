import { useEffect, useState } from 'react';

export type WorkflowCompleted = Record<string, boolean>;

export interface ProjectState {
  currentProjectId?: string;
  root?: unknown;
  workflowCompleted?: WorkflowCompleted;
}

const state: ProjectState = {};

export function setProjectState(update: Partial<ProjectState>) {
  Object.assign(state, update);
}

export function clearProjectState() {
  state.currentProjectId = undefined;
  state.root = undefined;
  state.workflowCompleted = undefined;
}

export function setStepCompleted(step: string, completed: boolean) {
  if (!state.workflowCompleted) {
    state.workflowCompleted = {};
  }
  state.workflowCompleted[step] = completed;
}

export function useProjectState(): ProjectState {
  const [snapshot, setSnapshot] = useState<ProjectState>({ ...state });
  useEffect(() => {
    // Simple polling-based sync; replace with event emitter if needed
    const id = setInterval(() => {
      setSnapshot((prev) => {
        // Avoid unnecessary re-renders when state hasn't changed
        const next = { ...state };
        const changed = JSON.stringify(prev) !== JSON.stringify(next);
        return changed ? next : prev;
      });
    }, 200);
    return () => clearInterval(id);
  }, []);
  return snapshot;
}

export function isStepCompleted(step: string | undefined, workflowCompleted?: WorkflowCompleted): boolean {
  if (!step || !workflowCompleted) return false;
  return workflowCompleted[step] === true;
}

export function isStepAvailable(step: string | undefined, workflowCompleted?: WorkflowCompleted): boolean {
  if (!step) return true;
  if (!workflowCompleted) return step === 'project' || step === 'manuscript';

  switch (step) {
    case 'project':
    case 'manuscript':
      return true;
    case 'casting':
      return workflowCompleted.manuscript === true;
    case 'characters':
      return workflowCompleted.casting === true;
    case 'planning':
    case 'voice':
      return workflowCompleted.characters === true;
    case 'export':
      return workflowCompleted.voice === true;
    default:
      return false;
  }
}
