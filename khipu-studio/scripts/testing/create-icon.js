const toIco = require('to-ico');
const fs = require('fs');
const path = require('path');

// Use the highest quality PNG files available
const iconFiles = [
  'assets/icons/icon_256x256.png',  // Start with largest for best quality
  'assets/icons/icon_128x128.png',
  'assets/icons/icon_64x64.png',
  'assets/icons/icon_48x48.png',
  'assets/icons/icon_32x32.png',
  'assets/icons/icon_16x16.png'
];

const images = iconFiles.map(file => fs.readFileSync(file));

toIco(images, { resize: true })
  .then(buf => {
    fs.writeFileSync('assets/icons/icon.ico', buf);
    console.log('✓ Created icon.ico with multiple sizes (256, 128, 64, 48, 32, 16)');
    const stats = fs.statSync('assets/icons/icon.ico');
    console.log(`  Size: ${(stats.size / 1024).toFixed(2)} KB`);
  })
  .catch(err => {
    console.error('Error creating icon:', err);
  });
