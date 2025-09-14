// Cost Tracking Page
// Dashboard for monitoring AI service costs and cache savings

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { CostSummary, CostSettings } from '../types/cost-tracking';
import { costTrackingService } from '../lib/cost-tracking-service';
import { CostCalculator } from '../types/cost-tracking';

/**
 * Cost tracking and analysis dashboard
 */
export default function Cost() {
  const { t } = useTranslation();
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

  // Subscribe to cost data changes for real-time updates
  useEffect(() => {
    const unsubscribe = costTrackingService.onDataChange(() => {
      console.log('🔄 Cost data changed, refreshing dashboard...');
      loadData();
    });

    return unsubscribe; // Cleanup subscription on unmount
  }, [loadData]);

  const handleSettingsUpdate = (newSettings: Partial<CostSettings>) => {
    if (settings) {
      const updated = { ...settings, ...newSettings };
      setSettings(updated);
      costTrackingService.updateSettings(updated);
      // No need to call loadData() - the subscription will handle it automatically
    }
  };

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '200px',
        color: 'var(--text)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid var(--border)',
            borderTop: '3px solid var(--accent)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <p style={{ color: 'var(--muted)' }}>{t('cost.loading')}</p>
        </div>
      </div>
    );
  }

  if (!summary || !settings) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '32px',
        color: 'var(--muted)'
      }}>
        <p>{t('cost.noData')}</p>
      </div>
    );
  }

  return (
    <>
      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      
      <div style={{
        padding: '0',
        height: '100%',
        overflow: 'auto',
        background: 'var(--bg)',
        color: 'var(--text)'
      }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'start',
        background: 'var(--panel)',
        padding: '20px',
        borderBottom: '1px solid var(--border)',
        borderRadius: '8px',
        marginBottom: '16px'
      }}>
        <div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: '700',
            color: 'var(--text)',
            margin: '0 0 8px 0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            💰 {t('cost.title')}
          </h1>
          <p style={{
            color: 'var(--muted)',
            margin: '0',
            fontSize: '14px'
          }}>
            {t('cost.description')}
          </p>
        </div>
        
        <div style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center'
        }}>
          {/* Time Range Selector */}
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value as '7d' | '30d' | '90d' | 'all')}
            style={{
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              background: 'var(--panel)',
              color: 'var(--text)',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            <option value="7d">{t('cost.timeRange.7d', 'Last 7 days')}</option>
            <option value="30d">{t('cost.timeRange.30d', 'Last 30 days')}</option>
            <option value="90d">{t('cost.timeRange.90d', 'Last 90 days')}</option>
            <option value="all">{t('cost.timeRange.all', 'All time')}</option>
          </select>
          
          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              padding: '8px 16px',
              background: showSettings ? 'var(--accent)' : 'var(--panel)',
              color: showSettings ? 'white' : 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease'
            }}
          >
            ⚙️ {t('cost.settings', 'Settings')}
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px',
          marginBottom: '16px'
        }}>
          <h3 style={{
            fontSize: '18px',
            fontWeight: '600',
            marginBottom: '16px',
            color: 'var(--text)'
          }}>{t('cost.settings', 'Cost Settings')}</h3>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px'
          }}>
            {/* OpenAI GPT-4 */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                marginBottom: '6px',
                color: 'var(--text)'
              }}>
                {t('cost.pricing.openaiGpt4Input', 'OpenAI GPT-4 Input (per 1K tokens)')}
              </label>
              <input
                type="number"
                step="0.001"
                value={settings.openaiGpt4InputTokens}
                onChange={(e) => handleSettingsUpdate({ openaiGpt4InputTokens: parseFloat(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '14px'
                }}
              />
            </div>
            
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                marginBottom: '6px',
                color: 'var(--text)'
              }}>
                {t('cost.pricing.openaiGpt4Output', 'OpenAI GPT-4 Output (per 1K tokens)')}
              </label>
              <input
                type="number"
                step="0.001"
                value={settings.openaiGpt4OutputTokens}
                onChange={(e) => handleSettingsUpdate({ openaiGpt4OutputTokens: parseFloat(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '14px'
                }}
              />
            </div>
            
            {/* ElevenLabs TTS */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                marginBottom: '6px',
                color: 'var(--text)'
              }}>
                {t('cost.pricing.elevenlabsTts', 'ElevenLabs TTS (per 1K chars)')}
              </label>
              <input
                type="number"
                step="0.001"
                value={settings.elevenlabsTtsPerCharacter}
                onChange={(e) => handleSettingsUpdate({ elevenlabsTtsPerCharacter: parseFloat(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '14px'
                }}
              />
            </div>
            
            {/* Azure TTS */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                marginBottom: '6px',
                color: 'var(--text)'
              }}>
                {t('cost.pricing.azureTts', 'Azure TTS (per 1K chars)')}
              </label>
              <input
                type="number"
                step="0.001"
                value={settings.azureTtsPerCharacter}
                onChange={(e) => handleSettingsUpdate({ azureTtsPerCharacter: parseFloat(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '14px'
                }}
              />
            </div>
            
            {/* Enable/Disable Tracking */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                gap: '8px'
              }}>
                <input
                  type="checkbox"
                  checked={settings.enableCostTracking}
                  onChange={(e) => handleSettingsUpdate({ enableCostTracking: e.target.checked })}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>
                  {t('cost.enableTracking', 'Enable Cost Tracking')}
                </span>
              </label>
            
              <label style={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                gap: '8px'
              }}>
                <input
                  type="checkbox"
                  checked={settings.trackCacheSavings}
                  onChange={(e) => handleSettingsUpdate({ trackCacheSavings: e.target.checked })}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text)' }}>
                  {t('cost.trackCacheSavings', 'Track Cache Savings')}
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* Total Cost */}
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <p style={{
                fontSize: '14px',
                color: 'var(--muted)',
                margin: '0 0 8px 0'
              }}>
                {t('cost.totalCost', 'Total Cost')}
              </p>
              <p style={{
                fontSize: '28px',
                fontWeight: '700',
                color: 'var(--text)',
                margin: '0'
              }}>
                {CostCalculator.formatCost(summary.totalCost, settings.currency)}
              </p>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              background: 'rgba(239, 68, 68, 0.1)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px'
            }}>
              💸
            </div>
          </div>
        </div>

        {/* Cache Savings */}
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <p style={{
                fontSize: '14px',
                color: 'var(--muted)',
                margin: '0 0 8px 0'
              }}>
                {t('cost.cacheSavings', 'Cache Savings')}
              </p>
              <p style={{
                fontSize: '28px',
                fontWeight: '700',
                color: '#10b981',
                margin: '0'
              }}>
                {CostCalculator.formatCost(summary.estimatedSavingsFromCache, settings.currency)}
              </p>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              background: 'rgba(16, 185, 129, 0.1)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px'
            }}>
              💰
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <p style={{
              fontSize: '12px',
              color: 'var(--muted)',
              margin: '0'
            }}>
              {t('cost.cacheHitRate', 'Cache Hit Rate')}: {summary.cacheHitRate.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Net Cost */}
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <p style={{
                fontSize: '14px',
                color: 'var(--muted)',
                margin: '0 0 8px 0'
              }}>
                {t('cost.netCost', 'Net Cost')}
              </p>
              <p style={{
                fontSize: '28px',
                fontWeight: '700',
                color: '#3b82f6',
                margin: '0'
              }}>
                {CostCalculator.formatCost(summary.netCost, settings.currency)}
              </p>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              background: 'rgba(59, 130, 246, 0.1)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px'
            }}>
              📊
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <p style={{
              fontSize: '12px',
              color: 'var(--muted)',
              margin: '0'
            }}>
              {t('cost.afterCacheSavings', 'After cache savings')}
            </p>
          </div>
        </div>

        {/* Total Usage */}
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <p style={{
                fontSize: '14px',
                color: 'var(--muted)',
                margin: '0 0 8px 0'
              }}>
                {t('cost.totalUsage', 'Total Usage')}
              </p>
              <p style={{
                fontSize: '20px',
                fontWeight: '600',
                color: 'var(--text)',
                margin: '0'
              }}>
                {Math.round(summary.totalLlmTokens / 1000)}K tokens
              </p>
              <p style={{
                fontSize: '14px',
                color: 'var(--muted)',
                margin: '4px 0 0 0'
              }}>
                {Math.round(summary.totalTtsCharacters / 1000)}K characters
              </p>
            </div>
            <div style={{
              width: '48px',
              height: '48px',
              background: 'rgba(147, 51, 234, 0.1)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px'
            }}>
              📈
            </div>
          </div>
        </div>
      </div>

      {/* Service Breakdown */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* Cost by Service Type */}
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <h3 style={{
            fontSize: '18px',
            fontWeight: '600',
            marginBottom: '16px',
            color: 'var(--text)',
            margin: '0 0 16px 0'
          }}>
            {t('cost.costByService', 'Cost by Service')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '14px', color: 'var(--muted)' }}>
                🤖 {t('cost.llmServices', 'LLM Services')}
              </span>
              <span style={{ fontWeight: '600', color: 'var(--text)' }}>
                {CostCalculator.formatCost(summary.llmCosts, settings.currency)}
              </span>
            </div>
            <div style={{
              width: '100%',
              height: '8px',
              background: 'var(--border)',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                background: '#3b82f6',
                borderRadius: '4px',
                width: `${summary.totalCost > 0 ? (summary.llmCosts / summary.totalCost) * 100 : 0}%`
              }}></div>
            </div>
            
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontSize: '14px', color: 'var(--muted)' }}>
                🔊 {t('cost.ttsServices', 'TTS Services')}
              </span>
              <span style={{ fontWeight: '600', color: 'var(--text)' }}>
                {CostCalculator.formatCost(summary.ttsCosts, settings.currency)}
              </span>
            </div>
            <div style={{
              width: '100%',
              height: '8px',
              background: 'var(--border)',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                background: '#10b981',
                borderRadius: '4px',
                width: `${summary.totalCost > 0 ? (summary.ttsCosts / summary.totalCost) * 100 : 0}%`
              }}></div>
            </div>
          </div>
        </div>

        {/* Top Operations */}
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '20px'
        }}>
          <h3 style={{
            fontSize: '18px',
            fontWeight: '600',
            marginBottom: '16px',
            color: 'var(--text)',
            margin: '0 0 16px 0'
          }}>
            {t('cost.topOperations', 'Top Operations by Cost')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {summary.topOperationsByCost.slice(0, 5).map((operation) => (
              <div key={operation.operation} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid var(--border)'
              }}>
                <div style={{ flex: 1 }}>
                  <p style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    margin: '0',
                    color: 'var(--text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {operation.operation}
                  </p>
                  <p style={{
                    fontSize: '12px',
                    color: 'var(--muted)',
                    margin: '2px 0 0 0'
                  }}>
                    {operation.count} calls
                  </p>
                </div>
                <span style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'var(--text)',
                  marginLeft: '8px'
                }}>
                  {CostCalculator.formatCost(operation.cost, settings.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cache Performance */}
      <div style={{
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '24px'
      }}>
        <h3 style={{
          fontSize: '18px',
          fontWeight: '600',
          marginBottom: '16px',
          color: 'var(--text)',
          margin: '0 0 16px 0'
        }}>
          {t('cost.cachePerformance', 'Cache Performance')}
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '16px'
        }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{
              fontSize: '32px',
              fontWeight: '700',
              color: '#10b981',
              margin: '0'
            }}>
              {summary.totalCacheHits}
            </p>
            <p style={{
              fontSize: '14px',
              color: 'var(--muted)',
              margin: '4px 0 0 0'
            }}>
              {t('cost.cacheHits', 'Cache Hits')}
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{
              fontSize: '32px',
              fontWeight: '700',
              color: '#ef4444',
              margin: '0'
            }}>
              {summary.totalCacheMisses}
            </p>
            <p style={{
              fontSize: '14px',
              color: 'var(--muted)',
              margin: '4px 0 0 0'
            }}>
              {t('cost.cacheMisses', 'Cache Misses')}
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{
              fontSize: '32px',
              fontWeight: '700',
              color: '#3b82f6',
              margin: '0'
            }}>
              {summary.cacheHitRate.toFixed(1)}%
            </p>
            <p style={{
              fontSize: '14px',
              color: 'var(--muted)',
              margin: '4px 0 0 0'
            }}>
              {t('cost.hitRate', 'Hit Rate')}
            </p>
          </div>
        </div>
        
        {summary.estimatedSavingsFromCache > 0 && (
          <div style={{
            marginTop: '16px',
            padding: '16px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: '8px'
          }}>
            <p style={{
              fontSize: '14px',
              color: '#10b981',
              margin: '0',
              lineHeight: '1.5'
            }}>
              💡 <strong>{t('cost.smartCachingImpact', 'Smart Caching Impact')}:</strong> {t('cost.savingsMessage', `You've saved {{savings}} thanks to intelligent caching! Without caching, your total cost would have been {{totalWithSavings}}.`, {
                savings: CostCalculator.formatCost(summary.estimatedSavingsFromCache, settings.currency),
                totalWithSavings: CostCalculator.formatCost(summary.totalCost + summary.estimatedSavingsFromCache, settings.currency)
              })}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
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
          style={{
            padding: '10px 16px',
            background: 'var(--panel)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'var(--border)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'var(--panel)';
          }}
        >
          📄 {t('cost.exportData', 'Export Data')}
        </button>
        
        <button
          onClick={() => {
            if (confirm(t('cost.clearDataConfirm', 'Are you sure you want to clear all cost data? This action cannot be undone.'))) {
              costTrackingService.clearAllEntries();
              // No need to call loadData() - the subscription will handle it automatically
            }
          }}
          style={{
            padding: '10px 16px',
            background: '#ef4444',
            color: 'white',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = '#dc2626';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = '#ef4444';
          }}
        >
          🗑️ {t('cost.clearData', 'Clear Data')}
        </button>
      </div>
      
      </div>
    </>
  );
}