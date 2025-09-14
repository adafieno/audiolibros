// Cost Tracking Types
// Types for tracking AI service costs and cache savings

/**
 * Type of AI service used
 */
export type ServiceType = 'llm' | 'tts';

/**
 * Specific AI provider/model
 */
export type ServiceProvider = 
  | 'openai-gpt4' 
  | 'openai-gpt3.5' 
  | 'anthropic-claude'
  | 'elevenlabs-tts'
  | 'azure-tts'
  | 'google-tts'
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
  
  // Metadata
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
  openaiGpt4InputTokens: number;
  openaiGpt4OutputTokens: number;
  openaiGpt35InputTokens: number;
  openaiGpt35OutputTokens: number;
  
  // Anthropic Pricing (per 1K tokens)
  anthropicClaudeInputTokens: number;
  anthropicClaudeOutputTokens: number;
  
  // TTS Pricing (per 1K characters or per second)
  elevenlabsTtsPerCharacter: number;
  azureTtsPerCharacter: number;
  googleTtsPerCharacter: number;
  
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
  
  // Daily breakdown
  dailyCosts: Array<{
    date: Date;
    cost: number;
    savings: number;
  }>;
}

/**
 * Default cost settings based on current market rates
 */
export const DEFAULT_COST_SETTINGS: CostSettings = {
  // OpenAI GPT-4 (as of 2024)
  openaiGpt4InputTokens: 0.01, // $0.01 per 1K input tokens
  openaiGpt4OutputTokens: 0.03, // $0.03 per 1K output tokens
  
  // OpenAI GPT-3.5 Turbo
  openaiGpt35InputTokens: 0.001, // $0.001 per 1K input tokens  
  openaiGpt35OutputTokens: 0.002, // $0.002 per 1K output tokens
  
  // Anthropic Claude
  anthropicClaudeInputTokens: 0.008, // $0.008 per 1K input tokens
  anthropicClaudeOutputTokens: 0.024, // $0.024 per 1K output tokens
  
  // TTS Services (per 1K characters)
  elevenlabsTtsPerCharacter: 0.30, // $0.30 per 1K characters
  azureTtsPerCharacter: 0.016, // $0.016 per 1K characters
  googleTtsPerCharacter: 0.016, // $0.016 per 1K characters
  
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
      case 'elevenlabs-tts':
        costPerThousand = settings.elevenlabsTtsPerCharacter;
        break;
      case 'azure-tts':
        costPerThousand = settings.azureTtsPerCharacter;
        break;
      case 'google-tts':
        costPerThousand = settings.googleTtsPerCharacter;
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
   * Format cost for display
   */
  static formatCost(cost: number, currency: string = 'USD'): string {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    });
    
    return formatter.format(cost);
  }
}