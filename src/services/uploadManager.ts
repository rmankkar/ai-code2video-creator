/**
 * Upload Manager
 * Orchestrates uploads of script, audio, and video files to Google Drive
 */

import { resolve } from 'path';
import { statSync, readdirSync } from 'fs';
import { GoogleDriveService, createGoogleDriveServiceFromEnv } from './googleDrive.js';
import { TopicFolderOptions, UploadBatchResult, FolderResult } from '../types/googleDrive.js';

export interface ScriptUploadOptions {
  /** Topic name for folder */
  topic: string;
  /** Script output directory */
  scriptDir?: string;
  /** Parent folder ID (optional, uses config if not provided) */
  parentFolderId?: string;
  /** Include timestamp in folder name */
  includeTimestamp?: boolean;
}

export interface AudioUploadOptions {
  /** Topic name for folder (must match script folder) */
  topic: string;
  /** Audio output directory */
  audioDir?: string;
  /** Generated directory (for manifest, captions) */
  generatedDir?: string;
  /** Parent folder ID */
  parentFolderId?: string;
  /** Include timestamp in folder name */
  includeTimestamp?: boolean;
}

export interface VideoUploadOptions {
  /** Topic name for folder (must match script folder) */
  topic: string;
  /** Video file path */
  videoPath: string;
  /** Parent folder ID */
  parentFolderId?: string;
  /** Include timestamp in folder name */
  includeTimestamp?: boolean;
}

export interface UploadAllOptions {
  /** Topic name for folder */
  topic: string;
  /** Script output directory */
  scriptDir?: string;
  /** Audio output directory */
  audioDir?: string;
  /** Generated directory */
  generatedDir?: string;
  /** Video file path */
  videoPath?: string;
  /** Parent folder ID */
  parentFolderId?: string;
  /** Include timestamp in folder name */
  includeTimestamp?: boolean;
}

export interface UploadResult {
  /** Topic folder info */
  folder: FolderResult;
  /** Script upload results */
  script?: UploadBatchResult;
  /** Audio upload results */
  audio?: UploadBatchResult;
  /** Video upload result */
  video?: UploadBatchResult;
}

/**
 * Get script files to upload
 */
function getScriptFiles(scriptDir: string): string[] {
  const files = [
    resolve(scriptDir, 'script.json'),
    resolve(scriptDir, 'script.ts'),
    resolve(scriptDir, 'composition-config.json'),
  ];
  return files;
}

/**
 * Get audio files to upload
 */
function getAudioFiles(audioDir: string, generatedDir: string): string[] {
  const files = [
    // Audio manifest
    resolve(generatedDir, 'audio-manifest.json'),
    // Captions
    resolve(generatedDir, 'captions.vtt'),
  ];

  // Note: Actual audio segment files are not easily enumerated without reading manifest
  // For now, we'll upload the manifest and captions, and the user can add segments manually
  return files;
}

export class UploadManager {
  private drive: GoogleDriveService;

  constructor(drive?: GoogleDriveService) {
    this.drive = drive || createGoogleDriveServiceFromEnv();
  }

  /**
   * Create or find topic folder
   */
  async getOrCreateTopicFolder(options: TopicFolderOptions): Promise<FolderResult> {
    const { topic, includeTimestamp = true, parentFolderId } = options;

    // If timestamp is included, always create new folder
    if (includeTimestamp) {
      return this.drive.createTopicFolder(options);
    }

    // If no timestamp, try to find existing folder
    const existingId = await this.drive.findFolder(topic, parentFolderId);
    if (existingId) {
      const folder = await this.drive['drive'].files.get({
        fileId: existingId,
        fields: 'id, name, webViewLink',
      });
      return {
        folderId: folder.data.id!,
        folderName: folder.data.name!,
        webViewLink: folder.data.webViewLink!,
      };
    }

    // Create new folder without timestamp
    return this.drive.createFolder(topic, parentFolderId);
  }

