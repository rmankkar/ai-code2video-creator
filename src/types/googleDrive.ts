/**
 * Google Drive Types
 * Type definitions for Google Drive integration
 */

export interface GoogleDriveConfig {
  /** Authentication type */
  authType: 'oauth2' | 'service_account';

  // OAuth2 Configuration
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  redirectUri?: string;

  // Service Account Configuration
  serviceAccountKeyPath?: string;
  serviceAccountEmail?: string;

  // Drive Configuration
  parentFolderId?: string;  // Parent folder ID to create topic folders under
  parentFolderName?: string; // Alternative: parent folder name
}

export interface UploadFileOptions {
  /** Local file path */
  filePath: string;
  /** Destination file name (defaults to basename of filePath) */
  fileName?: string;
  /** MIME type (auto-detected if not provided) */
  mimeType?: string;
  /** Folder ID to upload to */
  folderId: string;
  /** Whether to use resumable upload (for large files) */
  resumable?: boolean;
  /** Progress callback */
  onProgress?: (bytesSent: number, totalBytes: number) => void;
}

export interface UploadResult {
  /** Google Drive file ID */
  fileId: string;
  /** File name */
  fileName: string;
  /** Web view link */
  webViewLink: string;
  /** Web content link (direct download) */
  webContentLink: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** Created time */
  createdTime: string;
}

export interface FolderResult {
  /** Google Drive folder ID */
  folderId: string;
  /** Folder name */
  folderName: string;
  /** Web view link */
  webViewLink: string;
}

export interface UploadBatchResult {
  /** Successful uploads */
  successful: UploadResult[];
  /** Failed uploads */
  failed: Array<{ filePath: string; error: string }>;
  /** Total files */
  total: number;
  /** Success count */
  successCount: number;
  /** Failure count */
  failureCount: number;
}

export interface TopicFolderOptions {
  /** Topic name for the folder */
  topic: string;
  /** Optional timestamp suffix */
  includeTimestamp?: boolean;
  /** Parent folder ID (uses config parentFolderId if not provided) */
  parentFolderId?: string;
}

export interface GoogleDriveError extends Error {
  code?: string;
  status?: number;
  errors?: Array<{ message: string; domain: string; reason: string }>;
}

// MIME type mappings for common file types
export const MIME_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.ts': 'application/typescript',
  '.js': 'application/javascript',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.vtt': 'text/vtt',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
};