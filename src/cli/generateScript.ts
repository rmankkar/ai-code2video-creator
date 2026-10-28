#!/usr/bin/env tsx
/**
 * CLI: Generate Script from NVIDIA NIM
 * Usage: npm run generate:script "your topic here"
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { generateScriptWithRetry } from '../services/scriptGenerator.js';
import { VideoScript } from '../types/script.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npm run generate:script "topic" [options]

Arguments:
  topic                 The topic for the video script (required)

Options:
  --prompt, -p          Custom prompt addition
  --output, -o          Output file path (default: src/generated/script.json)
  --help, -h            Show this help

Examples:
  npm run generate:script "AI test automation"
  npm run generate:script "Quality engineering" --prompt "Focus on enterprise"
`);
    process.exit(0);
  }

  const topic = args[0];
  const customPrompt = args.includes('--prompt') || args.includes('-p')
    ? args[args.indexOf('--prompt') !== -1 ? args.indexOf('--prompt') + 1 : args.indexOf('-p') + 1]
    : undefined;
  const outputPath = args.includes('--output') || args.includes('-o')
    ? args[args.indexOf('--output') !== -1 ? args.indexOf('--output') + 1 : args.indexOf('-o') + 1]
    : resolve('src/generated/script.json');

  try {
    // Ensure output directory exists
    mkdirSync(dirname(outputPath), { recursive: true });

    const result = await generateScriptWithRetry({ topic, customPrompt });

    // Add generation metadata
    const scriptWithMeta: VideoScript = {
      ...result.script,
      metadata: {
        ...result.script.metadata,
        generatedAt: new Date().toISOString(),
        model: process.env.NVIDIA_NIM_MODEL || 'unknown',
        prompt: customPrompt || topic,
        version: '1.0.0',
      },
    };

    writeFileSync(outputPath, JSON.stringify(scriptWithMeta, null, 2));

    // Also generate a .ts module for browser-safe import
    const tsPath = outputPath.replace('.json', '.ts');
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
      script: scriptWithMeta,  // Include full script for static bundling
      video: {
        durationInFrames: scriptWithMeta.durationFrames,
        fps: scriptWithMeta.fps,
        width: scriptWithMeta.width,
        height: scriptWithMeta.height,
      },
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`📝 Composition config saved to: ${configPath}`);

    console.log(`\n📝 Script saved to: ${outputPath}`);
    console.log(`📝 Module saved to: ${tsPath}`);
    console.log(`   Title: ${scriptWithMeta.title}`);
    console.log(`   Scenes: ${scriptWithMeta.scenes.length}`);
    console.log(`   Duration: ${scriptWithMeta.durationFrames / scriptWithMeta.fps}s`);

  } catch (error) {
    console.error(`\n❌ Failed to generate script: ${error}`);
    process.exit(1);
  }
}

main();