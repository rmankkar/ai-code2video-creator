/**
 * Google Drive Service
 * Handles authentication, file uploads, folder management for Google Drive
 */

import { google, drive_v3 } from 'googleapis';
import { readFileSync, statSync, createReadStream } from 'fs';
import { resolve, basename, extname } from 'path';
import {
  GoogleDriveConfig,
  UploadFileOptions,
  UploadResult,
  FolderResult,
  UploadBatchResult,
  TopicFolderOptions,
  GoogleDriveError,
  MIME_TYPES,
} from '../types/googleDrive.js';

export class GoogleDriveService {
  private drive: drive_v3.Drive;
  private config: GoogleDriveConfig;

  constructor(config: GoogleDriveConfig) {
    this.config = config;
    this.drive = google.drive({ version: 'v3', auth: this.createAuth() });
  }

  /**
   * Create authentication client based on config
   */
  private createAuth() {
    const { authType } = this.config;

    if (authType === 'service_account') {
      return this.createServiceAccountAuth();
    }

    return this.createOAuth2Auth();
  }

  /**
   * Create Service Account authentication
   */
  private createServiceAccountAuth() {
    const { serviceAccountKeyPath } = this.config;

    if (!serviceAccountKeyPath) {
      throw new Error('Service account key path is required for service_account auth type');
    }

    const keyPath = resolve(serviceAccountKeyPath);
    const keyFile = readFileSync(keyPath, 'utf-8');
    const credentials = JSON.parse(keyFile);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    return auth;
  }

  /**
   * Create OAuth2 authentication
   */
  private createOAuth2Auth() {
    const { clientId, clientSecret, refreshToken, redirectUri } = this.config;

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        'OAuth2 requires clientId, clientSecret, and refreshToken. ' +
        'Run the OAuth2 setup flow first to obtain a refresh token.'
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri || 'http://localhost:3000/oauth2callback'
    );

    oauth2Client.setCredentials({ refresh_token: refreshToken });

