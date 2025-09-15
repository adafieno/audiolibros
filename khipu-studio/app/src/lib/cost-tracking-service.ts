// Cost Tracking Service
// Service for tracking AI service costs and calculating cache savings

import type { 
  CostEntry, 
  CostSettings, 
  CostSummary, 
  ServiceProvider,
  TimeEntry,
  TimeSession,
  TimeActivityType
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
  private timeEntries: TimeEntry[] = [];
  private timeSessions: TimeSession[] = [];
  private currentSession: TimeSession | null = null;
  private lastActivity: Date = new Date();
  private activityTimer: number | null = null;
  private settings: CostSettings = { ...DEFAULT_COST_SETTINGS };
  private readonly COST_DATA_FILE = 'cost-tracking.json';
  private readonly TIME_DATA_FILE = 'time-tracking.json';
  private readonly TIME_SESSION_FILE = 'time-sessions.json';
  private readonly COST_SETTINGS_FILE = 'cost-settings.json';
  private changeCallbacks: (() => void)[] = [];
  private currentProjectRoot: string | null = null;
  
  constructor() {
    // We'll load data when setProjectRoot is called
    this.startActivityTracking();
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
   * Start tracking user activity and automation time
   */
  private startActivityTracking(): void {
    // Start a new session when the service is initialized
    this.startNewSession();
    
    // Set up activity detection
    if (typeof window !== 'undefined') {
      // Track mouse movement, keyboard input, and clicks as user interaction
      ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach(event => {
        document.addEventListener(event, () => this.recordUserActivity(), { passive: true });
      });
      
      // Track page visibility changes
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.recordIdleActivity();
        } else {
          this.recordUserActivity();
        }
      });
      
      // Set up idle detection timer (after 30 seconds of inactivity)
      this.resetIdleTimer();
    }
  }
  
  /**
   * Start a new time tracking session
   */
  private startNewSession(): void {
    if (this.currentSession && !this.currentSession.endTime) {
      this.endCurrentSession();
    }
    
    this.currentSession = {
      id: this.generateTimeId(),
      startTime: new Date(),
      totalDuration: 0,
      activeDuration: 0,
      automationDuration: 0,
      idleDuration: 0,
      projectId: this.currentProjectRoot || undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      entries: []
    };
    
    console.log(`⏱️ Started new time tracking session: ${this.currentSession.id}`);
  }
  
  /**
   * End the current time tracking session
   */
  private endCurrentSession(): void {
    if (!this.currentSession) return;
    
    this.currentSession.endTime = new Date();
    this.currentSession.totalDuration = this.currentSession.endTime.getTime() - this.currentSession.startTime.getTime();
    
    this.timeSessions.push(this.currentSession);
    console.log(`⏹️ Ended time tracking session: ${this.currentSession.id}, duration: ${this.formatDuration(this.currentSession.totalDuration)}`);
    
    this.saveTimeDataToFileSystem();
    this.currentSession = null;
  }
  
  /**
   * Record user activity
   */
  private recordUserActivity(): void {
    const now = new Date();
    const timeSinceLastActivity = now.getTime() - this.lastActivity.getTime();
    
    // Only record if it's been more than 1 second since last activity to avoid spam
    if (timeSinceLastActivity > 1000) {
      this.trackTimeActivity('user-interaction', timeSinceLastActivity, {
        page: this.getCurrentPage()
      });
    }
    
    this.lastActivity = now;
    this.resetIdleTimer();
  }
  
  /**
   * Record idle activity
   */
  private recordIdleActivity(): void {
    const now = new Date();
    const timeSinceLastActivity = now.getTime() - this.lastActivity.getTime();
    
    if (timeSinceLastActivity > 1000) {
      this.trackTimeActivity('idle', timeSinceLastActivity, {
        page: this.getCurrentPage()
      });
    }
    
    this.lastActivity = now;
  }
  
  /**
   * Reset the idle detection timer
   */
  private resetIdleTimer(): void {
    if (this.activityTimer) {
      clearTimeout(this.activityTimer);
    }
    
    // Set idle timeout to 30 seconds
    this.activityTimer = setTimeout(() => {
      this.recordIdleActivity();
    }, 30000) as number;
  }
  
  /**
   * Get current page from URL or other context
   */
  private getCurrentPage(): string {
    if (typeof window === 'undefined') return 'unknown';
    
    const path = window.location.pathname;
    const hash = window.location.hash;
    
    // Debug logging
    console.log('🔍 Page detection:', { path, hash });
    
    // Check hash-based routing first (if using hash routing)
    if (hash.includes('manuscript')) return 'manuscript';
    if (hash.includes('casting')) return 'casting';
    if (hash.includes('characters')) return 'characters';
    if (hash.includes('planning') || hash.includes('orchestration')) return 'planning';
    if (hash.includes('voice') || hash.includes('audio')) return 'voice';
    if (hash.includes('packaging')) return 'packaging';
    if (hash.includes('cost')) return 'cost';
    if (hash.includes('settings')) return 'settings';
    
    // Check path-based routing
    if (path.includes('/manuscript')) return 'manuscript';
    if (path.includes('/casting')) return 'casting';
    if (path.includes('/characters')) return 'characters';
    if (path.includes('/planning') || path.includes('/orchestration')) return 'planning';
    if (path.includes('/voice') || path.includes('/audio')) return 'voice';
    if (path.includes('/packaging')) return 'packaging';
    if (path.includes('/cost')) return 'cost';
    if (path.includes('/settings')) return 'settings';
    
    // Default cases
    if (path === '/' || path === '/index.html' || path === '') return 'home';
    
    console.log('⚠️ Unrecognized page:', { path, hash });
    return 'unknown';
  }
  
  /**
   * Track a time activity entry
   */
  trackTimeActivity(
    activityType: TimeActivityType,
    duration: number,
    context: {
      page?: string;
      operation?: string;
      projectId?: string;
      chapterId?: string;
    } = {}
  ): TimeEntry {
    if (!this.currentSession) {
      this.startNewSession();
    }
    
    const timeEntry: TimeEntry = {
      id: this.generateTimeId(),
      timestamp: new Date(),
      sessionId: this.currentSession!.id,
      activityType,
      duration,
      page: context.page,
      operation: context.operation,
      projectId: context.projectId || this.currentProjectRoot || undefined,
      chapterId: context.chapterId,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      isActive: activityType === 'user-interaction'
    };
    
    this.timeEntries.push(timeEntry);
    this.currentSession!.entries.push(timeEntry);
    
    console.log(`⏰ Time entry created:`, {
      id: timeEntry.id,
      activityType: timeEntry.activityType,
      operation: timeEntry.operation,
      duration: timeEntry.duration,
      durationFormatted: this.formatDuration(timeEntry.duration),
      totalTimeEntries: this.timeEntries.length
    });
    
    // Update session totals
    switch (activityType) {
      case 'user-interaction':
        this.currentSession!.activeDuration += duration;
        break;
      case 'automation':
        this.currentSession!.automationDuration += duration;
        break;
      case 'idle':
        this.currentSession!.idleDuration += duration;
        break;
    }
    
    // Save periodically
    if (this.timeEntries.length % 10 === 0) {
      this.saveTimeDataToFileSystem();
    }
    
    return timeEntry;
  }
  
  /**
   * Track automation time (called when automation starts/ends)
   */
  trackAutomation(operation: string, duration: number, context: {
    page?: string;
    projectId?: string;
    chapterId?: string;
  } = {}): TimeEntry {
    console.log(`🤖 [AUTOMATION TRACKING] Creating time entry: ${operation} (${this.formatDuration(duration)})`);
    
    const entry = this.trackTimeActivity('automation', duration, {
      ...context,
      operation
    });
    
    console.log(`📊 [AUTOMATION TRACKING] Time entry created:`, {
      id: entry.id,
      operation: entry.operation,
      activityType: entry.activityType,
      duration: entry.duration,
      formattedDuration: this.formatDuration(entry.duration)
    });
    
    return entry;
  }
  
  /**
   * Track an automated operation by wrapping it with timing
   */
  async trackAutomatedOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    context: {
      page?: string;
      projectId?: string;
      chapterId?: string;
    } = {}
  ): Promise<T> {
    const startTime = Date.now();
    console.log(`🤖 [AUTOMATION TRACKING] Starting: ${operation}`, {
      startTime: new Date(startTime).toISOString(),
      context,
      currentSession: this.currentSession?.id
    });
    
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      console.log(`✅ [AUTOMATION TRACKING] Completed: ${operation}`, {
        duration,
        durationFormatted: this.formatDuration(duration),
        willCreateTimeEntry: true
      });
      this.trackAutomation(operation, duration, context);
      console.log(`📊 [AUTOMATION TRACKING] Time entry created for: ${operation}`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`❌ [AUTOMATION TRACKING] Failed: ${operation}`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
        willCreateFailedTimeEntry: true
      });
      this.trackAutomation(operation + '_failed', duration, context);
      console.log(`📊 [AUTOMATION TRACKING] Failed time entry created for: ${operation}_failed`);
      throw error;
    }
  }
  
  /**
   * Generate a unique ID for time entries
   */
  private generateTimeId(): string {
    return `time_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Format duration in a human-readable way
   */
  private formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
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
      
      // Load time entries
      try {
        const timeEntriesResult = await window.khipu!.call('fs:read', {
          projectRoot: this.currentProjectRoot,
          relPath: this.TIME_DATA_FILE,
          json: false
        });
        
        if (timeEntriesResult && typeof timeEntriesResult === 'string') {
          const entries = JSON.parse(timeEntriesResult);
          this.timeEntries = entries.map((entry: Partial<TimeEntry>) => ({
            ...entry,
            timestamp: new Date(entry.timestamp || Date.now())
          })) as TimeEntry[];
          console.log(`Loaded ${this.timeEntries.length} time entries from file system`);
        }
      } catch {
        console.log('Time entries file not found, starting fresh');
        this.timeEntries = [];
      }
      
      // Load time sessions
      try {
        const timeSessionsResult = await window.khipu!.call('fs:read', {
          projectRoot: this.currentProjectRoot,
          relPath: this.TIME_SESSION_FILE,
          json: false
        });
        
        if (timeSessionsResult && typeof timeSessionsResult === 'string') {
          const sessions = JSON.parse(timeSessionsResult);
          this.timeSessions = sessions.map((session: Partial<TimeSession>) => ({
            ...session,
            startTime: new Date(session.startTime || Date.now()),
            endTime: session.endTime ? new Date(session.endTime) : undefined,
            entries: (session.entries || []).map((entry: Partial<TimeEntry>) => ({
              ...entry,
              timestamp: new Date(entry.timestamp || Date.now())
            }))
          })) as TimeSession[];
          console.log(`Loaded ${this.timeSessions.length} time sessions from file system`);
        }
      } catch {
        console.log('Time sessions file not found, starting fresh');
        this.timeSessions = [];
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
   * Save time tracking data to file system
   */
  private async saveTimeDataToFileSystem(): Promise<void> {
    if (!this.currentProjectRoot) {
      console.log('No project root set, skipping time data save');
      return;
    }

    try {
      // Save time entries
      await window.khipu!.call('fs:write', {
        projectRoot: this.currentProjectRoot,
        relPath: this.TIME_DATA_FILE,
        content: JSON.stringify(this.timeEntries, null, 2)
      });
      
      // Save time sessions
      await window.khipu!.call('fs:write', {
        projectRoot: this.currentProjectRoot,
        relPath: this.TIME_SESSION_FILE,
        content: JSON.stringify(this.timeSessions, null, 2)
      });
      
      console.log('Saved time tracking data to file system');
      
      // Notify listeners that data has changed
      this.notifyDataChange();
    } catch (error) {
      console.error('Error saving time tracking data to file system:', error);
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
    
    // Time tracking calculations
    const timeEntriesInRange = this.timeEntries.filter(entry => 
      entry.timestamp >= start && entry.timestamp <= end
    );
    const timeSessionsInRange = this.timeSessions.filter(session => 
      session.startTime >= start && (session.endTime ? session.endTime <= end : true)
    );
    
    const totalActiveTime = timeEntriesInRange
      .filter(entry => entry.activityType === 'user-interaction')
      .reduce((sum, entry) => sum + entry.duration, 0);
    
    const totalAutomationTime = timeEntriesInRange
      .filter(entry => entry.activityType === 'automation')
      .reduce((sum, entry) => sum + entry.duration, 0);
    
    const totalSessionTime = timeSessionsInRange
      .reduce((sum, session) => sum + session.totalDuration, 0);
    
    const activeTimePercentage = totalSessionTime > 0 
      ? (totalActiveTime / totalSessionTime) * 100 
      : 0;
    
    const averageSessionDuration = timeSessionsInRange.length > 0
      ? totalSessionTime / timeSessionsInRange.length
      : 0;
    
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
      totalActiveTime,
      totalAutomationTime,
      totalSessionTime,
      activeTimePercentage,
      averageSessionDuration,
      totalSessions: timeSessionsInRange.length,
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
   * Get time breakdown by operation for detailed reporting
   */
  getTimeBreakdownByOperation(startDate?: Date, endDate?: Date): Array<{
    operation: string;
    totalTime: number;
    count: number;
    averageTime: number;
    activityType: TimeActivityType;
  }> {
    const now = new Date();
    const start = startDate || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const end = endDate || now;
    
    const timeEntriesInRange = this.timeEntries.filter(entry => 
      entry.timestamp >= start && entry.timestamp <= end
    );
    
    // Group by operation or activity type + page
    const operationStats: Record<string, {
      totalTime: number;
      count: number;
      activityType: TimeActivityType;
    }> = {};
    
    for (const entry of timeEntriesInRange) {
      // For automation entries, use the operation name
      // For user interaction, use page-based naming
      // Skip idle time
      if (entry.activityType === 'idle') continue;
      
      let operationKey: string;
      
      if (entry.operation) {
        // Has specific operation (automation)
        operationKey = entry.operation;
      } else if (entry.page) {
        // User interaction on specific page
        operationKey = `user:${entry.page}`;
      } else {
        // Generic user interaction
        operationKey = `user:general`;
      }
      
      if (!operationStats[operationKey]) {
        operationStats[operationKey] = {
          totalTime: 0,
          count: 0,
          activityType: entry.activityType
        };
      }
      operationStats[operationKey].totalTime += entry.duration;
      operationStats[operationKey].count += 1;
    }
    
    // Convert to array and calculate averages
    return Object.entries(operationStats)
      .map(([operation, stats]) => ({
        operation,
        totalTime: stats.totalTime,
        count: stats.count,
        averageTime: stats.totalTime / stats.count,
        activityType: stats.activityType
      }))
      .filter(item => !item.operation.includes('unknown')) // Filter out unknown pages
      .sort((a, b) => b.totalTime - a.totalTime) // Sort by total time descending
      .slice(0, 5); // Limit to top 5
  }

  /**
   * Create test time data for debugging (temporary method)
   */
  createTestTimeData(): void {
    console.log('🧪 Creating test time data for debugging...');
    
    const testData = [
      { operation: 'characters:auditionVoice', activityType: 'automation' as TimeActivityType, duration: 2500 },
      { operation: 'characters:assignVoices', activityType: 'automation' as TimeActivityType, duration: 1800 },
      { operation: 'plan:build', activityType: 'automation' as TimeActivityType, duration: 5000 },
      { page: 'casting', activityType: 'user-interaction' as TimeActivityType, duration: 15000 },
      { page: 'manuscript', activityType: 'user-interaction' as TimeActivityType, duration: 8000 },
      { page: 'planning', activityType: 'user-interaction' as TimeActivityType, duration: 12000 }
    ];
    
    console.log('🧪 Current time entries before test:', this.timeEntries.length);
    console.log('🧪 Current session:', this.currentSession?.id);
    
    // First, show current automation time before adding test data
    const currentAutomationTime = this.timeEntries
      .filter(e => e.activityType === 'automation')
      .reduce((sum, e) => sum + e.duration, 0);
    console.log('🧪 Current automation time before test:', this.formatDuration(currentAutomationTime));
    
    for (const item of testData) {
      if ('operation' in item) {
        console.log('🧪 Adding automation entry:', item);
        const entry = this.trackTimeActivity(item.activityType, item.duration, { 
          operation: item.operation,
          page: 'test' 
        });
        console.log('🧪 Created automation entry:', entry);
      } else {
        console.log('🧪 Adding user interaction entry:', item);
        this.trackTimeActivity(item.activityType, item.duration, { 
          page: item.page 
        });
      }
    }
    
    console.log('🧪 Test data created. Total time entries:', this.timeEntries.length);
    
    // Debug: Show automation entries after test data
    const automationEntries = this.timeEntries.filter(e => e.activityType === 'automation');
    console.log('🧪 Automation entries after test:', automationEntries.length);
    automationEntries.forEach(entry => {
      console.log('  🤖', {
        operation: entry.operation,
        duration: this.formatDuration(entry.duration),
        activityType: entry.activityType,
        id: entry.id
      });
    });
    
    // Debug: Show breakdown after test data
    const breakdown = this.getTimeBreakdownByOperation();
    console.log('🧪 Time breakdown after test data:', breakdown);
    
    // Debug: Show automation vs user time
    const automationTime = this.timeEntries
      .filter(e => e.activityType === 'automation')
      .reduce((sum, e) => sum + e.duration, 0);
    const userTime = this.timeEntries
      .filter(e => e.activityType === 'user-interaction')
      .reduce((sum, e) => sum + e.duration, 0);
      
    console.log('🧪 Time totals after test:', {
      automationTime: this.formatDuration(automationTime),
      userTime: this.formatDuration(userTime),
      totalEntries: this.timeEntries.length
    });
    
    // IMPORTANT: Check what the summary method returns
    const summary = this.generateSummary();
    console.log('🧪 Summary data after test:', {
      totalAutomationTime: summary.totalAutomationTime,
      totalActiveTime: summary.totalActiveTime,
      totalAutomationTimeFormatted: this.formatDuration(summary.totalAutomationTime)
    });
    
    this.notifyDataChange();
  }

  /**
   * Debug method to show current time tracking state
   */
  debugTimeTrackingState(): void {
    console.log('🔍 === TIME TRACKING DEBUG STATE ===');
    console.log('🔍 Total time entries:', this.timeEntries.length);
    console.log('🔍 Current session:', this.currentSession?.id);
    
    if (this.timeEntries.length > 0) {
      const automationEntries = this.timeEntries.filter(e => e.activityType === 'automation');
      const userEntries = this.timeEntries.filter(e => e.activityType === 'user-interaction');
      
      console.log('🔍 Automation entries:', automationEntries.length);
      automationEntries.forEach(entry => {
        console.log('  🤖', {
          operation: entry.operation,
          duration: this.formatDuration(entry.duration),
          timestamp: entry.timestamp,
          page: entry.page
        });
      });
      
      console.log('🔍 User interaction entries:', userEntries.length);
      userEntries.slice(0, 5).forEach(entry => {
        console.log('  👤', {
          page: entry.page,
          duration: this.formatDuration(entry.duration),
          timestamp: entry.timestamp
        });
      });
      
      if (userEntries.length > 5) {
        console.log(`  ... and ${userEntries.length - 5} more user entries`);
      }
    }
    
    // Show breakdown
    const breakdown = this.getTimeBreakdownByOperation();
    console.log('🔍 Time breakdown by operation:', breakdown);
    
    // Show totals
    const totalAutomation = this.timeEntries
      .filter(e => e.activityType === 'automation')
      .reduce((sum, e) => sum + e.duration, 0);
    const totalUser = this.timeEntries
      .filter(e => e.activityType === 'user-interaction')
      .reduce((sum, e) => sum + e.duration, 0);
    
    console.log('🔍 Time totals:', {
      automation: this.formatDuration(totalAutomation),
      userInteraction: this.formatDuration(totalUser),
      total: this.formatDuration(totalAutomation + totalUser)
    });
    
    console.log('🔍 === END DEBUG STATE ===');
  }

  /**
   * Calculate savings by operation for a time period
   */
  getSavingsByOperation(startDate?: Date, endDate?: Date): Record<string, { savings: number; percentage: number; count: number }> {
    const now = new Date();
    const start = startDate || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const end = endDate || now;
    
    const entries = this.getEntriesByDateRange(start, end);
    const savingsByOperation: Record<string, number> = Object.create(null);
    const operationCounts: Record<string, number> = Object.create(null);
    let totalSavings = 0;
    
    // Calculate savings for entries that were cache hits
    for (const entry of entries) {
      if (entry.wasCached && entry.cacheHit && entry.originalCost) {
        const savings = entry.originalCost - entry.totalCost;
        if (savings > 0) {
          if (!savingsByOperation[entry.operation]) {
            savingsByOperation[entry.operation] = 0;
            operationCounts[entry.operation] = 0;
          }
          savingsByOperation[entry.operation] += savings;
          operationCounts[entry.operation] += 1;
          totalSavings += savings;
        }
      }
    }
    
    // Calculate percentages
    const result: Record<string, { savings: number; percentage: number; count: number }> = Object.create(null);
    for (const [operation, savings] of Object.entries(savingsByOperation)) {
      result[operation] = {
        savings,
        percentage: totalSavings > 0 ? (savings / totalSavings) * 100 : 0,
        count: operationCounts[operation]
      };
    }
    
    return result;
  }

  /**
   * Get all time entries
   */
  getAllTimeEntries(): TimeEntry[] {
    return [...this.timeEntries];
  }
  
  /**
   * Get all time sessions
   */
  getAllTimeSessions(): TimeSession[] {
    return [...this.timeSessions];
  }
  
  /**
   * Get current active session
   */
  getCurrentSession(): TimeSession | null {
    return this.currentSession;
  }
  
  /**
   * Get time entries by date range
   */
  getTimeEntriesByDateRange(startDate: Date, endDate: Date): TimeEntry[] {
    return this.timeEntries.filter(entry => 
      entry.timestamp >= startDate && entry.timestamp <= endDate
    );
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