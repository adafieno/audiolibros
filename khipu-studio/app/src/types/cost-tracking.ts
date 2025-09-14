// Cost Tracking Types
// Types for tracking AI service costs and cache savings

/**
 * Type of AI service used
 */
export type ServiceType = 'llm' | 'tts';

/**
 * Application pages/modules that can incur costs
 */
export type CostPage = 
  | 'manuscript'
  | 'casting' 
  | 'characters'
  | 'orchestration'
  | 'audio_production'
  | 'planning'
  | 'unknown';

/**
 * Specific AI provider/model
 */
export type ServiceProvider = 
  | 'openai-gpt4o' 
  | 'openai-gpt4o-mini'
  | 'openai-gpt4' 
  | 'openai-gpt3.5' 
  | 'anthropic-claude'
  | 'azure-tts'
  | 'openai-tts'
  | 'custom';

/**
 * Individual cost entry for a service call
 */
export interface CostEntry {
  id: string;
  timestamp: Date;
  serviceType: ServiceType;
  provider: ServiceProvider;
  operation: string; // e.g., 'character_generation', 'audio_synthesis', 'text_processing'
  
  // Usage metrics
  inputTokens?: number;
  outputTokens?: number;
  charactersProcessed?: number;
  audioSeconds?: number;
  
  // Cost calculation
  unitCost: number; // Cost per unit (per token, per character, per second)
  totalCost: number; // Calculated total cost
  
  // Cache information
  wasCached: boolean;
  cacheHit?: boolean; // If this was a cache hit (no cost incurred)
  originalCost?: number; // What it would have cost without cache
  
  // Context information
  page?: string; // Which page/module initiated this cost (e.g., 'manuscript', 'casting', 'characters', 'orchestration', 'audio_production')
  projectId?: string;
  chapterId?: string;
  segmentId?: string;
  notes?: string;
}

/**
 * Configurable pricing settings for different services
 */
export interface CostSettings {
  // OpenAI Pricing (per 1K tokens)
  openaiGpt4oInputTokens: number;
  openaiGpt4oOutputTokens: number;
  openaiGpt4oMiniInputTokens: number;
  openaiGpt4oMiniOutputTokens: number;
  openaiGpt4InputTokens: number;
  openaiGpt4OutputTokens: number;
  openaiGpt35InputTokens: number;
  openaiGpt35OutputTokens: number;
  
  // Anthropic Pricing (per 1K tokens)
  anthropicClaudeInputTokens: number;
  anthropicClaudeOutputTokens: number;
  
  // TTS Pricing (per 1K characters)
  azureTtsPerCharacter: number;
  openaiTtsPerCharacter: number;
  
  // Custom pricing
  customLlmInputTokens: number;
  customLlmOutputTokens: number;
  customTtsPerCharacter: number;
  
  // Currency
  currency: 'USD' | 'EUR' | 'GBP';
  
  // Cache settings
  enableCostTracking: boolean;
  trackCacheSavings: boolean;
}

/**
 * Cost summary and analytics
 */
export interface CostSummary {
  // Time period
  startDate: Date;
  endDate: Date;
  
  // Total costs
  totalCost: number;
  totalSavings: number; // From caching
  netCost: number; // totalCost - totalSavings
  
  // Breakdown by service type
  llmCosts: number;
  ttsCosts: number;
  
  // Breakdown by provider
  costsByProvider: Record<ServiceProvider, number>;
  
  // Breakdown by page/module
  costsByPage: Record<string, number>;
  
  // Usage metrics
  totalLlmTokens: number;
  totalTtsCharacters: number;
  totalAudioSeconds: number;
  
  // Cache statistics
  totalCacheHits: number;
  totalCacheMisses: number;
  cacheHitRate: number; // Percentage
  estimatedSavingsFromCache: number;
  
  // Top operations by cost
  topOperationsByCost: Array<{
    operation: string;
    cost: number;
    count: number;
  }>;
  
  // Breakdown by module
  costsByModule: Array<{
    module: string;
    cost: number;
    count: number;
    operations: string[];
  }>;
  
  // Timeline data (extended)
  dailyCosts: Array<{
    date: Date;
    cost: number;
    savings: number;
    llmCost: number;
    ttsCost: number;
    operations: number;
  }>;
}

/**
 * Default cost settings based on current market rates (Sep 2024)
 */
