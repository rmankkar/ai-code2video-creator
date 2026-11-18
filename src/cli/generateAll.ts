#!/usr/bin/env tsx
/**
 * CLI: Generate Script, Audio, and Metadata in one command
 * Usage: npm run generate:all "your topic here" [options]
 */

import { resolve } from 'path';
import { generateScriptWithRetry } from '../services/scriptGenerator.js';
import { VideoScript } from '../types/script.js';
import { generateAudioForScript, generateCaptions, checkDependencies, getAvailableVoices } from '../services/ttsGenerator.js';
import { validateScript } from '../types/script.js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { generateMetadataFromScript, saveMetadata } from '../services/metadataGenerator.js';

interface GenerateAllOptions {
  topic: string;
  customPrompt?: string;
  voice?: string;
  rate?: number;
  outputDir?: string;
  audience?: 'general' | 'gamers' | 'tech' | 'casual';
  duration?: number;
  metadataCustomPrompt?: string;
  scriptOutputPath?: string;
  listVoices?: boolean;
  help?: boolean;
}

function printHelp() {
  const platform = process.platform;
  const platformNames: Record<string, string> = {
    darwin: 'macOS (say)',
    win32: 'Windows (SAPI)',
    linux: 'Linux (espeak)',
  };
  const ttsEngine = platformNames[platform] || platform;

  console.log(`
Usage: npm run generate:all "topic" [options]

Arguments:
  topic                   The topic for the video script (required)

Options:
  --prompt, -p            Custom prompt addition for script generation
  --voice, -v             Voice name (default: platform-specific)
  --rate, -r              Speech rate in words/min (default: 165)
  --output-dir, -o        Audio output directory (default: public/audio)
  --audience, -a          Target audience: general|gamers|tech|casual (default: gamers)
  --duration, -d          Video duration in seconds (default: 60)
  --metadata-prompt, -m   Custom instructions for metadata generation
  --script-output, -s     Script output file path (default: src/generated/script.json)
  --list-voices           List available voices for current platform
  --help, -h              Show this help

Examples:
  npm run generate:all "AI test automation"
  npm run generate:all "Quality engineering" --prompt "Focus on enterprise" --audience tech
  npm run generate:all "Game dev tips" --voice "Microsoft Zira Desktop" --rate 180
  npm run generate:all --list-voices

Prerequisites:
  - ffmpeg (install from https://ffmpeg.org/download.html)
  - ${ttsEngine} (built-in on all supported platforms)

Environment variables:
  NVIDIA_NIM_API_KEY      Required for script generation
  NVIDIA_NIM_MODEL        Model to use (default: meta/llama-3.1-70b-instruct)
  TTS_VOICE               Default voice name
  TTS_RATE                Default speech rate (words per minute)
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

  // Parse arguments
  const topic = args[0];
  if (!topic || topic.startsWith('--')) {
    console.error('\n❌ Topic is required');
    printHelp();
  }

  const customPrompt = args.includes('--prompt') || args.includes('-p')
    ? args[args.indexOf('--prompt') !== -1 ? args.indexOf('--prompt') + 1 : args.indexOf('-p') + 1]
    : undefined;

  const voice = args.includes('--voice') || args.includes('-v')
    ? args[args.indexOf('--voice') !== -1 ? args.indexOf('--voice') + 1 : args.indexOf('-v') + 1]
    : undefined;

  const rate = args.includes('--rate') || args.includes('-r')
    ? parseInt(args[args.indexOf('--rate') !== -1 ? args.indexOf('--rate') + 1 : args.indexOf('-r') + 1], 10)
    : undefined;

  const outputDir = args.includes('--output-dir') || args.includes('-o')
    ? args[args.indexOf('--output-dir') !== -1 ? args.indexOf('--output-dir') + 1 : args.indexOf('-o') + 1]
    : undefined;

  const audience = args.includes('--audience') || args.includes('-a')
    ? args[args.indexOf('--audience') !== -1 ? args.indexOf('--audience') + 1 : args.indexOf('-a') + 1]
    : 'gamers';

  const duration = args.includes('--duration') || args.includes('-d')
    ? parseInt(args[args.indexOf('--duration') !== -1 ? args.indexOf('--duration') + 1 : args.indexOf('-d') + 1], 10)
    : 60;

  const metadataCustomPrompt = args.includes('--metadata-prompt') || args.includes('-m')
    ? args[args.indexOf('--metadata-prompt') !== -1 ? args.indexOf('--metadata-prompt') + 1 : args.indexOf('-m') + 1]
    : undefined;

  const scriptOutputPath = args.includes('--script-output') || args.includes('-s')
    ? args[args.indexOf('--script-output') !== -1 ? args.indexOf('--script-output') + 1 : args.indexOf('-s') + 1]
    : resolve('src/generated/script.json');

  // Check dependencies for audio generation
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

  try {
    // ============================================
    // STEP 1: Generate Script
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('📝 STEP 1: Generating Script');
    console.log('='.repeat(60));

    // Ensure output directory exists
    mkdirSync(resolve(scriptOutputPath).split('/').slice(0, -1).join('/') || '.', { recursive: true });

    const scriptResult = await generateScriptWithRetry({ topic, customPrompt });

    const scriptWithMeta: VideoScript = {
      ...scriptResult.script,
      metadata: {
        ...scriptResult.script.metadata,
        generatedAt: new Date().toISOString(),
        model: process.env.NVIDIA_NIM_MODEL || 'unknown',
        prompt: customPrompt || topic,
        version: '1.0.0',
      },
    };

    writeFileSync(scriptOutputPath, JSON.stringify(scriptWithMeta, null, 2));

    // Also generate a .ts module for browser-safe import
    const tsPath = scriptOutputPath.replace('.json', '.ts');
    const tsContent = `// Auto-generated — do not edit manually
import type { VideoScript } from '../types/script';

const script: VideoScript = ${JSON.stringify(scriptWithMeta, null, 2)};

export default script;
`;
    writeFileSync(tsPath, tsContent);

    // Generate composition config JSON for Root.tsx (browser-safe static import)
    const configPath = resolve('src/generated/composition-config.json');
    const config = {
      scriptPath: "./generated/script",
      script: scriptWithMeta,
      video: {
        durationInFrames: scriptWithMeta.durationFrames,
        fps: scriptWithMeta.fps,
        width: scriptWithMeta.width,
        height: scriptWithMeta.height,
      },
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`📝 Composition config saved to: ${configPath}`);

    console.log(`\n✅ Script generated!`);
    console.log(`   Title: ${scriptWithMeta.title}`);
    console.log(`   Scenes: ${scriptWithMeta.scenes.length}`);
    console.log(`   Duration: ${scriptWithMeta.durationFrames / scriptWithMeta.fps}s`);
    console.log(`   Saved to: ${scriptOutputPath}`);
    console.log(`   Module saved to: ${tsPath}`);

    // ============================================
    // STEP 2: Generate Audio
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('🎙️  STEP 2: Generating Audio');
    console.log('='.repeat(60));

    const ttsOptions = {
      outputDir: outputDir || resolve('public/audio'),
      scriptTitle: scriptWithMeta.title,
      voice,
      rate,
    };

    const manifest = await generateAudioForScript(scriptWithMeta.scenes, ttsOptions);

    // Generate captions
    generateCaptions(manifest);

    // Update composition config with audio manifest
    let fullConfig: Record<string, unknown> = {};
    try {
      const existing = readFileSync(configPath, 'utf-8');
      fullConfig = JSON.parse(existing);
    } catch {
      // Config doesn't exist yet
    }
    fullConfig.audioManifest = manifest;
    writeFileSync(configPath, JSON.stringify(fullConfig, null, 2));
    console.log(`📝 Composition config updated: ${configPath}`);

    console.log(`\n✅ Audio generation complete!`);
    console.log(`   Segments: ${manifest.segments.length}`);
    console.log(`   Total: ${(manifest.totalDurationMs / 1000).toFixed(1)}s`);

    // ============================================
    // STEP 3: Generate Metadata
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('📺 STEP 3: Generating YouTube Metadata');
    console.log('='.repeat(60));

    console.log(`\n🤖 Generating YouTube metadata for: ${scriptWithMeta.title}`);
    console.log(`   Audience: ${audience} | Duration: ${duration}s`);

    const metadataResult = await generateMetadataFromScript(scriptOutputPath, {
      topic: topic,
      audience: audience as 'general' | 'gamers' | 'tech' | 'casual',
      durationSeconds: duration,
      customPrompt: metadataCustomPrompt,
    });

    const { metadata } = metadataResult;

    // Print to console
    console.log('\n' + '='.repeat(60));
    console.log('📺 YOUTUBE SHORTS METADATA');
    console.log('='.repeat(60));

    console.log(`\n📝 TITLE (${metadata.title.length}/100 chars):`);
    console.log(`   ${metadata.title}`);

    console.log(`\n📄 DESCRIPTION:`);
    metadata.description.split('\n').forEach(line => console.log(`   ${line}`));

    console.log(`\n🏷️  TAGS:`);
    console.log(`   ${metadata.tags}`);

    console.log(`\n💬 FIRST COMMENT (pinned):`);
    metadata.firstComment.split('\n').forEach(line => console.log(`   ${line}`));

    console.log('\n' + '='.repeat(60));

    // Save files
    const outputDirMetadata = resolve('src/generated');
    const { jsonPath, txtPath } = saveMetadata(metadata, outputDirMetadata);
    console.log(`\n✅ Metadata saved:`);
    console.log(`   📄 JSON: ${jsonPath}`);
    console.log(`   📝 Text: ${txtPath}`);

    // ============================================
    // SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('🎉 ALL STEPS COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log(`
📁 Generated Files:
   Script:        ${scriptOutputPath}
   Script Module: ${tsPath}
   Config:        ${configPath}
   Audio:         ${manifest.segments.map(s => s.path).join(', ')}
   Full Audio:    ${manifest.fullAudioPath}
   Captions:      ${resolve('src/generated/captions.vtt')}
   Metadata JSON: ${jsonPath}
   Metadata Text: ${txtPath}

🚀 Ready to render! Run: npm run build
`);

  } catch (error) {
    console.error(`\n❌ Failed: ${error}`);
    process.exit(1);
  }
}

main();