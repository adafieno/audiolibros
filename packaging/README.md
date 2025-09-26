Spotify package generator

Usage:

node generate_spotify_package.js [path/to/manifest.json] [outputDir]

Defaults:
- manifest.json in current working directory
- outputDir: ./dist/spotify-<timestamp>

What it does:
- Validates required manifest fields (cover and audio_files)
- Copies cover and audio files into a tidy output folder
- Writes a minimal spotify_manifest.json ready for upload or further processing

This is a first-pass tool. I'll add more validations (audio specs, durations, BISAC) after you review.