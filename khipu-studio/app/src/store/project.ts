import { create } from "zustand";
import { loadWorkflowState, saveWorkflowState } from "../lib/workflow";

export type WorkflowStep = 
  | "project"      // Project configuration completed
  | "manuscript"   // Chapters created in manuscript
  | "casting"      // Casting work completed
  | "characters"   // Characters detected and voices assigned
  | "dossier"      // Dossier work completed
  | "planning"     // Planning work completed  
  | "ssml"         // SSML work completed
  | "voice"        // Voice work completed
  | "export";      // Export work completed

type ProjectState = {
  root: string | null;
  completedSteps: Set<WorkflowStep>;
  setRoot: (p: string | null) => void;
  loadWorkflowState: () => Promise<void>;
  markStepCompleted: (step: WorkflowStep) => void;
  isStepCompleted: (step: WorkflowStep) => boolean;
  isStepAvailable: (step: WorkflowStep) => boolean;
  reset: () => void;
};

export const useProject = create<ProjectState>()((set, get) => ({
  root: null,
  completedSteps: new Set(),
  
  setRoot: (p) => {
    set({ root: p });
    // Load workflow state when project changes
    if (p) {
      get().loadWorkflowState();
    }
  },
  
  loadWorkflowState: async () => {
    const { root } = get();
    if (!root) return;
    
    try {
      const completedSteps = await loadWorkflowState(root);
      set({ completedSteps });
    } catch (error) {
      console.warn('Failed to load workflow state:', error);
    }
  },
  
  markStepCompleted: (step) => {
    const { root, completedSteps: current } = get();
    const newCompleted = new Set(current);
    newCompleted.add(step);
    
    set({ completedSteps: newCompleted });
    
    // Persist to disk
    if (root) {
      saveWorkflowState(root, newCompleted).catch(error => 
        console.warn('Failed to save workflow state:', error)
      );
    }
  },
  
  isStepCompleted: (step) => {
    return get().completedSteps.has(step);
  },
  
  isStepAvailable: (step) => {
    const { completedSteps, root } = get();
    
    if (!root) return false; // No project loaded
    
    switch (step) {
      case "project":
      case "manuscript":
        return true; // Always available when project is loaded
        
      case "casting":
        return completedSteps.has("manuscript"); // Available after manuscript
        
      case "characters":
        return completedSteps.has("casting"); // Available after casting
        
      case "planning": 
        return completedSteps.has("characters"); // Available after characters
        
      case "ssml":
        return completedSteps.has("planning"); // Available after planning
               
      case "voice":
        return completedSteps.has("ssml"); // Available after SSML
        
      case "export":
        return completedSteps.has("voice"); // Available after Voice
        
      default:
        return false;
    }
  },
  
  reset: () => set({ root: null, completedSteps: new Set() }),
}));
