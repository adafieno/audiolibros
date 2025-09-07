// Simple test to verify characters.json loading
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, 'sample');
const charactersPath = path.join(projectRoot, 'dossier', 'characters.json');

console.log('Project root:', projectRoot);
console.log('Characters path:', charactersPath);
console.log('File exists:', fs.existsSync(charactersPath));

if (fs.existsSync(charactersPath)) {
  try {
    const content = fs.readFileSync(charactersPath, 'utf8');
    const characters = JSON.parse(content);
    console.log('Characters loaded:', characters.length);
    console.log('Character names:', characters.map(c => c.name));
  } catch (error) {
    console.error('Error reading characters:', error);
  }
} else {
  console.log('Characters file not found!');
}
