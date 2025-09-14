// Cost Tracking Page
// Dashboard for monitoring AI service costs and cache savings

import React, { useState, useEffect, useCallback } from 'react';
import type { CostSummary, CostSettings } from '../types/cost-tracking';
import { costTrackingService } from '../lib/cost-tracking-service';
import { CostCalculator } from '../types/cost-tracking';

/**
 * Cost tracking and analysis dashboard
 */
export default function Cost() {
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [settings, setSettings] = useState<CostSettings | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(() => {
    setIsLoading(true);
    
    try {
      // Get date range
      const now = new Date();
      let startDate: Date | undefined;
      
      switch (selectedTimeRange) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
          startDate = undefined;
          break;
      }
      
      const summaryData = costTrackingService.generateSummary(startDate);
      const settingsData = costTrackingService.getSettings();
      
      setSummary(summaryData);
      setSettings(settingsData);
    } catch (error) {
      console.error('Error loading cost data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTimeRange]);

  // Load data on component mount and when time range changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSettingsUpdate = (newSettings: Partial<CostSettings>) => {
    if (settings) {
      const updated = { ...settings, ...newSettings };
      setSettings(updated);
      costTrackingService.updateSettings(updated);
      loadData(); // Refresh data with new settings
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading cost data...</p>
        </div>
      </div>
    );
  }

  if (!summary || !settings) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">No cost data available</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              💰 Cost Tracking
            </h1>
            <p className="text-gray-600">
              Monitor AI service costs and analyze cache savings
            </p>
          </div>
          
          <div className="flex gap-3">
            {/* Time Range Selector */}
            <select
              value={selectedTimeRange}
              onChange={(e) => setSelectedTimeRange(e.target.value as '7d' | '30d' | '90d' | 'all')}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
            
            {/* Settings Button */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              ⚙️ Settings
            </button>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mb-8 bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Cost Settings</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* OpenAI GPT-4 */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">OpenAI GPT-4 Input (per 1K tokens)</label>
              <input
                type="number"
                step="0.001"
                value={settings.openaiGpt4InputTokens}
                onChange={(e) => handleSettingsUpdate({ openaiGpt4InputTokens: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium">OpenAI GPT-4 Output (per 1K tokens)</label>
              <input
                type="number"
                step="0.001"
                value={settings.openaiGpt4OutputTokens}
                onChange={(e) => handleSettingsUpdate({ openaiGpt4OutputTokens: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            
            {/* ElevenLabs TTS */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">ElevenLabs TTS (per 1K chars)</label>
              <input
                type="number"
                step="0.001"
                value={settings.elevenlabsTtsPerCharacter}
                onChange={(e) => handleSettingsUpdate({ elevenlabsTtsPerCharacter: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            
            {/* Azure TTS */}
            <div className="space-y-2">
              <label className="block text-sm font-medium">Azure TTS (per 1K chars)</label>
              <input
                type="number"
                step="0.001"
                value={settings.azureTtsPerCharacter}
                onChange={(e) => handleSettingsUpdate({ azureTtsPerCharacter: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            
            {/* Enable/Disable Tracking */}
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.enableCostTracking}
                  onChange={(e) => handleSettingsUpdate({ enableCostTracking: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm font-medium">Enable Cost Tracking</span>
              </label>
            </div>
            
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={settings.trackCacheSavings}
                  onChange={(e) => handleSettingsUpdate({ trackCacheSavings: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm font-medium">Track Cache Savings</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Cost */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Cost</p>
              <p className="text-2xl font-bold text-gray-900">
                {CostCalculator.formatCost(summary.totalCost, settings.currency)}
              </p>
            </div>
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              💸
            </div>
          </div>
        </div>

        {/* Cache Savings */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Cache Savings</p>
              <p className="text-2xl font-bold text-green-600">
                {CostCalculator.formatCost(summary.estimatedSavingsFromCache, settings.currency)}
              </p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              💰
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xs text-gray-500">
              Cache Hit Rate: {summary.cacheHitRate.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Net Cost */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Net Cost</p>
              <p className="text-2xl font-bold text-blue-600">
                {CostCalculator.formatCost(summary.netCost, settings.currency)}
              </p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              📊
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xs text-gray-500">
              After cache savings
            </p>
          </div>
        </div>

        {/* Total Usage */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Usage</p>
              <p className="text-lg font-semibold text-gray-900">
                {Math.round(summary.totalLlmTokens / 1000)}K tokens
              </p>
              <p className="text-sm text-gray-500">
                {Math.round(summary.totalTtsCharacters / 1000)}K characters
              </p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              📈
            </div>
          </div>
        </div>
      </div>

      {/* Service Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Cost by Service Type */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Cost by Service</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">🤖 LLM Services</span>
              <span className="font-medium">{CostCalculator.formatCost(summary.llmCosts, settings.currency)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full" 
                style={{ width: `${summary.totalCost > 0 ? (summary.llmCosts / summary.totalCost) * 100 : 0}%` }}
              ></div>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">🔊 TTS Services</span>
              <span className="font-medium">{CostCalculator.formatCost(summary.ttsCosts, settings.currency)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full" 
                style={{ width: `${summary.totalCost > 0 ? (summary.ttsCosts / summary.totalCost) * 100 : 0}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Top Operations */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Top Operations by Cost</h3>
          <div className="space-y-2">
            {summary.topOperationsByCost.slice(0, 5).map((operation) => (
              <div key={operation.operation} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
                <div className="flex-1">
                  <p className="text-sm font-medium truncate">{operation.operation}</p>
                  <p className="text-xs text-gray-500">{operation.count} calls</p>
                </div>
                <span className="text-sm font-medium ml-2">
                  {CostCalculator.formatCost(operation.cost, settings.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cache Performance */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
        <h3 className="text-lg font-semibold mb-4">Cache Performance</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{summary.totalCacheHits}</p>
            <p className="text-sm text-gray-600">Cache Hits</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">{summary.totalCacheMisses}</p>
            <p className="text-sm text-gray-600">Cache Misses</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{summary.cacheHitRate.toFixed(1)}%</p>
            <p className="text-sm text-gray-600">Hit Rate</p>
          </div>
        </div>
        
        {summary.estimatedSavingsFromCache > 0 && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">
              💡 <strong>Smart Caching Impact:</strong> You've saved{' '}
              <strong>{CostCalculator.formatCost(summary.estimatedSavingsFromCache, settings.currency)}</strong>{' '}
              thanks to intelligent caching! Without caching, your total cost would have been{' '}
              <strong>{CostCalculator.formatCost(summary.totalCost + summary.estimatedSavingsFromCache, settings.currency)}</strong>.
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={() => {
            const data = costTrackingService.exportData();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `khipu-cost-data-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm"
        >
          📄 Export Data
        </button>
        
        <button
          onClick={() => {
            if (confirm('Are you sure you want to clear all cost data? This action cannot be undone.')) {
              costTrackingService.clearAllEntries();
              loadData();
            }
          }}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
        >
          🗑️ Clear Data
        </button>
      </div>
    </div>
  );
}