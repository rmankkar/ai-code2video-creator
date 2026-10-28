#!/usr/bin/env tsx
/**
 * CLI: Generate Audio Narration from Script
 * Uses macOS `say` + ffmpeg (free, offline)
 * Usage: npm run generate:audio [script.json]
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { generateAudioForScript, generateCaptions, checkDependencies } from '../services/ttsGenerator.js';
import { validateScript } from '../types/script.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npm run generate:audio [script.json] [options]

Arguments:
  script.json             Path to script JSON (default: src/generated/script.json)

Options:
  --voice, -v             macOS voice name (default: Samantha)
  --rate, -r              Speech rate in words/min (default: 200)
  --output-dir, -o        Audio output directory (default: public/audio)
  --help, -h              Show this help

Examples:
  npm run generate:audio
  npm run generate:audio src/generated/script.json --voice Alex --rate 180

Prerequisites:
  - macOS (for 'say' command)
  - ffmpeg (brew install ffmpeg)
`);
    process.exit(0);
  }

  // Check dependencies
  const deps = checkDependencies();
  if (!deps.ffmpeg || !deps.say || !deps.ffprobe) {
    console.error('\n❌ Missing required dependencies. Install with:');
    console.error('   brew install ffmpeg');
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