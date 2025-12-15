import { useEffect, useState } from 'react';

export type WorkflowCompleted = Record<string, boolean>;

export interface ProjectState {
  currentProjectId?: string;
  root?: unknown;
  workflowCompleted?: WorkflowCompleted; // keys: book, project, manuscript, casting, characters, orchestration, audio-production, export, cost
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
  // Until we have data, allow initial steps
  if (!workflowCompleted) return step === 'book' || step === 'project' || step === 'manuscript';

  switch (step) {
    case 'book':
    case 'project':
    case 'manuscript':
      return true; // Always available when project loaded
    case 'casting':
      return workflowCompleted.manuscript === true; // After manuscript imported
    case 'characters':
      return workflowCompleted.casting === true; // After casting voices selected
    case 'orchestration':
      return workflowCompleted.characters === true; // After all characters voiced
    case 'audio-production':
      return workflowCompleted.orchestration === true; // After orchestration complete
    case 'export':
      return workflowCompleted['audio-production'] === true; // After full audio generated
    case 'cost':
      return true; // Always visible for tracking costs
    default:
      return false;
  }
}
