// SoX-based Audio Processing Engine (Main Process)
// Reliable professional audio processing using Sound eXchange

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * SoX-based audio processor that handles professional audio processing
 * Much more reliable than FFmpeg for audio-only processing
 */
class SoxAudioProcessor {
  constructor(soxPath, tempDir, cacheDir) {
    this.soxPath = soxPath || this.findSoxPath();
    this.tempDir = tempDir || path.join(__dirname, '../../temp');
    this.cacheDir = cacheDir || path.join(__dirname, '../../cache');
    this.activeProcesses = new Map();
    
    // Ensure directories exist
    this.ensureDirectories();
  }

  /**
   * Ensure required directories exist
   */
  ensureDirectories() {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Find SoX executable path
   */
  findSoxPath() {
    const os = require('os');
    // Check WinGet installation path first
    const wingetPath = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', 'ChrisBagwell.SoX_Microsoft.Winget.Source_8wekyb3d8bbwe', 'sox-14.4.2', 'sox.exe');
    if (fs.existsSync(wingetPath)) {
      console.log('Using WinGet SoX installation');
      return wingetPath;
    }
    
    // Fallback to system PATH
    console.log('Falling back to system PATH SoX');
    return 'sox';
  }

  /**
   * Generate cache key for processed audio based on settings
   */
  generateCacheKey(inputPath, processingChain) {
    const settingsString = JSON.stringify(processingChain);
    const combinedString = `${inputPath}:${settingsString}`;
    
    let hash = 0;
    for (let i = 0; i < combinedString.length; i++) {
      const char = combinedString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return `sox_audio_${Math.abs(hash).toString(36)}.wav`;
  }

  /**
   * Check if cached processed audio exists
   */
  hasCachedAudio(cacheKey) {
    const cachePath = path.join(this.cacheDir, cacheKey);
    return fs.existsSync(cachePath);
  }

  /**
   * Get path to cached processed audio
   */
  getCachedAudioPath(cacheKey) {
    const cachePath = path.join(this.cacheDir, cacheKey);
    return fs.existsSync(cachePath) ? cachePath : null;
  }

  /**
   * Get path to cached processed audio (alias for compatibility)
   */
  getCachedPath(cacheKey) {
    return this.getCachedAudioPath(cacheKey);
  }

  /**
   * Build SoX effects chain from processing chain configuration
   */
  buildSoxEffects(chain) {
    const effects = [];

    // Stage 1: Noise & Cleanup
    if (chain.noiseCleanup.highPassFilter.enabled) {
      const freq = parseInt(chain.noiseCleanup.highPassFilter.frequency);
      effects.push('highpass', freq.toString());
    }

    // Stage 2: Dynamic Control
    if (chain.dynamicControl.compression.enabled) {
      const threshold = chain.dynamicControl.compression.threshold;
      const ratio = parseFloat(chain.dynamicControl.compression.ratio.split(':')[0]);
      // SoX compand: attack,decay,soft-knee,in-dB:out-dB points
      // Simple compression: above threshold, reduce by ratio
      const outputLevel = threshold / ratio;
      effects.push('compand', '0.003,0.09', `6:${threshold},${outputLevel}`);
    }

    if (chain.dynamicControl.limiter.enabled) {
      const ceiling = Math.abs(chain.dynamicControl.limiter.ceiling);
      effects.push('gain', `-1`);
      effects.push('compand', '0.02,0.20', `6:0,${-ceiling}`);
    }

    // Stage 3: EQ Shaping
    if (chain.eqShaping.lowMidCut.enabled) {
      const freq = parseInt(chain.eqShaping.lowMidCut.frequency);
      const gain = chain.eqShaping.lowMidCut.gain;
      effects.push('equalizer', freq.toString(), '1q', gain.toString());
    }

    if (chain.eqShaping.presenceBoost.enabled) {
      const freq = parseFloat(chain.eqShaping.presenceBoost.frequency) * 1000; // Convert kHz to Hz
      const gain = chain.eqShaping.presenceBoost.gain;
      effects.push('equalizer', freq.toString(), '1q', gain.toString());
    }

    if (chain.eqShaping.airLift.enabled) {
      const freq = parseFloat(chain.eqShaping.airLift.frequency) * 1000; // Convert kHz to Hz
      const gain = chain.eqShaping.airLift.gain;
      
      // Cap frequency at Nyquist limit (8kHz for 16kHz sample rate audio)
      // SoX fails if frequency >= sample_rate / 2
      const maxFreq = 7800; // Leave some headroom below 8kHz Nyquist limit
      const cappedFreq = Math.min(freq, maxFreq);
      
      if (freq > maxFreq) {
        console.log(`⚠️  Air lift frequency ${freq}Hz exceeds Nyquist limit, capping to ${cappedFreq}Hz`);
      }
      
      effects.push('equalizer', cappedFreq.toString(), '1q', gain.toString());
    }

    // Stage 4: Spatial Enhancement
    if (chain.spatialEnhancement.reverb.enabled) {
      const wetMix = chain.spatialEnhancement.reverb.wetMix;
      const roomType = chain.spatialEnhancement.reverb.type;
      
      // Simple reverb using echo effect
      const delay = roomType === 'room_0.3' ? 30 : roomType === 'room_0.4' ? 40 : 50;
      const decay = 0.4;
      effects.push('echo', '0.8', '0.9', delay.toString(), (decay * wetMix / 100).toString());
    }

    // Stage 5: Mastering
    if (chain.mastering.normalization.enabled) {
      const targetLUFS = parseFloat(chain.mastering.normalization.targetLUFS);
      // SoX gain normalization (approximate LUFS normalization)
      const gainValue = Math.abs(targetLUFS) - 20; // Rough conversion
      effects.push('gain', '-n', gainValue.toString());
    }

    return effects;
  }

  /**
   * Execute SoX with the given arguments
   */
  async executeSox(args, onProgress) {
    return new Promise((resolve, reject) => {
      const processId = `sox_${Date.now()}`;
      console.log('Executing SoX:', this.soxPath, 'with args:', args);
      
      const process = spawn(this.soxPath, args);
      
      this.activeProcesses.set(processId, process);
      
      let stderr = '';
      let stdout = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
        if (onProgress) {
          onProgress({ stage: 'Processing', progress: 50 });
        }
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        this.activeProcesses.delete(processId);
        console.log('SoX process closed with code:', code);
        if (code === 0) {
          resolve();
        } else {
          console.error('SoX process failed:', stderr);
          reject(new Error(`SoX process failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        this.activeProcesses.delete(processId);
        console.error('SoX spawn error:', error);
        reject(error);
      });
    });
  }

  /**
   * Process audio file with the specified processing chain
   */
  async processAudio(options, onProgress) {
    const { id, inputPath, processingChain, cacheKey } = options;
    
    // Check for cached version first using provided cacheKey
    if (cacheKey) {
      const cachedPath = this.getCachedAudioPath(cacheKey);
      if (cachedPath) {
        return {
          success: true,
          outputPath: cachedPath,
          cached: true
        };
      }
    }

    // Generate output path in cache directory
    const outputFileName = cacheKey || this.generateCacheKey(inputPath, processingChain);
    const outputPath = path.join(this.cacheDir, `${outputFileName}.wav`);

    const effects = this.buildSoxEffects(processingChain);
    
    const args = [
      inputPath,              // Input file
      outputPath,             // Output file
      ...effects              // Effects chain
    ];

    if (onProgress) {
      onProgress({ stage: 'Starting', progress: 0 });
    }

    try {
      await this.executeSox(args, onProgress);
      
      if (onProgress) {
        onProgress({ stage: 'Complete', progress: 100 });
      }

      return {
        success: true,
        outputPath,
        cached: false
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get information about an audio file using SoX
   */
  async getAudioInfo(filePath) {
    return new Promise((resolve, reject) => {
      const args = ['--i', filePath];
      const process = spawn(this.soxPath, args);

      let stderr = '';
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', () => {
        try {
          // Parse SoX info output
          const durationMatch = stderr.match(/Duration\s+:\s+(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
          const channelsMatch = stderr.match(/Channels\s+:\s+(\d+)/);
          const sampleRateMatch = stderr.match(/Sample Rate\s+:\s+(\d+)/);
          
          if (durationMatch) {
            const [, hours, minutes, seconds] = durationMatch;
            const duration = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
            
            resolve({
              duration,
              channels: channelsMatch ? parseInt(channelsMatch[1]) : 2,
              sampleRate: sampleRateMatch ? parseInt(sampleRateMatch[1]) : 44100,
              format: 'wav'
            });
          } else {
            reject(new Error('Could not parse audio information from SoX'));
          }
        } catch (error) {
          reject(error);
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Cancel processing operation
   */
  cancelProcessing(id) {
    const process = this.activeProcesses.get(id);
    if (process) {
      process.kill('SIGTERM');
      this.activeProcesses.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Check if SoX is available
   */
  async isAvailable() {
    try {
      const args = ['--version'];
      const process = spawn(this.soxPath, args);
      
      return new Promise((resolve) => {
        process.on('close', (code) => {
          resolve(code === 0);
        });
        
        process.on('error', () => {
          resolve(false);
        });
        
        // Timeout after 5 seconds
        setTimeout(() => {
          process.kill();
          resolve(false);
        }, 5000);
      });
    } catch {
      return false;
    }
  }

  /**
   * Clean old cache files
   */
  cleanCache(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days default
    try {
      const files = fs.readdirSync(this.cacheDir);
      const now = Date.now();
      
      files.forEach(file => {
        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
        }
      });
    } catch (error) {
      console.error('Cache cleanup failed:', error);
    }
  }
}

module.exports = { SoxAudioProcessor };