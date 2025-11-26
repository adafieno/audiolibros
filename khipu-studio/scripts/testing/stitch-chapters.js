const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function stitchChapters() {
  const projectRoot = 'C:\\projects\\audiobooks\\projects\\roquete_del_copete';
  const audioDir = path.join(projectRoot, 'audio', 'wav');
  
  // Input files
  const ch01File = path.join(audioDir, 'ch01_complete.wav');
  const ch02File = path.join(audioDir, 'ch02_complete.wav');
  
  // Output file
  const outputFile = path.join(audioDir, 'chapters_01-02_complete.wav');
  
  // Verify input files exist
  if (!fs.existsSync(ch01File)) {
    console.error('❌ Chapter 1 file not found:', ch01File);
    return;
  }
  if (!fs.existsSync(ch02File)) {
    console.error('❌ Chapter 2 file not found:', ch02File);
    return;
  }
  
  console.log('🎬 Stitching chapters 1 and 2...');
  console.log('📁 Chapter 1:', ch01File);
  console.log('📁 Chapter 2:', ch02File);
  console.log('📁 Output:', outputFile);
  
  // Create temporary concat file
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const concatFile = path.join(tempDir, `concat_chapters_${Date.now()}.txt`);
  const concatContent = `file '${ch01File.replace(/\\/g, '/').replace(/'/g, "\\'")}'\nfile '${ch02File.replace(/\\/g, '/').replace(/'/g, "\\'")}'\n`;
  
  fs.writeFileSync(concatFile, concatContent);
  console.log('📝 Created concat file:', concatFile);
  
  // FFmpeg command
  const ffmpegArgs = [
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    '-c:a', 'pcm_s16le',     // 16-bit PCM codec
    '-ar', '44100',          // 44.1kHz sample rate
    '-ac', '1',              // Mono channel
    '-y',                    // Overwrite output file
    outputFile
  ];
  
  console.log('🎬 Running FFmpeg concatenation...');
  
  const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
  
  let stderr = '';
  let stdout = '';
  
  ffmpegProcess.stderr.on('data', (data) => {
    stderr += data.toString();
    // Show progress
    if (data.toString().includes('time=')) {
      const timeMatch = data.toString().match(/time=(\d+:\d+:\d+\.\d+)/);
      if (timeMatch) {
        process.stdout.write(`\r⏱️  Processing: ${timeMatch[1]}`);
      }
    }
  });
  
  ffmpegProcess.stdout.on('data', (data) => {
    stdout += data.toString();
  });
  
  const exitCode = await new Promise((resolve) => {
    ffmpegProcess.on('close', resolve);
    ffmpegProcess.on('error', (error) => {
      console.error('\n❌ FFmpeg process error:', error);
      resolve(-1);
    });
  });
  
  // Clean up temp file
  try {
    fs.unlinkSync(concatFile);
  } catch (cleanupError) {
    console.warn('\n⚠️  Failed to clean up temp file:', cleanupError);
  }
  
  if (exitCode !== 0) {
    console.error('\n❌ FFmpeg failed (exit code ' + exitCode + '):');
    console.error(stderr);
    return;
  }
  
  // Verify output file and get stats
  if (fs.existsSync(outputFile)) {
    const stats = fs.statSync(outputFile);
    console.log('\n✅ Successfully created combined chapters!');
    console.log('📊 File size:', Math.round(stats.size / 1024 / 1024 * 100) / 100, 'MB');
    
    // Get duration using ffprobe
    try {
      const ffprobeProcess = spawn('ffprobe', [
        '-v', 'quiet',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        outputFile
      ]);
      
      let durationStr = '';
      ffprobeProcess.stdout.on('data', (data) => {
        durationStr += data.toString();
      });
      
      const probeExitCode = await new Promise((resolve) => {
        ffprobeProcess.on('close', resolve);
        ffprobeProcess.on('error', () => resolve(-1));
      });
      
      if (probeExitCode === 0) {
        const duration = parseFloat(durationStr.trim());
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        console.log('⏱️  Total duration:', `${minutes}:${seconds.toString().padStart(2, '0')}`);
      }
    } catch (probeError) {
      console.warn('⚠️  Could not get duration info:', probeError);
    }
    
    console.log('🎉 Done! Combined file saved as:', path.basename(outputFile));
  } else {
    console.error('❌ Output file was not created');
  }
}

// Run the stitching
stitchChapters().catch(console.error);