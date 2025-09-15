// Navigation Protection Test Component
// Simple test to verify navigation protection is working

import { useState } from 'react';
import { useProcessProtection } from '../hooks/useProcessProtection';

export const NavigationProtectionTest: React.FC = () => {
  const { registerProcess, unregisterProcess, activeProcesses } = useProcessProtection();
  const [testProcessRunning, setTestProcessRunning] = useState(false);
  const [processId, setProcessId] = useState<string>('');

  const startTestProcess = () => {
    const id = `test-process-${Date.now()}`;
    setProcessId(id);
    setTestProcessRunning(true);
    registerProcess(id, 'Test process for navigation protection', 'Test');
    
    // Auto-stop after 10 seconds
    setTimeout(() => {
      stopTestProcess();
    }, 10000);
  };

  const stopTestProcess = () => {
    if (processId) {
      unregisterProcess(processId);
      setProcessId('');
    }
    setTestProcessRunning(false);
  };

  return (
    <div style={{ 
      background: 'var(--panel)', 
      padding: '16px', 
      borderRadius: '8px', 
      border: '1px solid var(--border)',
      margin: '16px 0'
    }}>
      <h3>🔒 Navigation Protection Test</h3>
      <p>This component tests the navigation protection system.</p>
      
      <div style={{ margin: '8px 0' }}>
        <strong>Active Processes: {activeProcesses.length}</strong>
      </div>
      
      {activeProcesses.length > 0 && (
        <ul style={{ fontSize: '12px', color: 'var(--muted)' }}>
          {activeProcesses.map(process => (
            <li key={process.id}>
              {process.description} ({process.page})
            </li>
          ))}
        </ul>
      )}
      
      <div style={{ margin: '12px 0' }}>
        {!testProcessRunning ? (
          <button 
            onClick={startTestProcess}
            style={{
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Start Test Process (10s)
          </button>
        ) : (
          <div>
            <p style={{ color: 'var(--warning)' }}>
              ⚠️ Test process running... Try navigating to another page!
            </p>
            <button 
              onClick={stopTestProcess}
              style={{
                background: 'var(--danger)',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Stop Test Process
            </button>
          </div>
        )}
      </div>
      
      <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '12px' }}>
        <p>📝 Instructions:</p>
        <ol>
          <li>Click "Start Test Process" to simulate an active process</li>
          <li>Try clicking on other navigation links while the process is running</li>
          <li>You should see a confirmation dialog asking if you want to interrupt the process</li>
          <li>Cancel to stay, or confirm to navigate (interrupting the process)</li>
        </ol>
      </div>
    </div>
  );
};