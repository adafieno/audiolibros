// FFmpeg-based Audio Processing Engine (Main Process)
// Handles professional audio processing chain with Node.js FFmpeg integration

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Main process audio processor that handles actual FFmpeg operations
 * This runs in the Electron main process with full Node.js access
 */
class FFmpegAudioProcessor {
  constructor(ffmpegPath, tempDir, cacheDir) {
    this.ffmpegPath = ffmpegPath || this.findFFmpegPath();
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
   * Find FFmpeg executable path
   */
  findFFmpegPath() {
    // Check bundled FFmpeg first
    const bundledPath = path.join(__dirname, '../../bin/ffmpeg/ffmpeg.exe');
    console.log('Checking bundled FFmpeg at:', bundledPath);
    if (fs.existsSync(bundledPath)) {
      console.log('Using bundled FFmpeg');
      return bundledPath;
    }
    
    // Fallback to system FFmpeg
    console.log('Bundled FFmpeg not found, using system FFmpeg');
    return 'ffmpeg';
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
    
    return `audio_${Math.abs(hash).toString(36)}.wav`;
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
   * Build FFmpeg filter complex string from processing chain
   */
  buildFilterComplex(chain) {
    const filters = [];
    let currentLabel = '0';

    // Stage 1: Noise & Cleanup
    if (chain.noiseCleanup.highPassFilter.enabled) {
      const freq = parseInt(chain.noiseCleanup.highPassFilter.frequency);
      filters.push(`[${currentLabel}]highpass=f=${freq}[highpass]`);
      currentLabel = 'highpass';
    }

    // Note: De-click/De-ess requires more sophisticated processing
    // For now we'll use a simple noise gate as a placeholder
    if (chain.noiseCleanup.deClickDeEss.enabled) {
      const threshold = chain.noiseCleanup.deClickDeEss.intensity === 'light' ? -40 : 
                       chain.noiseCleanup.deClickDeEss.intensity === 'medium' ? -35 : -30;
      filters.push(`[${currentLabel}]agate=threshold=${threshold}dB:ratio=4:attack=0.1:release=0.2[declick]`);
      currentLabel = 'declick';
    }

    // Stage 2: Dynamic Control
    if (chain.dynamicControl.compression.enabled) {
      const threshold = chain.dynamicControl.compression.threshold;
      const ratio = parseFloat(chain.dynamicControl.compression.ratio.split(':')[0]);
      
      filters.push(`[${currentLabel}]acompressor=threshold=${threshold}dB:ratio=${ratio}:attack=0.003:release=0.09[comp]`);
      currentLabel = 'comp';
    }

    if (chain.dynamicControl.limiter.enabled) {
      const ceiling = chain.dynamicControl.limiter.ceiling;
      filters.push(`[${currentLabel}]alimiter=limit=${ceiling}dB:attack=5:release=50[limit]`);
      currentLabel = 'limit';
    }

    // Stage 3: EQ Shaping
    if (chain.eqShaping.lowMidCut.enabled) {
      const freq = parseInt(chain.eqShaping.lowMidCut.frequency);
      const gain = chain.eqShaping.lowMidCut.gain;
      filters.push(`[${currentLabel}]equalizer=f=${freq}:width_type=h:width=1:g=${gain}[lowmid]`);
      currentLabel = 'lowmid';
    }

    if (chain.eqShaping.presenceBoost.enabled) {
      const freq = parseFloat(chain.eqShaping.presenceBoost.frequency) * 1000; // Convert kHz to Hz
      const gain = chain.eqShaping.presenceBoost.gain;
      filters.push(`[${currentLabel}]equalizer=f=${freq}:width_type=h:width=1:g=${gain}[presence]`);
      currentLabel = 'presence';
    }

    if (chain.eqShaping.airLift.enabled) {
      const freq = parseFloat(chain.eqShaping.airLift.frequency) * 1000; // Convert kHz to Hz
      const gain = chain.eqShaping.airLift.gain;
      filters.push(`[${currentLabel}]equalizer=f=${freq}:width_type=h:width=1:g=${gain}[air]`);
      currentLabel = 'air';
    }

    // Stage 4: Spatial Enhancement  
    if (chain.spatialEnhancement.reverb.enabled) {
      const wetMix = chain.spatialEnhancement.reverb.wetMix / 100;
      const roomType = chain.spatialEnhancement.reverb.type;
      
      // Simple reverb implementation - could be enhanced with impulse responses
      const delay = roomType === 'room_0.3' ? 30 : roomType === 'room_0.4' ? 40 : 50;
      filters.push(`[${currentLabel}]aecho=in_gain=${1-wetMix}:out_gain=${wetMix}:delays=${delay}:decays=0.4[reverb]`);
      currentLabel = 'reverb';
    }

    if (chain.spatialEnhancement.stereoEnhancer.enabled) {
      const width = chain.spatialEnhancement.stereoEnhancer.width / 100 * 2; // 0-2 range
      filters.push(`[${currentLabel}]extrastereo=m=${width}:c=false[stereo]`);
      currentLabel = 'stereo';
    }

    // Stage 5: Mastering
    if (chain.mastering.normalization.enabled) {
      const targetLUFS = parseFloat(chain.mastering.normalization.targetLUFS);
      const peakLimit = chain.mastering.peakLimiting.enabled ? chain.mastering.peakLimiting.maxPeak : -1;
      
      filters.push(
        `[${currentLabel}]loudnorm=I=${Math.abs(targetLUFS)}:TP=${peakLimit}:LRA=7[norm]`
      );
      currentLabel = 'norm';
    }

    return filters.length > 0 ? filters.join(';') : '';
  }

  /**
   * Execute FFmpeg with the given arguments
   */
  async executeFFmpeg(args, onProgress) {
    return new Promise((resolve, reject) => {
      const processId = `ffmpeg_${Date.now()}`;
      console.log('Executing FFmpeg:', this.ffmpegPath, 'with args:', args);
      
      const process = spawn(this.ffmpegPath, args);
      
      this.activeProcesses.set(processId, process);
      
      let stderr = '';
      let duration = 0;

      process.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;

        // Parse duration from FFmpeg output
        const durationMatch = chunk.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (durationMatch) {
          const [, hours, minutes, seconds] = durationMatch;
          duration = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
        }

        // Parse progress
        const timeMatch = chunk.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (timeMatch && duration > 0 && onProgress) {
          const [, hours, minutes, seconds] = timeMatch;
          const currentTime = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
          const progress = (currentTime / duration) * 100;
          const timeRemaining = duration - currentTime;
          
          onProgress({
            stage: 'Processing',
            progress,
            timeRemaining
          });
        }
      });

      process.on('close', (code) => {
        this.activeProcesses.delete(processId);
        console.log('FFmpeg process closed with code:', code);
        if (code === 0) {
          resolve();
        } else {
          console.error('FFmpeg process failed:', stderr);
          reject(new Error(`FFmpeg process failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        this.activeProcesses.delete(processId);
        console.error('FFmpeg spawn error:', error);
        reject(error);
      });
    });
  }

  /**
   * Process audio file with the specified processing chain
   */
  async processAudio(options, onProgress) {
    const { inputPath, outputPath, processingChain } = options;
    
    // Check for cached version first
    const cacheKey = this.generateCacheKey(inputPath, processingChain);
    const cachedPath = this.getCachedAudioPath(cacheKey);
    
    if (cachedPath) {
      // Copy cached file to output path
      fs.copyFileSync(cachedPath, outputPath);
      return {
        success: true,
        outputPath,
        cached: true
      };
    }

    const filterComplex = this.buildFilterComplex(processingChain);
    
    const args = [
      '-i', inputPath,
      '-af', filterComplex || 'anull', // Use anull if no filters
      '-c:a', 'pcm_s16le', // High quality PCM for caching
      '-y', // Overwrite output
      outputPath
    ];

    if (onProgress) {
      onProgress({ stage: 'Starting', progress: 0 });
    }

    try {
      await this.executeFFmpeg(args, onProgress);
      
      // Cache the processed audio
      const cachePath = path.join(this.cacheDir, cacheKey);
      fs.copyFileSync(outputPath, cachePath);
      
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
   * Get information about an audio file
   */
  async getAudioInfo(filePath) {
    return new Promise((resolve, reject) => {
      const args = ['-i', filePath, '-f', 'null', '-'];
      const process = spawn(this.ffmpegPath, args);

      let stderr = '';
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', () => {
        try {
          // Parse FFmpeg output for audio information
          const durationMatch = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
          const formatMatch = stderr.match(/Input #0, ([^,]+),/);
          const channelsMatch = stderr.match(/(\d+) channels/);
          const sampleRateMatch = stderr.match(/(\d+) Hz/);
          const bitRateMatch = stderr.match(/(\d+) kb\/s/);
          
          if (durationMatch) {
            const [, hours, minutes, seconds] = durationMatch;
            const duration = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
            
            resolve({
              duration,
              format: formatMatch ? formatMatch[1] : 'unknown',
              channels: channelsMatch ? parseInt(channelsMatch[1]) : 2,
              sampleRate: sampleRateMatch ? parseInt(sampleRateMatch[1]) : 44100,
              bitRate: bitRateMatch ? parseInt(bitRateMatch[1]) : 0
            });
          } else {
            reject(new Error('Could not parse audio information'));
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
   * Check if FFmpeg is available
   */
  async isAvailable() {
    try {
      const args = ['-version'];
      const process = spawn(this.ffmpegPath, args);
      
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

module.exports = { FFmpegAudioProcessor };