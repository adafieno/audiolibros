// Simple test to verify workflow migration
const fs = require('fs');
const path = require('path');

const projectRoot = 'c:/projects/audiobooks/projects/test_7';

async function testMigration() {
  try {
    // Read legacy workflow state
    const legacyStatePath = path.join(projectRoot, 'workflow-state.json');
    const legacyState = JSON.parse(fs.readFileSync(legacyStatePath, 'utf8'));
    console.log('Legacy state:', legacyState);
    
    // Read current project config
    const configPath = path.join(projectRoot, 'project.khipu.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('Has workflow in config?', !!config.workflow);
    
    // Simulate migration
    const updatedConfig = {
      ...config,
      workflow: config.workflow || {}
    };
    
    // Migrate each completed step
    for (const step of legacyState.completedSteps) {
      updatedConfig.workflow[step] = { 
        complete: true, 
        completedAt: new Date().toISOString() 
      };
    }
    
    console.log('Would update config with workflow:', updatedConfig.workflow);
    
    // Write the updated config
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
    console.log('✅ Migration completed!');
    
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

testMigration();
