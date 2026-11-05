#!/usr/bin/env tsx
/**
 * CLI: Upload Generated Content to Google Drive
 * Usage: npm run upload:drive [options]
 */

import { resolve } from 'path';
import { createUploadManager } from '../services/uploadManager.js';

interface CliOptions {
  topic?: string;
  script?: boolean;
  audio?: boolean;
  video?: string;
  all?: boolean;
  parentFolderId?: string;
  parentFolderName?: string;
  noTimestamp?: boolean;
  scriptDir?: string;
  audioDir?: string;
  generatedDir?: string;
  test?: boolean;
  help?: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  // Help
  if (args.includes('--help') || args.includes('-h')) {
    options.help = true;
    return options;
  }

  // Topic (required unless --test)
  const topicIndex = args.findIndex(a => !a.startsWith('--') && !a.startsWith('-'));
  if (topicIndex !== -1) {
    options.topic = args[topicIndex];
  }

  // Flags
  options.script = args.includes('--script');
  options.audio = args.includes('--audio');
  options.all = args.includes('--all');
  options.test = args.includes('--test');
  options.noTimestamp = args.includes('--no-timestamp');

  // Video path
  const videoIdx = args.indexOf('--video');
  if (videoIdx !== -1 && args[videoIdx + 1]) {
    options.video = args[videoIdx + 1];
  }

  // Parent folder
  const parentIdx = args.indexOf('--parent-folder');
  if (parentIdx !== -1 && args[parentIdx + 1]) {
    options.parentFolderId = args[parentIdx + 1];
  }

  const parentNameIdx = args.indexOf('--parent-folder-name');
  if (parentNameIdx !== -1 && args[parentNameIdx + 1]) {
    options.parentFolderName = args[parentNameIdx + 1];
  }

  // Custom directories
  const scriptDirIdx = args.indexOf('--script-dir');
  if (scriptDirIdx !== -1 && args[scriptDirIdx + 1]) {
    options.scriptDir = args[scriptDirIdx + 1];
  }

  const audioDirIdx = args.indexOf('--audio-dir');
  if (audioDirIdx !== -1 && args[audioDirIdx + 1]) {
    options.audioDir = args[audioDirIdx + 1];
  }

  const genDirIdx = args.indexOf('--generated-dir');
  if (genDirIdx !== -1 && args[genDirIdx + 1]) {
    options.generatedDir = args[genDirIdx + 1];
  }

  return options;
}

function printHelp() {
  console.log(`
Usage: npm run upload:drive [topic] [options]

Arguments:
  topic                   Topic name for the folder (required unless --test)

Options:
  --script                Upload script files only (script.json, script.ts, composition-config.json)
  --audio                 Upload audio files only (manifest, captions, segments)
  --video <path>          Upload video file only (provide path to video file)
  --all                   Upload everything (script + audio + video)
  --parent-folder <id>    Parent folder ID to create topic folder under
  --parent-folder-name <name>  Parent folder name (will be resolved to ID)
  --no-timestamp          Don't include timestamp in folder name
  --script-dir <path>     Custom script directory (default: src/generated)
  --audio-dir <path>      Custom audio directory (default: public/audio)
  --generated-dir <path>  Custom generated directory (default: src/generated)
  --test                  Test Google Drive connection only
  --help, -h              Show this help

Examples:
  # Test connection
  npm run upload:drive -- --test

  # Upload all for a topic
  npm run upload:drive "AI Test Automation" --all --video out/video.mp4

  # Upload script only
  npm run upload:drive "My Topic" --script

  # Upload audio only
  npm run upload:drive "My Topic" --audio

  # Upload video only
  npm run upload:drive "My Topic" --video out/video.mp4

  # Upload all without timestamp in folder name
  npm run upload:drive "My Topic" --all --video out/video.mp4 --no-timestamp

  # With custom parent folder
  npm run upload:drive "My Topic" --all --video out/video.mp4 --parent-folder 1abc2def...

Environment Variables Required (in .env):
  GOOGLE_DRIVE_AUTH_TYPE=oauth2
  GOOGLE_DRIVE_CLIENT_ID=your_client_id
  GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret
  GOOGLE_DRIVE_REFRESH_TOKEN=your_refresh_token
  GOOGLE_DRIVE_PARENT_FOLDER_ID=your_parent_folder_id (optional)

OAuth2 Setup:
  1. Create OAuth 2.0 credentials in Google Cloud Console
  2. Run: node -e "const {generateOAuth2AuthUrl} = require('./src/services/googleDrive'); console.log(generateOAuth2AuthUrl({clientId: 'YOUR_CLIENT_ID'}))"
  3. Visit the URL, authorize, copy the 'code' parameter from redirect
  4. Run: node -e "const {getRefreshTokenFromCode} = require('./src/services/googleDrive'); getRefreshTokenFromCode('CLIENT_ID', 'CLIENT_SECRET', 'AUTH_CODE').then(console.log)"
  5. Add refresh token to .env as GOOGLE_DRIVE_REFRESH_TOKEN
`);
  process.exit(0);
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    printHelp();
  }

  // Test connection only
  if (options.test) {
    const manager = createUploadManager();
    const connected = await manager.testConnection();
    process.exit(connected ? 0 : 1);
  }

  // Topic is required for uploads
  if (!options.topic) {
    console.error('❌ Topic is required. Use --help for usage.');
    process.exit(1);
  }

  // At least one upload type must be specified
  if (!options.script && !options.audio && !options.video && !options.all) {
    console.error('❌ At least one of --script, --audio, --video, or --all must be specified.');
    process.exit(1);
  }

  try {
    const manager = createUploadManager();
    const parentFolderId = options.parentFolderId;
    const includeTimestamp = !options.noTimestamp;

    if (options.all) {
      // Upload everything
      if (!options.video) {
        console.error('❌ --all requires --video <path> to be specified.');
        process.exit(1);
      }

      await manager.uploadAll({
        topic: options.topic,
        scriptDir: options.scriptDir ? resolve(options.scriptDir) : undefined,
        audioDir: options.audioDir ? resolve(options.audioDir) : undefined,
        generatedDir: options.generatedDir ? resolve(options.generatedDir) : undefined,
        videoPath: resolve(options.video),
        parentFolderId,
        includeTimestamp,
      });
    } else {
      // Individual uploads
      if (options.script) {
        await manager.uploadScript({
          topic: options.topic,
          scriptDir: options.scriptDir ? resolve(options.scriptDir) : undefined,
          parentFolderId,
          includeTimestamp,
        });
      }

      if (options.audio) {
        await manager.uploadAudio({
          topic: options.topic,
          audioDir: options.audioDir ? resolve(options.audioDir) : undefined,
          generatedDir: options.generatedDir ? resolve(options.generatedDir) : undefined,
          parentFolderId,
          includeTimestamp,
        });
      }

      if (options.video) {
        await manager.uploadVideo({
          topic: options.topic,
          videoPath: resolve(options.video),
          parentFolderId,
          includeTimestamp,
        });
      }
    }

    console.log('\n✨ Done!');
    process.exit(0);

  } catch (error) {
    console.error(`\n❌ Upload failed: ${error}`);
    process.exit(1);
  }
}

main();