export const DEFAULT_COST_SETTINGS: CostSettings = {
  // OpenAI GPT-4o (most common model)
  openaiGpt4oInputTokens: 0.0025, // $0.0025 per 1K input tokens
  openaiGpt4oOutputTokens: 0.01, // $0.01 per 1K output tokens
  
  // OpenAI GPT-4o-mini (cheaper alternative)
  openaiGpt4oMiniInputTokens: 0.00015, // $0.00015 per 1K input tokens  
  openaiGpt4oMiniOutputTokens: 0.0006, // $0.0006 per 1K output tokens
  
  // OpenAI GPT-4 (legacy)
  openaiGpt4InputTokens: 0.03, // $0.03 per 1K input tokens
  openaiGpt4OutputTokens: 0.06, // $0.06 per 1K output tokens
  
  // OpenAI GPT-3.5 Turbo (legacy)
  openaiGpt35InputTokens: 0.0005, // $0.0005 per 1K input tokens  
  openaiGpt35OutputTokens: 0.0015, // $0.0015 per 1K output tokens
  
  // Anthropic Claude
  anthropicClaudeInputTokens: 0.008, // $0.008 per 1K input tokens
  anthropicClaudeOutputTokens: 0.024, // $0.024 per 1K output tokens
  
  // TTS Services (per 1K characters)
  azureTtsPerCharacter: 0.016, // $0.016 per 1K characters
  openaiTtsPerCharacter: 0.015, // $0.015 per 1K characters
  
  // Custom defaults
  customLlmInputTokens: 0.005,
  customLlmOutputTokens: 0.015,
  customTtsPerCharacter: 0.020,
  
  currency: 'USD',
  enableCostTracking: true,
  trackCacheSavings: true
};

/**
 * Utility functions for cost calculations
 */
export class CostCalculator {
  /**
   * Calculate cost for LLM usage
   */
  static calculateLlmCost(
    provider: ServiceProvider,
    inputTokens: number,
    outputTokens: number,
    settings: CostSettings
  ): number {
    let inputCost = 0;
    let outputCost = 0;
    
    switch (provider) {
      case 'openai-gpt4o':
        inputCost = (inputTokens / 1000) * settings.openaiGpt4oInputTokens;
        outputCost = (outputTokens / 1000) * settings.openaiGpt4oOutputTokens;
        break;
      case 'openai-gpt4o-mini':
        inputCost = (inputTokens / 1000) * settings.openaiGpt4oMiniInputTokens;
        outputCost = (outputTokens / 1000) * settings.openaiGpt4oMiniOutputTokens;
        break;
      case 'openai-gpt4':
        inputCost = (inputTokens / 1000) * settings.openaiGpt4InputTokens;
        outputCost = (outputTokens / 1000) * settings.openaiGpt4OutputTokens;
        break;
      case 'openai-gpt3.5':
        inputCost = (inputTokens / 1000) * settings.openaiGpt35InputTokens;
        outputCost = (outputTokens / 1000) * settings.openaiGpt35OutputTokens;
        break;
      case 'anthropic-claude':
        inputCost = (inputTokens / 1000) * settings.anthropicClaudeInputTokens;
        outputCost = (outputTokens / 1000) * settings.anthropicClaudeOutputTokens;
        break;
      case 'custom':
        inputCost = (inputTokens / 1000) * settings.customLlmInputTokens;
        outputCost = (outputTokens / 1000) * settings.customLlmOutputTokens;
        break;
      default:
        return 0;
    }
    
    return inputCost + outputCost;
  }
  
  /**
   * Calculate cost for TTS usage
   */
  static calculateTtsCost(
    provider: ServiceProvider,
    characters: number,
    settings: CostSettings
  ): number {
    let costPerThousand = 0;
    
    switch (provider) {
      case 'azure-tts':
        costPerThousand = settings.azureTtsPerCharacter;
        break;
      case 'openai-tts':
        costPerThousand = settings.openaiTtsPerCharacter;
        break;
      case 'custom':
        costPerThousand = settings.customTtsPerCharacter;
        break;
      default:
        return 0;
    }
    
    return (characters / 1000) * costPerThousand;
  }
  
  /**
   * Format cost for display with locale support
   */
  static formatCost(cost: number, currency: string = 'USD', locale?: string): string {
    // Use provided locale, or detect from browser, or fallback to en-US
    const userLocale = locale || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
    
    const formatter = new Intl.NumberFormat(userLocale, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    });
    
    return formatter.format(cost);
  }
}