// Test CSV Export
import { CostTrackingService } from './app/src/lib/cost-tracking-service.ts';

const service = new CostTrackingService();

// Track some test data
service.trackTtsUsage({
  provider: 'azure-tts',
  operation: 'test_synthesis',
  charactersProcessed: 1000,
  audioSeconds: 30,
  wasCached: false,
  cacheHit: false,
  page: 'test-page',
  projectId: 'test-project',
  segmentId: 'segment-001'
});

service.trackLlmUsage({
  provider: 'openai-gpt4o',
  operation: 'character_generation',
  inputTokens: 500,
  outputTokens: 200,
  wasCached: true,
  cacheHit: true,
  page: 'characters-page',
  projectId: 'test-project'
});

// Export CSV
const csvData = service.exportDataAsCsv();
console.log('CSV Export Sample:');
console.log(csvData.substring(0, 500) + '...');