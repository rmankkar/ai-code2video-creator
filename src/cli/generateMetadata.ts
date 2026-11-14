#!/usr/bin/env tsx
/**
 * CLI: Generate YouTube Shorts Metadata
 * Usage: npm run generate:metadata [script.json] [options]
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { generateMetadataFromScript, saveMetadata } from '../services/metadataGenerator.js';
import { validateScript } from '../types/script.js';

function printHelp() {
  console.log(`
Usage: npm run generate:metadata [script.json] [options]

Arguments:
  script.json             Path to script JSON (default: src/generated/script.json)

Options:
  --topic, -t             Override topic (default: from script metadata)
  --audience, -a          Target audience: general|gamers|tech|casual (default: gamers)
  --duration, -d          Video duration in seconds (default: 60)
  --custom-prompt, -p     Custom instructions for metadata generation
  --output-dir, -o        Output directory (default: src/generated)
  --no-save               Only print to console, don't save files
  --help, -h              Show this help

Examples:
  npm run generate:metadata
  npm run generate:metadata src/generated/script.json --audience tech
  npm run generate:metadata --topic "AI in Gaming" --custom-prompt "Focus on controversy"
  npm run generate:metadata --no-save

Output Files:
  - src/generated/youtube-metadata.json (structured)
  - src/generated/youtube-metadata.txt (human-readable)
`);
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
  }

  // Parse arguments
  const scriptPath = args[0] && !args[0].startsWith('--')
    ? args[0]
    : resolve('src/generated/script.json');

  const topic = args.includes('--topic') || args.includes('-t')
    ? args[args.indexOf('--topic') !== -1 ? args.indexOf('--topic') + 1 : args.indexOf('-t') + 1]
    : undefined;

  const audience = args.includes('--audience') || args.includes('-a')
    ? args[args.indexOf('--audience') !== -1 ? args.indexOf('--audience') + 1 : args.indexOf('-a') + 1]
    : 'gamers';

  const duration = args.includes('--duration') || args.includes('-d')
    ? parseInt(args[args.indexOf('--duration') !== -1 ? args.indexOf('--duration') + 1 : args.indexOf('-d') + 1], 10)
    : 60;

  const customPrompt = args.includes('--custom-prompt') || args.includes('-p')
    ? args[args.indexOf('--custom-prompt') !== -1 ? args.indexOf('--custom-prompt') + 1 : args.indexOf('-p') + 1]
    : undefined;

  const outputDir = args.includes('--output-dir') || args.includes('-o')
    ? args[args.indexOf('--output-dir') !== -1 ? args.indexOf('--output-dir') + 1 : args.indexOf('-o') + 1]
    : resolve('src/generated');

  const noSave = args.includes('--no-save');

  try {
    console.log(`\n📖 Loading script: ${scriptPath}`);
    const scriptContent = readFileSync(scriptPath, 'utf-8');
    const script = validateScript(JSON.parse(scriptContent));

    console.log(`\n🤖 Generating YouTube metadata for: ${script.title}`);
    console.log(`   Audience: ${audience} | Duration: ${duration}s`);

    const result = await generateMetadataFromScript(scriptPath, {
      topic,
      audience: audience as 'general' | 'gamers' | 'tech' | 'casual',
      durationSeconds: duration,
      customPrompt,
    });

    const { metadata } = result;

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
    if (!noSave) {
      const { jsonPath, txtPath } = saveMetadata(metadata, outputDir);
      console.log(`\n✅ Metadata saved:`);
      console.log(`   📄 JSON: ${jsonPath}`);
      console.log(`   📝 Text: ${txtPath}`);
    } else {
      console.log('\n⚠️  --no-save flag used, files not written');
    }

    console.log('\n✨ Done!');

  } catch (error) {
    console.error(`\n❌ Failed to generate metadata: ${error}`);
    process.exit(1);
  }
}

main();