import type { WorkflowStep } from '../store/project';
import { readJSON, writeJSON } from './fs';
import type { ProjectConfig } from '../types/config';

export interface WorkflowState {
  completedSteps: WorkflowStep[];
}

export async function saveWorkflowState(projectRoot: string, completedSteps: Set<WorkflowStep>): Promise<void> {
  try {
    // Update project config with workflow completion state
    let config: ProjectConfig | null;
    try {
      config = await readJSON<ProjectConfig>(projectRoot, 'project.khipu.json');
    } catch {
      // If config doesn't exist, we can't save workflow state
      console.warn('Project config not found, cannot save workflow state');
      return;
    }

    if (!config) {
      console.warn('Project config is null, cannot save workflow state');
      return;
    }

    // Update workflow section
    config.workflow = config.workflow || {};
    
    // Map completedSteps set to workflow config structure
    for (const step of completedSteps) {
      switch (step) {
        case 'project':
          config.workflow.project = config.workflow.project || {};
          config.workflow.project.complete = true;
          if (!config.workflow.project.completedAt) {
            config.workflow.project.completedAt = new Date().toISOString();
          }
          break;
        case 'manuscript':
          config.workflow.manuscript = config.workflow.manuscript || {};
          config.workflow.manuscript.complete = true;
          if (!config.workflow.manuscript.completedAt) {
            config.workflow.manuscript.completedAt = new Date().toISOString();
          }
          break;
        case 'casting':
          config.workflow.casting = config.workflow.casting || {};
          config.workflow.casting.complete = true;
          if (!config.workflow.casting.completedAt) {
            config.workflow.casting.completedAt = new Date().toISOString();
          }
          break;
        case 'characters':
          config.workflow.characters = config.workflow.characters || {};
          config.workflow.characters.complete = true;
          if (!config.workflow.characters.completedAt) {
            config.workflow.characters.completedAt = new Date().toISOString();
          }
          break;
        case 'dossier':
          config.workflow.dossier = config.workflow.dossier || {};
          config.workflow.dossier.complete = true;
          if (!config.workflow.dossier.completedAt) {
            config.workflow.dossier.completedAt = new Date().toISOString();
          }
          break;
        case 'planning':
          config.workflow.planning = config.workflow.planning || {};
          config.workflow.planning.complete = true;
          if (!config.workflow.planning.completedAt) {
            config.workflow.planning.completedAt = new Date().toISOString();
          }
          break;
        case 'ssml':
          config.workflow.ssml = config.workflow.ssml || {};
          config.workflow.ssml.complete = true;
          if (!config.workflow.ssml.completedAt) {
            config.workflow.ssml.completedAt = new Date().toISOString();
          }
          break;
        case 'voice':
          config.workflow.voice = config.workflow.voice || {};
          config.workflow.voice.complete = true;
          if (!config.workflow.voice.completedAt) {
            config.workflow.voice.completedAt = new Date().toISOString();
          }
          break;
        case 'export':
          config.workflow.export = config.workflow.export || {};
          config.workflow.export.complete = true;
          if (!config.workflow.export.completedAt) {
            config.workflow.export.completedAt = new Date().toISOString();
          }
          break;
      }
    }
    
    await writeJSON(projectRoot, 'project.khipu.json', config);
  } catch (error) {
    console.warn('Failed to save workflow state:', error);
  }
}

export async function loadWorkflowState(projectRoot: string): Promise<Set<WorkflowStep>> {
  try {
    // First, try to load from project config
    const config = await readJSON<ProjectConfig>(projectRoot, 'project.khipu.json');
    const completedSteps = new Set<WorkflowStep>();
    
    if (config?.workflow) {
      // Check each possible workflow step from project config
      if (config.workflow.project?.complete) completedSteps.add('project');
      if (config.workflow.manuscript?.complete) completedSteps.add('manuscript');
      if (config.workflow.casting?.complete) completedSteps.add('casting');
      if (config.workflow.characters?.complete) completedSteps.add('characters');
      if (config.workflow.dossier?.complete) completedSteps.add('dossier');
      if (config.workflow.planning?.complete) completedSteps.add('planning');
      if (config.workflow.ssml?.complete) completedSteps.add('ssml');
      if (config.workflow.voice?.complete) completedSteps.add('voice');
      if (config.workflow.export?.complete) completedSteps.add('export');
      
      // If we found any completed steps in the config, return those
      if (completedSteps.size > 0) {
        return completedSteps;
      }
    }
    
    // If no workflow data in project config, try to migrate from old workflow-state.json
    try {
      const legacyState = await readJSON<WorkflowState>(projectRoot, 'workflow-state.json');
      if (legacyState?.completedSteps) {
        const legacySteps = new Set(legacyState.completedSteps);
        
        // Migrate to project config format
        if (config && legacySteps.size > 0) {
          const updatedConfig = {
            ...config,
            workflow: config.workflow || {}
          };
          
          // Migrate each completed step
          for (const step of legacySteps) {
            switch (step) {
              case 'project':
                updatedConfig.workflow.project = { complete: true, completedAt: new Date().toISOString() };
                break;
              case 'manuscript':
                updatedConfig.workflow.manuscript = { complete: true, completedAt: new Date().toISOString() };
                break;
              case 'casting':
                updatedConfig.workflow.casting = { complete: true, completedAt: new Date().toISOString() };
                break;
              case 'characters':
                updatedConfig.workflow.characters = { complete: true, completedAt: new Date().toISOString() };
                break;
              case 'dossier':
                updatedConfig.workflow.dossier = { complete: true, completedAt: new Date().toISOString() };
                break;
              case 'planning':
                updatedConfig.workflow.planning = { complete: true, completedAt: new Date().toISOString() };
                break;
              case 'ssml':
                updatedConfig.workflow.ssml = { complete: true, completedAt: new Date().toISOString() };
                break;
              case 'voice':
                updatedConfig.workflow.voice = { complete: true, completedAt: new Date().toISOString() };
                break;
              case 'export':
                updatedConfig.workflow.export = { complete: true, completedAt: new Date().toISOString() };
                break;
            }
          }
          
          // Save the migrated config
          try {
            await writeJSON(projectRoot, 'project.khipu.json', updatedConfig);
            console.log('Migrated workflow state from legacy format to project config');
          } catch (error) {
            console.warn('Failed to save migrated workflow state:', error);
          }
        }
        
        return legacySteps;
      }
    } catch {
      // Legacy file doesn't exist or failed to read - that's okay
    }
    
    return completedSteps;
  } catch {
    // File doesn't exist or other error - return empty set
    return new Set();
  }
}
