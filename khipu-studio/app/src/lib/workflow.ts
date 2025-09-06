import type { WorkflowStep } from '../store/project';
import { readJSON, writeJSON } from './fs';

const WORKFLOW_STATE_FILE = 'workflow-state.json';

export interface WorkflowState {
  completedSteps: WorkflowStep[];
}

export async function saveWorkflowState(projectRoot: string, completedSteps: Set<WorkflowStep>): Promise<void> {
  try {
    const state: WorkflowState = {
      completedSteps: Array.from(completedSteps)
    };
    
    await writeJSON(projectRoot, WORKFLOW_STATE_FILE, state);
  } catch (error) {
    console.warn('Failed to save workflow state:', error);
  }
}

export async function loadWorkflowState(projectRoot: string): Promise<Set<WorkflowStep>> {
  try {
    const state = await readJSON<WorkflowState>(projectRoot, WORKFLOW_STATE_FILE);
    return new Set(state?.completedSteps || []);
  } catch {
    // File doesn't exist or other error - return empty set
    return new Set();
  }
}