  /**
   * Upload script files
   */
  async uploadScript(options: ScriptUploadOptions): Promise<{ folder: FolderResult; result: UploadBatchResult }> {
    const { topic, scriptDir = resolve('src/generated'), parentFolderId, includeTimestamp = true } = options;

    console.log(`\n📁 Creating topic folder for script: ${topic}`);
    const folder = await this.getOrCreateTopicFolder({ topic, includeTimestamp, parentFolderId });
    console.log(`   Folder: ${folder.folderName} (${folder.webViewLink})`);

    const scriptFiles = getScriptFiles(scriptDir).filter(f => {
      try {
        statSync(f);
        return true;
      } catch {
        return false;
      }
    });

    if (scriptFiles.length === 0) {
      console.log('   ⚠️  No script files found to upload');
      return { folder, result: { successful: [], failed: [], total: 0, successCount: 0, failureCount: 0 } };
    }

    console.log(`\n📤 Uploading ${scriptFiles.length} script files...`);
    const result = await this.drive.uploadFiles(scriptFiles, folder.folderId);

    return { folder, result };
  }

  /**
   * Upload audio files
   */
  async uploadAudio(options: AudioUploadOptions): Promise<{ folder: FolderResult; result: UploadBatchResult }> {
    const { topic, audioDir = resolve('public/audio'), generatedDir = resolve('src/generated'), parentFolderId, includeTimestamp = true } = options;

    console.log(`\n📁 Finding topic folder for audio: ${topic}`);
    // Try to find existing folder (without timestamp if includeTimestamp is false)
    let folder: FolderResult;

    if (includeTimestamp) {
      // With timestamp, we need to find the folder created during script upload
      // For now, create a new one - in practice you'd want to match by topic
      folder = await this.drive.createTopicFolder({ topic, includeTimestamp, parentFolderId });
    } else {
      const existingId = await this.drive.findFolder(topic, parentFolderId);
      if (existingId) {
        const f = await this.drive['drive'].files.get({
          fileId: existingId,
          fields: 'id, name, webViewLink',
        });
        folder = {
          folderId: f.data.id!,
          folderName: f.data.name!,
          webViewLink: f.data.webViewLink!,
        };
      } else {
        folder = await this.drive.createFolder(topic, parentFolderId);
      }
    }
    console.log(`   Folder: ${folder.folderName} (${folder.webViewLink})`);

    const audioFiles = getAudioFiles(audioDir, generatedDir).filter(f => {
      try {
        statSync(f);
        return true;
      } catch {
        return false;
      }
    });

    // Also try to find audio segment files
    const segmentFiles = this.findAudioSegments(audioDir);
    const allFiles = [...audioFiles, ...segmentFiles];

    if (allFiles.length === 0) {
      console.log('   ⚠️  No audio files found to upload');
      return { folder, result: { successful: [], failed: [], total: 0, successCount: 0, failureCount: 0 } };
    }

    console.log(`\n📤 Uploading ${allFiles.length} audio files...`);
    const result = await this.drive.uploadFiles(allFiles, folder.folderId);

    return { folder, result };
  }

  /**
   * Find audio segment files in audio directory
   */
  private findAudioSegments(audioDir: string): string[] {
    try {
      const files = readdirSync(audioDir);
      return files
        .filter((f: string) => f.endsWith('.wav') || f.endsWith('.mp3'))
        .map((f: string) => resolve(audioDir, f));
    } catch {
      return [];
    }
  }

  /**
   * Upload video file
   */
  async uploadVideo(options: VideoUploadOptions): Promise<{ folder: FolderResult; result: UploadBatchResult }> {
    const { topic, videoPath, parentFolderId, includeTimestamp = true } = options;

    console.log(`\n📁 Finding topic folder for video: ${topic}`);
    let folder: FolderResult;

    if (includeTimestamp) {
      folder = await this.drive.createTopicFolder({ topic, includeTimestamp, parentFolderId });
    } else {
      const existingId = await this.drive.findFolder(topic, parentFolderId);
      if (existingId) {
        const f = await this.drive['drive'].files.get({
          fileId: existingId,
          fields: 'id, name, webViewLink',
        });
        folder = {
          folderId: f.data.id!,
          folderName: f.data.name!,
          webViewLink: f.data.webViewLink!,
        };
      } else {
        folder = await this.drive.createFolder(topic, parentFolderId);
      }
    }
    console.log(`   Folder: ${folder.folderName} (${folder.webViewLink})`);

    // Check if video file exists
    try {
      statSync(videoPath);
    } catch {
      console.log(`   ⚠️  Video file not found: ${videoPath}`);
      return { folder, result: { successful: [], failed: [{ filePath: videoPath, error: 'File not found' }], total: 1, successCount: 0, failureCount: 1 } };
    }

    console.log(`\n📤 Uploading video: ${videoPath}`);
    const result = await this.drive.uploadFiles([videoPath], folder.folderId, {
      resumable: true,
      onProgress: (bytesSent, totalBytes) => {
        const percent = ((bytesSent / totalBytes) * 100).toFixed(1);
        process.stdout.write(`\r   Progress: ${percent}% (${(bytesSent / 1024 / 1024).toFixed(1)}MB / ${(totalBytes / 1024 / 1024).toFixed(1)}MB)`);
      },
    });

    console.log(''); // New line after progress
    return { folder, result };
  }