    return oauth2Client;
  }

  /**
   * Get MIME type for a file
   */
  private getMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
  }

  /**
   * Find folder by name under parent
   */
  async findFolder(folderName: string, parentFolderId?: string): Promise<string | null> {
    const parentId = parentFolderId || this.config.parentFolderId;
    if (!parentId) {
      throw new Error('Parent folder ID is required to find folder');
    }

    const query = [
      `name = '${folderName.replace(/'/g, "\\'")}'`,
      `mimeType = 'application/vnd.google-apps.folder'`,
      `'${parentId}' in parents`,
      'trashed = false',
    ].join(' and ');

    const response = await this.drive.files.list({
      q: query,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id!;
    }

    return null;
  }

  /**
   * Create a folder under parent
   */
  async createFolder(folderName: string, parentFolderId?: string): Promise<FolderResult> {
    const parentId = parentFolderId || this.config.parentFolderId;
    if (!parentId) {
      throw new Error('Parent folder ID is required to create folder');
    }

    const response = await this.drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id, name, webViewLink',
    });

    return {
      folderId: response.data.id!,
      folderName: response.data.name!,
      webViewLink: response.data.webViewLink!,
    };
  }

  /**
   * Find or create folder by name under parent
   */
  async findOrCreateFolder(folderName: string, parentFolderId?: string): Promise<FolderResult> {
    const existingId = await this.findFolder(folderName, parentFolderId);
    if (existingId) {
      const folder = await this.drive.files.get({
        fileId: existingId,
        fields: 'id, name, webViewLink',
      });
      return {
        folderId: folder.data.id!,
        folderName: folder.data.name!,
        webViewLink: folder.data.webViewLink!,
      };
    }

    return this.createFolder(folderName, parentFolderId);
  }

  /**
   * Create a topic-named folder under parent folder
   */
  async createTopicFolder(options: TopicFolderOptions): Promise<FolderResult> {
    const { topic, includeTimestamp = true, parentFolderId } = options;

    let folderName = topic
      .replace(/[<>:"/\\|?*]/g, '_')  // Replace invalid chars
      .trim();

    if (includeTimestamp) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      folderName = `${folderName}_${timestamp}`;
    }

    return this.findOrCreateFolder(folderName, parentFolderId);
  }

  /**
   * Upload a single file
   */
  async uploadFile(options: UploadFileOptions): Promise<UploadResult> {
    const {
      filePath,
      fileName = basename(filePath),
      mimeType = this.getMimeType(filePath),
      folderId,
      resumable = true,
      onProgress,
    } = options;

    const stats = statSync(filePath);
    const fileSize = stats.size;

    // Use resumable upload for files > 5MB or if explicitly requested
    const useResumable = resumable && fileSize > 5 * 1024 * 1024;

    const requestBody = {
      name: fileName,
      parents: [folderId],
    };

    const media = {
      mimeType,
      body: createReadStream(filePath),
    };

    let response;

    if (useResumable) {
      // Resumable upload with progress
      const res = await this.drive.files.create({
        requestBody,
        media,
        uploadType: 'resumable',
        fields: 'id, name, webViewLink, webContentLink, size, mimeType, createdTime',
      }, {
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.bytesRead !== undefined) {
            onProgress(progressEvent.bytesRead, fileSize);
          }
        },
      });
      response = res;
    } else {
      // Simple upload
      response = await this.drive.files.create({
        requestBody,
        media,
        fields: 'id, name, webViewLink, webContentLink, size, mimeType, createdTime',
      });
    }

    // Make file readable by anyone with link (optional - remove if not needed)
    await this.drive.permissions.create({
      fileId: response.data.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      fields: 'id',
    });

    return {
      fileId: response.data.id!,
      fileName: response.data.name!,
      webViewLink: response.data.webViewLink!,
      webContentLink: response.data.webContentLink!,
      size: parseInt(response.data.size || '0', 10),
      mimeType: response.data.mimeType!,
      createdTime: response.data.createdTime!,
    };
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(
    filePaths: string[],
    folderId: string,
    options: Partial<UploadFileOptions> = {}
  ): Promise<UploadBatchResult> {
    const results: UploadBatchResult = {
      successful: [],
      failed: [],
      total: filePaths.length,
      successCount: 0,
      failureCount: 0,
    };

    for (const filePath of filePaths) {
      try {
        const result = await this.uploadFile({
          filePath,
          folderId,
          ...options,
        });
        results.successful.push(result);
        results.successCount++;
        console.log(`  ✅ Uploaded: ${basename(filePath)} (${result.webViewLink})`);
      } catch (error) {
        const err = error as GoogleDriveError;
        results.failed.push({
          filePath,
          error: err.message || 'Unknown error',
        });
        results.failureCount++;
        console.error(`  ❌ Failed: ${basename(filePath)} - ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Get shareable link for a file
   */
  async getFileLink(fileId: string): Promise<string> {
    const response = await this.drive.files.get({
      fileId,
      fields: 'webViewLink',
    });
    return response.data.webViewLink!;
  }

  /**
   * List files in a folder
   */
  async listFiles(folderId: string): Promise<drive_v3.Schema$File[]> {
    const response = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size, createdTime, webViewLink)',
      orderBy: 'createdTime desc',
    });
    return response.data.files || [];
  }

  /**
   * Delete a file
   */
  async deleteFile(fileId: string): Promise<void> {
    await this.drive.files.delete({ fileId });
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.drive.about.get({ fields: 'user' });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create Google Drive service from environment variables
 */
export function createGoogleDriveServiceFromEnv(): GoogleDriveService {
  const config: GoogleDriveConfig = {
    authType: (process.env.GOOGLE_DRIVE_AUTH_TYPE as 'oauth2' | 'service_account') || 'oauth2',
    clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
    redirectUri: process.env.GOOGLE_DRIVE_REDIRECT_URI,
    serviceAccountKeyPath: process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY_PATH,
    serviceAccountEmail: process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL,
    parentFolderId: process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID,
    parentFolderName: process.env.GOOGLE_DRIVE_PARENT_FOLDER_NAME,
  };

  return new GoogleDriveService(config);
}

/**
 * Generate OAuth2 authorization URL for initial setup
 */
export function generateOAuth2AuthUrl(config: Pick<GoogleDriveConfig, 'clientId' | 'redirectUri'>): string {
  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    config.redirectUri || 'http://localhost:3000/oauth2callback'
  );

  const scopes = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
  });
}

/**
 * Exchange authorization code for refresh token
 */
export async function getRefreshTokenFromCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri?: string
): Promise<string> {
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri || 'http://localhost:3000/oauth2callback'
  );

  const { tokens } = await oauth2Client.getToken(code);
  return tokens.refresh_token || '';
}