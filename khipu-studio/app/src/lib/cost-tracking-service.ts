// Cost Tracking Service
// Service for tracking AI service costs and calculating cache savings

import type { 
  CostEntry, 
  CostSettings, 
  CostSummary, 
  ServiceProvider
} from '../types/cost-tracking';
import { 
  CostCalculator,
  DEFAULT_COST_SETTINGS 
} from '../types/cost-tracking';

/**
 * Service for tracking and analyzing AI service costs
 */
export class CostTrackingService {
  private static instance: CostTrackingService | null = null;
  private costEntries: CostEntry[] = [];
  private settings: CostSettings = { ...DEFAULT_COST_SETTINGS };
  private readonly COST_DATA_FILE = 'cost-tracking.json';
  private readonly COST_SETTINGS_FILE = 'cost-settings.json';
  private changeCallbacks: (() => void)[] = [];
  private currentProjectRoot: string | null = null;
  
  constructor() {
    // We'll load data when setProjectRoot is called
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): CostTrackingService {
    if (!CostTrackingService.instance) {
      CostTrackingService.instance = new CostTrackingService();
    }
    return CostTrackingService.instance;
  }
  
  /**
   * Subscribe to cost data changes
   */
  onDataChange(callback: () => void): () => void {
    this.changeCallbacks.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.changeCallbacks.indexOf(callback);
      if (index > -1) {
        this.changeCallbacks.splice(index, 1);
      }
    };
  }
  
  /**
   * Notify all listeners of data changes
   */
  private notifyDataChange(): void {
    this.changeCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in cost tracking change callback:', error);
      }
    });
  }
  
  /**
   * Set current project root and load data
   */
  async setProjectRoot(projectRoot: string): Promise<void> {
    if (this.currentProjectRoot !== projectRoot) {
      this.currentProjectRoot = projectRoot;
      await this.loadFromFileSystem();
    }
  }

  /**
   * Force reload data from file system (useful for refreshing after external changes)
   */
  async reloadFromFileSystem(): Promise<void> {
    await this.loadFromFileSystem();
  }

  /**
   * Test method for debugging - track a test cost entry
   */
  trackTestCost(): void {
    console.log('🧪 Tracking test cost entry...');
    console.log(`📂 Current project root: ${this.currentProjectRoot}`);
    console.log(`📊 Current entries count: ${this.costEntries.length}`);
    
    if (!this.currentProjectRoot) {
      console.error('❌ No project root set! Cannot track cost.');
      // For debugging, let's try to set a temporary project root
      console.log('🔧 Attempting to get project root from window...');
      
      // Try to get project root from any available source
      const tempRoot = 'C:\\temp\\test-project'; // Fallback for testing
      console.log(`🔧 Using temporary project root: ${tempRoot}`);
      this.currentProjectRoot = tempRoot;
    }

    try {
      this.trackTtsUsage({
        provider: 'azure-tts',
        operation: 'test_operation',
        charactersProcessed: 100,
        wasCached: false,
        cacheHit: false,
        projectId: 'test_project',
        segmentId: 'test_segment'
      });
    } catch (error) {
      console.error('❌ Test cost tracking failed:', error);
    }
  }
  
  /**
   * Load data from file system
   */
  private async loadFromFileSystem(): Promise<void> {
    if (!this.currentProjectRoot) {
      console.log('No project root set, skipping file system load');
      return;
    }

    try {
      // Load cost entries
      try {
        const entriesResult = await window.khipu!.call('fs:read', {
          projectRoot: this.currentProjectRoot,
          relPath: this.COST_DATA_FILE,
          json: false
        });
        
        if (entriesResult && typeof entriesResult === 'string') {
          const entries = JSON.parse(entriesResult);
          this.costEntries = entries.map((entry: Partial<CostEntry>) => ({
            ...entry,
            timestamp: new Date(entry.timestamp || Date.now())
          })) as CostEntry[];
          console.log(`Loaded ${this.costEntries.length} cost entries from file system`);
        }
      } catch {
        // File doesn't exist yet, that's okay
        console.log('Cost entries file not found, starting fresh');
        this.costEntries = [];
      }
      
      // Load settings
      try {
        const settingsResult = await window.khipu!.call('fs:read', {
          projectRoot: this.currentProjectRoot,
          relPath: this.COST_SETTINGS_FILE,
          json: false
        });
        
        if (settingsResult && typeof settingsResult === 'string') {
          this.settings = { ...DEFAULT_COST_SETTINGS, ...JSON.parse(settingsResult) };
          console.log('Loaded cost settings from file system');
        }
      } catch {
        // File doesn't exist yet, that's okay
        console.log('Cost settings file not found, using defaults');
        this.settings = { ...DEFAULT_COST_SETTINGS };
      }
    } catch (error) {
      console.error('Error loading cost tracking data from file system:', error);
    }
  }
  
  /**
   * Save data to file system
   */
  private async saveToFileSystem(): Promise<void> {
    if (!this.currentProjectRoot) {
      console.log('No project root set, skipping file system save');
      return;
    }

    try {
      // Save cost entries
      await window.khipu!.call('fs:write', {
        projectRoot: this.currentProjectRoot,
        relPath: this.COST_DATA_FILE,
        content: JSON.stringify(this.costEntries, null, 2)
      });
      
      // Save settings
      await window.khipu!.call('fs:write', {
        projectRoot: this.currentProjectRoot,
        relPath: this.COST_SETTINGS_FILE,
        content: JSON.stringify(this.settings, null, 2)
      });
      
      console.log('Saved cost tracking data to file system');
      
      // Notify listeners that data has changed
      this.notifyDataChange();
    } catch (error) {
      console.error('Error saving cost tracking data to file system:', error);
    }
  }
  
  /**
   * Get current cost settings
   */
  getSettings(): CostSettings {
    return { ...this.settings };
  }
  
  /**
   * Update cost settings
   */
  updateSettings(newSettings: Partial<CostSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.saveToFileSystem();
  }
  
  /**
   * Track a new cost entry
   */
  trackCost(entry: Omit<CostEntry, 'id' | 'timestamp'>): CostEntry {
    if (!this.settings.enableCostTracking) {
      console.log('Cost tracking is disabled');
      return { ...entry, id: 'disabled', timestamp: new Date() } as CostEntry;
    }
    
    const costEntry: CostEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date()
    };
    
    // Calculate cost if not provided
    if (costEntry.totalCost === 0 && costEntry.unitCost > 0) {
      if (entry.serviceType === 'llm' && entry.inputTokens && entry.outputTokens) {
        costEntry.totalCost = CostCalculator.calculateLlmCost(
          entry.provider,
          entry.inputTokens,
          entry.outputTokens,
          this.settings
        );
      } else if (entry.serviceType === 'tts' && entry.charactersProcessed) {
        costEntry.totalCost = CostCalculator.calculateTtsCost(
          entry.provider,
          entry.charactersProcessed,
          this.settings
        );
      }
    }
    
    // Handle cache savings
    if (costEntry.wasCached && costEntry.cacheHit) {
      // For cache hits, store what the cost would have been as originalCost
      costEntry.originalCost = costEntry.totalCost;
      costEntry.totalCost = 0; // No actual cost for cache hits
      console.log(`💾 Cache hit - saved ${CostCalculator.formatCost(costEntry.originalCost)}`);
    }
    
    this.costEntries.push(costEntry);
    console.log(`📊 Cost entry added - Total entries now: ${this.costEntries.length}`);
    console.log(`💾 Saving to file system at: ${this.currentProjectRoot}/${this.COST_DATA_FILE}`);
    this.saveToFileSystem();
    
    console.log(`💰 Cost tracked: ${CostCalculator.formatCost(costEntry.totalCost)} for ${entry.operation}`);
    
    return costEntry;
  }
  
  /**
   * Track LLM usage
   */
  trackLlmUsage(params: {
    provider: ServiceProvider;
    operation: string;
    inputTokens: number;
    outputTokens: number;
    wasCached?: boolean;
    cacheHit?: boolean;
    page?: string;
    projectId?: string;
    chapterId?: string;
    segmentId?: string;
  }): CostEntry {
    const cost = CostCalculator.calculateLlmCost(
      params.provider,
      params.inputTokens,
      params.outputTokens,
      this.settings
    );
    
    return this.trackCost({
      serviceType: 'llm',
      provider: params.provider,
      operation: params.operation,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      unitCost: cost / (params.inputTokens + params.outputTokens),
      totalCost: cost,
      wasCached: params.wasCached || false,
      cacheHit: params.cacheHit || false,
      page: params.page,
      projectId: params.projectId,
      chapterId: params.chapterId,
      segmentId: params.segmentId
    });
  }
  
  /**
   * Track TTS usage
   */
  trackTtsUsage(params: {
    provider: ServiceProvider;
    operation: string;
    charactersProcessed: number;
    audioSeconds?: number;
    wasCached?: boolean;
    cacheHit?: boolean;
    page?: string;
    projectId?: string;
    chapterId?: string;
    segmentId?: string;
  }): CostEntry {
    const cost = CostCalculator.calculateTtsCost(
      params.provider,
      params.charactersProcessed,
      this.settings
    );
    
    return this.trackCost({
      serviceType: 'tts',
      provider: params.provider,
      operation: params.operation,
      charactersProcessed: params.charactersProcessed,
      audioSeconds: params.audioSeconds,
      unitCost: cost / params.charactersProcessed,
      totalCost: cost,
      wasCached: params.wasCached || false,
      cacheHit: params.cacheHit || false,
      page: params.page,
      projectId: params.projectId,
      chapterId: params.chapterId,
      segmentId: params.segmentId
    });
  }
  
  /**
   * Get all cost entries
   */
  getAllEntries(): CostEntry[] {
    return [...this.costEntries];
  }
  
  /**
   * Get cost entries for a specific time period
   */
  getEntriesByDateRange(startDate: Date, endDate: Date): CostEntry[] {
    return this.costEntries.filter(entry => 
      entry.timestamp >= startDate && entry.timestamp <= endDate
    );
  }
  
  /**
   * Get cost entries for a specific project
   */
  getEntriesByProject(projectId: string): CostEntry[] {
    return this.costEntries.filter(entry => entry.projectId === projectId);
  }
  
  /**
   * Generate cost summary for a time period
   */
  generateSummary(startDate?: Date, endDate?: Date): CostSummary {
    const now = new Date();
    const start = startDate || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const end = endDate || now;
    
    const entries = this.getEntriesByDateRange(start, end);
    
    // Calculate totals
    const totalCost = entries.reduce((sum, entry) => sum + entry.totalCost, 0);
    const totalSavings = entries
      .filter(entry => entry.wasCached && entry.cacheHit && entry.originalCost)
      .reduce((sum, entry) => sum + (entry.originalCost || 0), 0);
    
    // Service breakdown
    const llmCosts = entries
      .filter(entry => entry.serviceType === 'llm')
      .reduce((sum, entry) => sum + entry.totalCost, 0);
    const ttsCosts = entries
      .filter(entry => entry.serviceType === 'tts')
      .reduce((sum, entry) => sum + entry.totalCost, 0);
    
    // Provider breakdown
    const costsByProvider: Record<ServiceProvider, number> = Object.create(null);
    for (const entry of entries) {
      if (!costsByProvider[entry.provider]) {
        costsByProvider[entry.provider] = 0;
      }
      costsByProvider[entry.provider] += entry.totalCost;
    }
    
    // Usage metrics
    const totalLlmTokens = entries
      .filter(entry => entry.serviceType === 'llm')
      .reduce((sum, entry) => sum + (entry.inputTokens || 0) + (entry.outputTokens || 0), 0);
    const totalTtsCharacters = entries
      .filter(entry => entry.serviceType === 'tts')
      .reduce((sum, entry) => sum + (entry.charactersProcessed || 0), 0);
    const totalAudioSeconds = entries
      .reduce((sum, entry) => sum + (entry.audioSeconds || 0), 0);
    
    // Cache statistics
    const cachedEntries = entries.filter(entry => entry.wasCached);
    const cacheHits = cachedEntries.filter(entry => entry.cacheHit);
    const totalCacheHits = cacheHits.length;
    const totalCacheMisses = cachedEntries.length - totalCacheHits;
    const cacheHitRate = cachedEntries.length > 0 ? (totalCacheHits / cachedEntries.length) * 100 : 0;
    
    console.log(`📊 Cache stats debug:`, {
      totalEntries: entries.length,
      cachedEntries: cachedEntries.length,
      cacheHits: totalCacheHits,
      cacheMisses: totalCacheMisses,
      cacheHitRate: cacheHitRate.toFixed(1) + '%'
    });
    
    // Top operations by cost
    const operationCosts: Record<string, { cost: number; count: number }> = {};
    for (const entry of entries) {
      if (!operationCosts[entry.operation]) {
        operationCosts[entry.operation] = { cost: 0, count: 0 };
      }
      operationCosts[entry.operation].cost += entry.totalCost;
      operationCosts[entry.operation].count += 1;
    }
    
    const topOperationsByCost = Object.entries(operationCosts)
      .map(([operation, data]) => ({ operation, ...data }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);
    
    // Module breakdown - group operations by module
    const moduleMapping: Record<string, string> = {
      // TTS Module
      'voice_audition': 'TTS Module',
      'characters:auditionVoice': 'TTS Module',
      'voice_testing': 'TTS Module', 
      'audio_synthesis': 'TTS Module',
      'segment_generation': 'TTS Module',
      'audio_preview': 'TTS Module',
      
      // LLM Module
      'character_assignment': 'LLM Module',
      'characters.assignToSegments': 'LLM Module',
      'characters:assignVoices': 'LLM Module',
      'character_generation': 'LLM Module',
      'character_analysis': 'LLM Module',
      'api.characters.detect': 'LLM Module',
      'manuscript_analysis': 'LLM Module',
      'manuscript:parse': 'LLM Module',
      'text_processing': 'LLM Module',
      'plan:build': 'LLM Module',
      'chapter_planning': 'LLM Module',
      
      // Audio Processing Module
      'audio_processing': 'Audio Processing Module',
      'sox_processing': 'Audio Processing Module',
      'effect_chain': 'Audio Processing Module',
      
      // Text Processing Module  
      'text_parsing': 'Text Processing Module',
      'segment_parsing': 'Text Processing Module',
      'ssml_generation': 'Text Processing Module',
      
      // Cache Module
      'cache_operation': 'Cache Module',
      'cache_management': 'Cache Module'
    };
    
    const moduleCosts: Record<string, { cost: number; count: number; operations: Set<string> }> = {};
    for (const entry of entries) {
      const module = moduleMapping[entry.operation] || 'Other Module';
      if (!moduleCosts[module]) {
        moduleCosts[module] = { cost: 0, count: 0, operations: new Set() };
      }
      moduleCosts[module].cost += entry.totalCost;
      moduleCosts[module].count += 1;
      moduleCosts[module].operations.add(entry.operation);
    }
    
    const costsByModule = Object.entries(moduleCosts)
      .map(([module, data]) => ({
        module,
        cost: data.cost,
        count: data.count,
        operations: Array.from(data.operations)
      }))
      .sort((a, b) => b.cost - a.cost);
    
    // Enhanced daily breakdown with more metrics
    const dailyCostsMap: Record<string, { 
      cost: number; 
      savings: number; 
      llmCost: number; 
      ttsCost: number; 
      operations: number 
    }> = {};
    
    for (const entry of entries) {
      const dateKey = entry.timestamp.toDateString();
      if (!dailyCostsMap[dateKey]) {
        dailyCostsMap[dateKey] = { cost: 0, savings: 0, llmCost: 0, ttsCost: 0, operations: 0 };
      }
      dailyCostsMap[dateKey].cost += entry.totalCost;
      dailyCostsMap[dateKey].operations += 1;
      
      if (entry.serviceType === 'llm') {
        dailyCostsMap[dateKey].llmCost += entry.totalCost;
      } else if (entry.serviceType === 'tts') {
        dailyCostsMap[dateKey].ttsCost += entry.totalCost;
      }
      
      if (entry.wasCached && entry.cacheHit && entry.originalCost) {
        dailyCostsMap[dateKey].savings += entry.originalCost;
      }
    }
    
    const dailyCosts = Object.entries(dailyCostsMap)
      .map(([dateStr, data]) => ({
        date: new Date(dateStr),
        cost: data.cost,
        savings: data.savings,
        llmCost: data.llmCost,
        ttsCost: data.ttsCost,
        operations: data.operations
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    // Page breakdown
    const costsByPage: Record<string, number> = {};
    for (const entry of entries) {
      const page = entry.page || 'unknown';
      if (!costsByPage[page]) {
        costsByPage[page] = 0;
      }
      costsByPage[page] += entry.totalCost;
    }
    
    return {
      startDate: start,
      endDate: end,
      totalCost,
      totalSavings,
      netCost: totalCost - totalSavings,
      llmCosts,
      ttsCosts,
      costsByProvider,
      costsByPage,
      totalLlmTokens,
      totalTtsCharacters,
      totalAudioSeconds,
      totalCacheHits,
      totalCacheMisses,
      cacheHitRate,
      estimatedSavingsFromCache: totalSavings,
      topOperationsByCost,
      costsByModule,
      dailyCosts
    };
  }
  
  /**
   * Clear all cost entries
   */
  clearAllEntries(): void {
    this.costEntries = [];
    this.saveToFileSystem();
  }
  
  /**
   * Export cost data as CSV string
   */
  exportDataAsCsv(t: (key: string, options?: Record<string, unknown>) => string): string {
    const entries = this.getAllEntries();
    
    if (entries.length === 0) {
      return 'No cost data to export';
    }
    
    // Generate summary for metadata
    const summary = this.generateSummary();
    const exportDate = new Date().toISOString();
    
    // Create metadata header
    const metadataLines = [
      `# ${t('cost.csv.exportTitle')}`,
      `# ${t('cost.csv.exportDate')}: ${exportDate}`,
      `# ${t('cost.csv.totalEntries')}: ${entries.length}`,
      `# ${t('cost.totalCost')}: $${summary.totalCost.toFixed(6)}`,
      `# ${t('cost.cacheSavings')}: $${summary.totalSavings.toFixed(6)}`,
      `# ${t('cost.cacheHitRate')}: ${summary.cacheHitRate.toFixed(1)}%`,
      `# ${t('cost.csv.dateRange')}: ${summary.startDate.toISOString()} to ${summary.endDate.toISOString()}`,
      '#',
      `# ${t('cost.csv.dataFormat')}:`,
    ];
    
    // CSV headers
    const headers = [
      t('cost.csv.id'),
      t('cost.csv.timestamp'),
      t('cost.csv.serviceType'),
      t('cost.csv.provider'),
      t('cost.csv.operation'),
      t('cost.csv.totalCost'),
      t('cost.csv.unitCost'),
      t('cost.csv.inputTokens'),
      t('cost.csv.outputTokens'),
      t('cost.csv.charactersProcessed'),
      t('cost.csv.audioSeconds'),
      t('cost.csv.wasCached'),
      t('cost.csv.cacheHit'),
      t('cost.csv.originalCost'),
      t('cost.csv.page'),
      t('cost.csv.projectId'),
      t('cost.csv.chapterId'),
      t('cost.csv.segmentId')
    ];
    
    // Helper function to escape CSV values
    const escapeCsv = (value: string | number | boolean | null | undefined): string => {
      if (value === null || value === undefined) {
        return '';
      }
      
      const str = String(value);
      // If the value contains comma, quote, or newline, wrap in quotes and escape quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };
    
    // Convert entries to CSV rows
    const csvRows = entries.map(entry => [
      escapeCsv(entry.id),
      escapeCsv(entry.timestamp.toISOString()),
      escapeCsv(entry.serviceType),
      escapeCsv(entry.provider),
      escapeCsv(entry.operation),
      escapeCsv(entry.totalCost.toFixed(6)),
      escapeCsv(entry.unitCost?.toFixed(8) || ''),
      escapeCsv(entry.inputTokens || ''),
      escapeCsv(entry.outputTokens || ''),
      escapeCsv(entry.charactersProcessed || ''),
      escapeCsv(entry.audioSeconds || ''),
      escapeCsv(entry.wasCached ? t('cost.csv.yes') : t('cost.csv.no')),
      escapeCsv(entry.cacheHit ? t('cost.csv.yes') : t('cost.csv.no')),
      escapeCsv(entry.originalCost?.toFixed(6) || ''),
      escapeCsv(entry.page || ''),
      escapeCsv(entry.projectId || ''),
      escapeCsv(entry.chapterId || ''),
      escapeCsv(entry.segmentId || '')
    ]);
    
    // Combine metadata, headers and data
    const csvContent = [
      ...metadataLines,
      headers.join(','),
      ...csvRows.map(row => row.join(','))
    ].join('\n');
    
    return csvContent;
  }

  /**
   * Export cost data (legacy JSON format)
   */
  exportData(): { entries: CostEntry[]; settings: CostSettings } {
    return {
      entries: this.getAllEntries(),
      settings: this.getSettings()
    };
  }
  
  /**
   * Import cost data
   */
  importData(data: { entries: CostEntry[]; settings: CostSettings }): void {
    this.costEntries = data.entries.map(entry => ({
      ...entry,
      timestamp: new Date(entry.timestamp)
    }));
    this.settings = { ...DEFAULT_COST_SETTINGS, ...data.settings };
    this.saveToFileSystem();
  }
  
  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `cost_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const costTrackingService = CostTrackingService.getInstance();