  /**
   * Upload all (script, audio, video) - uses same folder for all
   */
  async uploadAll(options: UploadAllOptions): Promise<UploadResult> {
    const { topic, scriptDir, audioDir, generatedDir, videoPath, parentFolderId, includeTimestamp = true } = options;

    console.log(`\n🚀 Starting full upload for topic: ${topic}`);
    console.log('='.repeat(50));

    // Create topic folder once
    const folder = await this.getOrCreateTopicFolder({ topic, includeTimestamp, parentFolderId });
    console.log(`\n📁 Topic folder: ${folder.folderName} (${folder.webViewLink})`);

    const result: UploadResult = { folder };

    // Upload script files
    if (scriptDir !== 'skip') {
      const scriptFiles = getScriptFiles(scriptDir || resolve('src/generated')).filter(f => {
        try { statSync(f); return true; } catch { return false; }
      });
      if (scriptFiles.length > 0) {
        console.log(`\n📤 Uploading ${scriptFiles.length} script files...`);
        result.script = await this.drive.uploadFiles(scriptFiles, folder.folderId);
      }
    }

    // Upload audio files
    if (audioDir !== 'skip') {
      const audioFiles = getAudioFiles(audioDir || resolve('public/audio'), generatedDir || resolve('src/generated')).filter(f => {
        try { statSync(f); return true; } catch { return false; }
      });
      const segmentFiles = this.findAudioSegments(audioDir || resolve('public/audio'));
      const allAudioFiles = [...audioFiles, ...segmentFiles];

      if (allAudioFiles.length > 0) {
        console.log(`\n📤 Uploading ${allAudioFiles.length} audio files...`);
        result.audio = await this.drive.uploadFiles(allAudioFiles, folder.folderId);
      }
    }

    // Upload video
    if (videoPath) {
      try {
        statSync(videoPath);
        console.log(`\n📤 Uploading video...`);
        result.video = await this.drive.uploadFiles([videoPath], folder.folderId, {
          resumable: true,
          onProgress: (bytesSent, totalBytes) => {
            const percent = ((bytesSent / totalBytes) * 100).toFixed(1);
            process.stdout.write(`\r   Progress: ${percent}% (${(bytesSent / 1024 / 1024).toFixed(1)}MB / ${(totalBytes / 1024 / 1024).toFixed(1)}MB)`);
          },
        });
        console.log('');
      } catch {
        console.log(`\n⚠️  Video file not found: ${videoPath}`);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Upload complete!');
    console.log(`   Folder: ${folder.webViewLink}`);
    if (result.script) console.log(`   Script: ${result.script.successCount}/${result.script.total} files`);
    if (result.audio) console.log(`   Audio: ${result.audio.successCount}/${result.audio.total} files`);
    if (result.video) console.log(`   Video: ${result.video.successCount}/${result.video.total} files`);

    return result;
  }

  /**
   * Test Google Drive connection
   */
  async testConnection(): Promise<boolean> {
    console.log('\n🔍 Testing Google Drive connection...');
    const connected = await this.drive.testConnection();
    if (connected) {
      console.log('✅ Connected to Google Drive successfully');
    } else {
      console.log('❌ Failed to connect to Google Drive');
    }
    return connected;
  }
}

/**
 * Create upload manager from environment
 */
export function createUploadManager(): UploadManager {
  return new UploadManager();
}