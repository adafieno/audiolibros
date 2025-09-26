#!/usr/bin/env node
/**
 * Simple Spotify package generator
 * Usage: node generate_spotify_package.js [path/to/manifest.json] [outputDir]
 * Defaults: manifest.json in cwd, outputDir=./dist/spotify-<timestamp>
 *
 * Behavior:
 * - Reads manifest.json
 * - Validates presence of cover and audio_files
 * - Copies listed audio files and cover into output folder preserving filenames
 * - Emits spotify_manifest.json containing minimal metadata and new asset paths
 *
 * This script is intentionally conservative and uses only Node built-ins.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

async function main() {
  try {
    const manifestPath = process.argv[2] || path.resolve(process.cwd(), 'manifest.json');
    const outArg = process.argv[3];

    if (!fs.existsSync(manifestPath)) {
      console.error('manifest.json not found at', manifestPath);
      process.exit(2);
    }

    const manifestDir = path.dirname(manifestPath);
    const raw = await fsp.readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);

    // Minimal validation
    const assets = manifest.assets || {};
    const cover = assets.cover && assets.cover.path;
    const audioFiles = Array.isArray(assets.audio_files) ? assets.audio_files : [];

    if (!cover) {
      console.error('Manifest missing assets.cover.path — cover is required for Spotify packaging');
      process.exit(3);
    }
    if (audioFiles.length === 0) {
      console.error('Manifest.assets.audio_files is empty — at least one audio file required');
      process.exit(4);
    }

    const timestamp = Date.now();
    const outBase = outArg ? path.resolve(process.cwd(), outArg) : path.resolve(process.cwd(), `dist/spotify-${timestamp}`);

    // Create directories
    await fsp.mkdir(outBase, { recursive: true });
    const outAudio = path.join(outBase, 'audio');
    const outArt = path.join(outBase, 'art');
    await fsp.mkdir(outAudio, { recursive: true });
    await fsp.mkdir(outArt, { recursive: true });

    // Copy cover
    const coverSrc = path.resolve(manifestDir, cover);
    const coverName = path.basename(coverSrc);
    const coverDst = path.join(outArt, coverName);
    await copyFileIfExists(coverSrc, coverDst, 'cover');

    // Copy audio files
    const copiedAudio = [];
    for (const af of audioFiles) {
      const srcRel = af.path;
      const src = path.resolve(manifestDir, srcRel);
      const name = path.basename(src);
      const dst = path.join(outAudio, name);
      await copyFileIfExists(src, dst, `audio ${name}`);
      copiedAudio.push({ ...af, path: path.join('audio', name) });
    }

    // Compose spotify manifest
    const spotifyManifest = {
      title: manifest.title || manifest.name || null,
      subtitle: manifest.subtitle || null,
      contributors: manifest.contributors || manifest.contributors || manifest.contributors || manifest.contributors || manifest.contributors || manifest.contributors || manifest.contributors || manifest.contributors || manifest.contributors || manifest.contributors || manifest.contributors || manifest.contributors,
      // fallback to manifest.contributors or manifest.contributors.* if present
      narration: manifest.narration || null,
      language: manifest.language || null,
      description: manifest.description || null,
      assets: {
        cover: path.join('art', coverName),
        audio_files: copiedAudio,
        sample: assets.sample ? assets.sample.path : null
      },
      generatedAt: new Date().toISOString()
    };

    const spotifyManifestPath = path.join(outBase, 'spotify_manifest.json');
    await fsp.writeFile(spotifyManifestPath, JSON.stringify(spotifyManifest, null, 2), 'utf8');

    console.log('Spotify package created at:', outBase);
    console.log('Cover:', coverDst);
    console.log('Audio files copied:', copiedAudio.length);
    console.log('Spotify manifest:', spotifyManifestPath);
    process.exit(0);
  } catch (err) {
    console.error('Error while generating Spotify package:', err);
    process.exit(1);
  }
}

async function copyFileIfExists(src, dst, label) {
  try {
    await fsp.access(src, fs.constants.R_OK);
    await fsp.copyFile(src, dst);
    return true;
  } catch (e) {
    console.error(`Missing ${label} file: ${src}`);
    throw e;
  }
}

main();
