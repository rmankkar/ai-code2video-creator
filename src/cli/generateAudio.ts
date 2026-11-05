#!/usr/bin/env tsx
/**
 * CLI: Generate Audio Narration from Script
 * Cross-platform TTS: macOS (say), Windows (SAPI), Linux (espeak)
 * Free, offline, built-in text-to-speech on all platforms
 * Usage: npm run generate:audio [script.json]
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { generateAudioForScript, generateCaptions, checkDependencies, getAvailableVoices } from '../services/ttsGenerator.js';
import { validateScript } from '../types/script.js';

function printHelp() {
  const platform = process.platform;
  const platformNames: Record<string, string> = {
    darwin: 'macOS (say)',
    win32: 'Windows (SAPI)',
    linux: 'Linux (espeak)',
  };
  const ttsEngine = platformNames[platform] || platform;

  console.log(`
Usage: npm run generate:audio [script.json] [options]

Arguments:
  script.json             Path to script JSON (default: src/generated/script.json)

Options:
  --voice, -v             Voice name (default: platform-specific)
  --rate, -r              Speech rate in words/min (default: 165)
  --output-dir, -o        Audio output directory (default: public/audio)
  --list-voices           List available voices for current platform
  --help, -h              Show this help

Examples:
  npm run generate:audio
  npm run generate:audio src/generated/script.json --voice "Microsoft Zira Desktop" --rate 180
  npm run generate:audio --list-voices

Prerequisites:
  - ffmpeg (install from https://ffmpeg.org/download.html)
  - ${ttsEngine} (built-in on all supported platforms)

Platform-specific notes:
  macOS:   Uses 'say' command. Voices: say -v '?'
  Windows: Uses built-in SAPI. Voices: Microsoft David Desktop, Microsoft Zira Desktop
  Linux:   Uses espeak. Install: sudo apt install espeak

Environment variables:
  TTS_VOICE   Default voice name
  TTS_RATE    Default speech rate (words per minute)
`);
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
  }

  // Handle --list-voices
  if (args.includes('--list-voices')) {
    console.log(`\n🎤 Available voices for ${process.platform}:`);
    const voices = getAvailableVoices();
    if (voices.length === 0) {
      console.log('   (none found - check TTS installation)');
    } else {
      voices.forEach(v => console.log(`   - ${v}`));
    }
    console.log('');
    process.exit(0);
  }

  // Check dependencies
  const deps = checkDependencies();

  if (!deps.ffmpeg || !deps.ffprobe) {
    console.error('\n❌ Missing required dependencies:');
    if (!deps.ffmpeg) console.error('   - ffmpeg not found. Install from: https://ffmpeg.org/download.html');
    if (!deps.ffprobe) console.error('   - ffprobe not found (comes with ffmpeg)');
    console.error(`\n   Platform: ${deps.platform}`);
    process.exit(1);
  }

  if (!deps.tts) {
    console.error('\n❌ Text-to-speech engine not available:');
    if (process.platform === 'darwin') {
      console.error('   - "say" command not found (should be built-in on macOS)');
    } else if (process.platform === 'linux') {
      console.error('   - espeak not found. Install: sudo apt install espeak');
    } else {
      console.error(`   - No TTS engine found for ${process.platform}`);
    }
    console.error(`\n   Platform: ${deps.platform}`);
    process.exit(1);
  }

  // Determine script path
  const scriptPath = args[0] && !args[0].startsWith('--')
    ? args[0]
    : resolve('src/generated/script.json');

  // Parse options
  const voice = args.includes('--voice') || args.includes('-v')
    ? args[args.indexOf('--voice') !== -1 ? args.indexOf('--voice') + 1 : args.indexOf('-v') + 1]
    : undefined;
  const rate = args.includes('--rate') || args.includes('-r')
    ? parseInt(args[args.indexOf('--rate') !== -1 ? args.indexOf('--rate') + 1 : args.indexOf('-r') + 1], 10)
    : undefined;
  const outputDir = args.includes('--output-dir') || args.includes('-o')
    ? args[args.indexOf('--output-dir') !== -1 ? args.indexOf('--output-dir') + 1 : args.indexOf('-o') + 1]
    : undefined;

  try {
    console.log(`\n📖 Loading script: ${scriptPath}`);
    const scriptContent = readFileSync(scriptPath, 'utf-8');
    const script = validateScript(JSON.parse(scriptContent));

    interface TTSOptionsInput {
      voice?: string;
      rate?: number;
      outputDir: string;
      scriptTitle: string;
    }
    const ttsOptions: TTSOptionsInput = {
      outputDir: outputDir || resolve('public/audio'),
      scriptTitle: script.title,
    };
    if (voice !== undefined) ttsOptions.voice = voice;
    if (rate !== undefined) ttsOptions.rate = rate;

    const manifest = await generateAudioForScript(script.scenes, ttsOptions);

    // Generate captions
    generateCaptions(manifest);

    // Update composition config with audio manifest
    const configPath = resolve('src/generated/composition-config.json');
    let config: Record<string, unknown> = {};
    try {
      const existing = readFileSync(configPath, 'utf-8');
      config = JSON.parse(existing);
    } catch {
      // Config doesn't exist yet
    }
    config.audioManifest = manifest;
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`📝 Composition config updated: ${configPath}`);

    console.log(`\n✅ Audio generation complete!`);
    console.log(`   Segments: ${manifest.segments.length}`);
    console.log(`   Total: ${(manifest.totalDurationMs / 1000).toFixed(1)}s`);

  } catch (error) {
    console.error(`\n❌ Failed to generate audio: ${error}`);
    process.exit(1);
  }
}

main();