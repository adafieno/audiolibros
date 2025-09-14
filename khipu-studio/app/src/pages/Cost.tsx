// Cost Tracking Page
// Dashboard for monitoring AI service costs and cache savings

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../store/project';
import type { CostSummary, CostSettings } from '../types/cost-tracking';
import { costTrackingService } from '../lib/cost-tracking-service';
import { CostCalculator } from '../types/cost-tracking';

/**
 * Cost tracking and analysis dashboard
 */
export default function Cost() {
  const { t, i18n } = useTranslation();
  const { root } = useProject();
  
  // Debug project root
  console.log('🔍 Cost component - project root from useProject():', root);
  
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [settings, setSettings] = useState<CostSettings | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [showSettings, setShowSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Get current locale for currency formatting
  const currentLocale = i18n.language;

  // Helper function for locale-aware currency formatting
  const formatCost = (cost: number) => {
    return settings ? CostCalculator.formatCost(cost, settings.currency, currentLocale) : '$0.0000';
  };

  // Friendly names for operations
  const getOperationDisplayName = (operation: string): string => {
    const operationNames: Record<string, string> = {
      // LLM Operations
      'manuscript:parse': t('cost.operations.manuscriptParse', 'Document Parsing'),
      'api.characters.detect': t('cost.operations.characterDetect', 'Character Detection'), 
      'plan:build': t('cost.operations.planBuild', 'Chapter Planning'),
      'characters.assignToSegments': t('cost.operations.characterAssignment', 'Character Assignment'),
      'characters:assignVoices': t('cost.operations.voiceAssignment', 'Voice Assignment'),
      'chapter_planning': t('cost.operations.chapterPlanning', 'Chapter Planning'),
      'character_assignment': t('cost.operations.characterAssignment', 'Character Assignment'),
      
      // TTS Operations
      'characters:auditionVoice': t('cost.operations.voiceAudition', 'Voice Audition'),
      'voice_audition': t('cost.operations.voiceAudition', 'Voice Audition'),
      'audio_preview': t('cost.operations.audioPreview', 'Audio Preview'),
      'audio_synthesis': t('cost.operations.audioSynthesis', 'Audio Generation'),
      'segment_generation': t('cost.operations.segmentGeneration', 'Segment Audio'),
      'voice_testing': t('cost.operations.voiceTesting', 'Voice Testing'),
      
      // Audio Processing
      'audio_processing': t('cost.operations.audioProcessing', 'Audio Processing'),
      'sox_processing': t('cost.operations.soxProcessing', 'Audio Effects'),
      'effect_chain': t('cost.operations.effectChain', 'Effect Processing'),
      
      // Text Processing  
      'text_parsing': t('cost.operations.textParsing', 'Text Analysis'),
      'segment_parsing': t('cost.operations.segmentParsing', 'Segment Processing'),
      'ssml_generation': t('cost.operations.ssmlGeneration', 'SSML Generation'),
      
      // Cache Operations
      'cache_operation': t('cost.operations.cacheOperation', 'Cache Access'),
      'cache_management': t('cost.operations.cacheManagement', 'Cache Management')
    };
    
    return operationNames[operation] || operation.replace(/[_:]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

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

  // Set project root when it changes
  useEffect(() => {
    if (root) {
      console.log('🔧 Setting cost tracking project root:', root);
      costTrackingService.setProjectRoot(root);
    }
  }, [root]);

  // Load data on component mount and when time range changes
  useEffect(() => {
    const loadDataWithRefresh = async () => {
      if (root) {
        // Force reload from file system to catch any external changes
        console.log('🔄 Reloading cost data from file system...');
        await costTrackingService.reloadFromFileSystem();
      }
      loadData();
    };
    
    loadDataWithRefresh();
  }, [loadData, root]);

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

  if (!root) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '200px',
        color: 'var(--text)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text)', fontSize: '18px', marginBottom: '8px' }}>No project loaded</p>
          <p style={{ color: 'var(--muted)', fontSize: '14px' }}>Please open a project first to view cost tracking.</p>
          <button
            onClick={() => {
              console.log('🔧 Manual project root test');
              const testRoot = 'C:\\projects\\audiobooks\\projects\\test_7';
              console.log(`Setting test project root: ${testRoot}`);
              costTrackingService.setProjectRoot(testRoot);
              loadData();
            }}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            🧪 Test with sample project
          </button>
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
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        borderRadius: '8px',
        marginBottom: '12px'
      }}>
        <div>
          <h1 style={{
            fontSize: '20px',
            fontWeight: '700',
            color: 'var(--text)',
            margin: '0 0 4px 0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            {t('cost.title')}
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
          gap: '8px',
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
          
          {/* Refresh Button */}
          <button
            onClick={async () => {
              console.log('🔄 Manual refresh triggered');
              if (root) {
                setIsLoading(true);
                await costTrackingService.reloadFromFileSystem();
                loadData();
              }
            }}
            style={{
              padding: '8px 16px',
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
            title={t('cost.refresh', 'Refresh data from files')}
          >
            🔄 {t('cost.refresh', 'Refresh')}
          </button>
          
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

          {/* Export Button */}
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
              padding: '8px 16px',
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
            title={t('cost.exportData', 'Export cost data as JSON')}
          >
            📄 {t('cost.exportData', 'Export')}
          </button>
          
          {/* Clear Button */}
          <button
            onClick={() => {
              if (confirm(t('cost.clearDataConfirm', 'Are you sure you want to clear all cost data? This action cannot be undone.'))) {
                costTrackingService.clearAllEntries();
              }
            }}
            style={{
              padding: '8px 16px',
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
            title={t('cost.clearData', 'Clear all cost data')}
          >
            🗑️ {t('cost.clearData', 'Clear')}
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '12px 16px',
          marginBottom: '12px'
        }}>
          <h3 style={{
            fontSize: '16px',
            fontWeight: '600',
            marginBottom: '12px',
            color: 'var(--text)'
          }}>{t('cost.settings', 'Cost Settings')}</h3>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '12px'
          }}>
            {/* OpenAI GPT-4o */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                marginBottom: '6px',
                color: 'var(--text)'
              }}>
                {t('cost.pricing.openaiGpt4oInput', 'OpenAI GPT-4o Input (per 1K tokens)')}
              </label>
              <input
                type="number"
                step="0.0001"
                value={settings.openaiGpt4oInputTokens}
                onChange={(e) => handleSettingsUpdate({ openaiGpt4oInputTokens: parseFloat(e.target.value) })}
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
                {t('cost.pricing.openaiGpt4oOutput', 'OpenAI GPT-4o Output (per 1K tokens)')}
              </label>
              <input
                type="number"
                step="0.0001"
                value={settings.openaiGpt4oOutputTokens}
                onChange={(e) => handleSettingsUpdate({ openaiGpt4oOutputTokens: parseFloat(e.target.value) })}
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

            {/* OpenAI GPT-4o-mini */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                marginBottom: '6px',
                color: 'var(--text)'
              }}>
                {t('cost.pricing.openaiGpt4oMiniInput', 'OpenAI GPT-4o-mini Input (per 1K tokens)')}
              </label>
              <input
                type="number"
                step="0.00001"
                value={settings.openaiGpt4oMiniInputTokens}
                onChange={(e) => handleSettingsUpdate({ openaiGpt4oMiniInputTokens: parseFloat(e.target.value) })}
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
                {t('cost.pricing.openaiGpt4oMiniOutput', 'OpenAI GPT-4o-mini Output (per 1K tokens)')}
              </label>
              <input
                type="number"
                step="0.00001"
                value={settings.openaiGpt4oMiniOutputTokens}
                onChange={(e) => handleSettingsUpdate({ openaiGpt4oMiniOutputTokens: parseFloat(e.target.value) })}
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

            {/* OpenAI GPT-4 Legacy */}
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
            
            {/* OpenAI TTS */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                marginBottom: '6px',
                color: 'var(--text)'
              }}>
                {t('cost.pricing.openaiTts', 'OpenAI TTS (per 1K chars)')}
              </label>
              <input
                type="number"
                step="0.001"
                value={settings.openaiTtsPerCharacter}
                onChange={(e) => handleSettingsUpdate({ openaiTtsPerCharacter: parseFloat(e.target.value) })}
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
        gap: '12px',
        marginBottom: '16px'
      }}>
        {/* Total Cost */}
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '14px 16px'
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
                {formatCost(summary.totalCost)}
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
          padding: '14px 16px'
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
                {formatCost(summary.estimatedSavingsFromCache)}
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
          padding: '14px 16px'
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
                {formatCost(summary.netCost)}
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
          padding: '14px 16px'
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
                {Math.round(summary.totalLlmTokens / 1000)}{t('cost.units.kTokens', 'K tokens')}
              </p>
              <p style={{
                fontSize: '14px',
                color: 'var(--muted)',
                margin: '4px 0 0 0'
              }}>
                {Math.round(summary.totalTtsCharacters / 1000)}{t('cost.units.kCharacters', 'K characters')}
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
        gap: '12px',
        marginBottom: '16px'
      }}>
        {/* Cost by Service Type */}
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '14px 16px'
        }}>
          <h3 style={{
            fontSize: '16px',
            fontWeight: '600',
            marginBottom: '16px',
            color: 'var(--text)',
            margin: '0 0 12px 0'
          }}>
            {t('cost.costByService', 'Cost by Service')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                    {getOperationDisplayName(operation.operation)}
                  </p>
                  <p style={{
                    fontSize: '12px',
                    color: 'var(--muted)',
                    margin: '2px 0 0 0'
                  }}>
                    {operation.count} {t('cost.calls', 'calls')}
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

      {/* Module Breakdown and Timeline Charts */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '12px',
        marginBottom: '16px'
      }}>
        {/* Cost by Module */}
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '14px 16px'
        }}>
          <h3 style={{
            fontSize: '16px',
            fontWeight: '600',
            marginBottom: '16px',
            color: 'var(--text)',
            margin: '0 0 12px 0'
          }}>
            {t('cost.costByModule', 'Cost by Module')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {summary.costsByModule.slice(0, 6).map((module, index) => {
              const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
              const color = colors[index % colors.length];
              const percentage = summary.totalCost > 0 ? (module.cost / summary.totalCost) * 100 : 0;
              
              return (
                <div key={module.module} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontSize: '14px', color: 'var(--muted)' }}>
                      🧩 {module.module}
                    </span>
                    <span style={{ fontWeight: '600', color: 'var(--text)', fontSize: '14px' }}>
                      {CostCalculator.formatCost(module.cost, settings.currency)}
                    </span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '6px',
                    background: 'var(--border)',
                    borderRadius: '3px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      background: color,
                      borderRadius: '3px',
                      width: `${percentage}%`,
                      transition: 'width 0.3s ease'
                    }}></div>
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--muted)',
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}>
                    <span>{module.count} {t('cost.operations', 'operations')}</span>
                    <span>{percentage.toFixed(1)}%</span>
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--muted)',
                    fontStyle: 'italic',
                    marginTop: '2px'
                  }}>
                    {module.operations.slice(0, 3).map(op => getOperationDisplayName(op)).join(', ')}{module.operations.length > 3 ? `, +${module.operations.length - 3} more` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cost by Page */}
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '14px 16px'
        }}>
          <h3 style={{
            fontSize: '18px',
            fontWeight: '600',
            marginBottom: '16px',
            color: 'var(--text)',
            margin: '0 0 16px 0'
          }}>
            {t('cost.costByPage', 'Cost by Page')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Object.entries(summary.costsByPage)
              .sort(([,a], [,b]) => b - a) // Sort by cost descending
              .slice(0, 6)
              .map(([page, cost], index) => {
              const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
              const color = colors[index % colors.length];
              const percentage = summary.totalCost > 0 ? (cost / summary.totalCost) * 100 : 0;
              
              // Page icons mapping - using exact same emojis as navigation
              const pageIcons: Record<string, string> = {
                'book': '📖',
                'project': '📄', 
                'manuscript': '✍️',
                'casting': '🗣️',
                'characters': '🎭',
                'planning': '🪄',
                'voice': '🎙️',
                'packaging': '📦',
                'cost': '�',
                'settings': '⚙️',
                'home': '🏠',
                // Legacy mappings for old page names
                'orchestration': '🪄',
                'audio_production': '�️',
                'chapter_planning': '🪄',
                'unknown': '❓'
              };
              
              return (
                <div key={page} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontSize: '14px', color: 'var(--muted)' }}>
                      {pageIcons[page] || '📄'} {page.charAt(0).toUpperCase() + page.slice(1).replace('_', ' ')}
                    </span>
                    <span style={{ fontWeight: '600', color: 'var(--text)', fontSize: '14px' }}>
                      {CostCalculator.formatCost(cost, settings.currency)}
                    </span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '6px',
                    background: 'var(--border)',
                    borderRadius: '3px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      background: color,
                      borderRadius: '3px',
                      width: `${percentage}%`,
                      transition: 'width 0.3s ease'
                    }}></div>
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--muted)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span>{percentage.toFixed(1)}% {t('cost.ofTotalCost', 'of total cost')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timeline Chart */}
        <div style={{
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '14px 16px'
        }}>
          <h3 style={{
            fontSize: '18px',
            fontWeight: '600',
            marginBottom: '16px',
            color: 'var(--text)',
            margin: '0 0 16px 0'
          }}>
            {t('cost.costTimeline', 'Cost Timeline')}
          </h3>
          
          {summary.dailyCosts.length > 0 ? (
            <div style={{ position: 'relative' }}>
              {/* Chart Area */}
              <div style={{ 
                height: '200px', 
                position: 'relative',
                marginBottom: '16px',
                background: 'rgba(var(--text-rgb), 0.02)',
                borderRadius: '4px',
                padding: '12px'
              }}>
                {/* Y-axis labels */}
                <div style={{
                  position: 'absolute',
                  left: '0',
                  top: '0',
                  height: '100%',
                  width: '40px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  fontSize: '10px',
                  color: 'var(--muted)'
                }}>
                  <span>{Math.max(...summary.dailyCosts.map(d => d.cost)).toFixed(3)}</span>
                  <span>0</span>
                </div>
                
                {/* Chart bars */}
                <div style={{
                  marginLeft: '45px',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'end',
                  gap: '2px',
                  overflow: 'hidden'
                }}>
                  {summary.dailyCosts.slice(-30).map((day, index) => {
                    const maxCost = Math.max(...summary.dailyCosts.map(d => d.cost));
                    const llmHeight = maxCost > 0 ? (day.llmCost / maxCost) * 100 : 0;
                    const ttsHeight = maxCost > 0 ? (day.ttsCost / maxCost) * 100 : 0;
                    
                    return (
                      <div key={index} style={{
                        flex: 1,
                        height: '100%',
                        position: 'relative',
                        minWidth: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'end'
                      }}>
                        {/* Stacked bars for LLM and TTS costs */}
                        {day.llmCost > 0 && (
                          <div style={{
                            height: `${llmHeight}%`,
                            background: '#3b82f6',
                            borderRadius: '1px 1px 0 0',
                            minHeight: day.llmCost > 0 ? '2px' : '0'
                          }}></div>
                        )}
                        {day.ttsCost > 0 && (
                          <div style={{
                            height: `${ttsHeight}%`,
                            background: '#10b981',
                            borderRadius: day.llmCost > 0 ? '0' : '1px 1px 0 0',
                            minHeight: day.ttsCost > 0 ? '2px' : '0'
                          }}></div>
                        )}
                        
                        {/* Tooltip on hover */}
                        <div 
                          style={{
                            position: 'absolute',
                            bottom: '100%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'var(--tooltip-bg, rgba(0,0,0,0.8))',
                            color: 'var(--tooltip-text, white)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            whiteSpace: 'nowrap',
                            opacity: 0,
                            pointerEvents: 'none',
                            zIndex: 10,
                            transition: 'opacity 0.2s'
                          }}
                        >
                          <div>{day.date.toLocaleDateString()}</div>
                          <div>Total: {CostCalculator.formatCost(day.cost, settings.currency)}</div>
                          <div>Operations: {day.operations}</div>
                          {day.savings > 0 && <div>Saved: {CostCalculator.formatCost(day.savings, settings.currency)}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Legend */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '16px',
                fontSize: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '12px', height: '8px', background: '#3b82f6', borderRadius: '2px' }}></div>
                  <span style={{ color: 'var(--muted)' }}>LLM</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '12px', height: '8px', background: '#10b981', borderRadius: '2px' }}></div>
                  <span style={{ color: 'var(--muted)' }}>TTS</span>
                </div>
              </div>
              
              {/* Summary stats */}
              <div style={{
                marginTop: '16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
                gap: '8px',
                textAlign: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)' }}>
                    {summary.dailyCosts.length}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('cost.days', 'Days')}</div>
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)' }}>
                    {Math.round(summary.dailyCosts.reduce((sum, day) => sum + day.operations, 0) / summary.dailyCosts.length)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Avg Ops/Day</div>
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)' }}>
                    {CostCalculator.formatCost(summary.dailyCosts.reduce((sum, day) => sum + day.cost, 0) / summary.dailyCosts.length, settings.currency)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('cost.avgCostPerDay', 'Avg Cost/Day')}</div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              color: 'var(--muted)',
              fontSize: '14px'
            }}>
              📊 No timeline data available for the selected period
            </div>
          )}
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

      </div>
    </>
  );
}