# Google Drive Upload Feature - Implementation Plan

## Overview

Add Google Drive upload capability to the ai-code2video-creator pipeline to automatically upload generated content (Script, Audio, Video) to a Google Drive folder after each generation step completes.

## Current Pipeline

| Step | Command | Output Files |
|------|---------|--------------|
| 1. Script Generation | `npm run generate:script "topic"` | `src/generated/script.json`, `src/generated/script.ts`, `src/generated/composition-config.json` |
| 2. Audio Generation | `npm run generate:audio` | `public/audio/*.wav`, `src/generated/audio-manifest.json`, `src/generated/captions.vtt` |
| 3. Video Rendering | `remotion render` (or `npm run build` + render) | `out/video.mp4` (or configured output path) |

## Implementation Approach

### Authentication Strategy
- **Service Account** (recommended for automation): Uses JSON key file, no user interaction needed
- **OAuth2** (alternative): Requires initial user consent, then uses refresh tokens

### Upload Strategy
- Create a dedicated folder in Google Drive (by folder ID or name)
- Upload files with descriptive names including timestamp/topic
- Support resumable uploads for large video files
- Track upload status and provide summary

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/services/googleDrive.ts` | Core Google Drive API service (auth, upload, folder management) |
| `src/services/uploadManager.ts` | Orchestrates uploads for script/audio/video |
| `src/cli/uploadToDrive.ts` | CLI command for manual uploads |
| `src/types/googleDrive.ts` | TypeScript types for Google Drive config and responses |

### Modified Files

| File | Change |
|------|--------|
| `package.json` | Add `googleapis` dependency, add upload scripts |
| `.env.example` | Add Google Drive configuration variables |
| `src/cli/generateScript.ts` | Optionally auto-upload after script generation |
| `src/cli/generateAudio.ts` | Optionally auto-upload after audio generation |
| `README.md` | Document new feature and setup |

## Environment Variables (`.env`)

```bash
# Google Drive Configuration
GOOGLE_DRIVE_ENABLED=true
GOOGLE_DRIVE_AUTH_TYPE=service_account  # or "oauth2"
GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY_PATH=./google-service-account.json
GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here  # Optional: specific folder ID
GOOGLE_DRIVE_FOLDER_NAME=ai-code2video-output  # Alternative: folder name to find/create

# OAuth2 (if using OAuth2 instead of service account)
GOOGLE_DRIVE_CLIENT_ID=your_client_id
GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret
GOOGLE_DRIVE_REFRESH_TOKEN=your_refresh_token
```

## Dependencies

```bash
npm install googleapis
npm install -D @types/googleapis  # if needed
```

## Implementation Steps

### Phase 1: Core Google Drive Service (3-4 hrs)

1. **Create `src/types/googleDrive.ts`**
   - Types for config, upload options, file metadata, upload results

2. **Create `src/services/googleDrive.ts`**
   - Initialize auth (Service Account or OAuth2)
   - `createFolderIfNotExists(folderName, parentId?)` - Find or create folder
   - `uploadFile(filePath, fileName, folderId, options?)` - Upload with resumable support
   - `uploadFiles(files[], folderId)` - Batch upload with progress
   - `getFileLink(fileId)` - Get shareable link

3. **Create `src/services/uploadManager.ts`**
   - `uploadScript(outputDir, folderId)` - Upload script.json, script.ts, composition-config.json
   - `uploadAudio(outputDir, folderId)` - Upload audio files, manifest, captions
   - `uploadVideo(videoPath, folderId)` - Upload rendered video
   - `uploadAll(outputDirs, folderId)` - Convenience method for full pipeline

### Phase 2: CLI Integration (2-3 hrs)

4. **Create `src/cli/uploadToDrive.ts`**
   - Standalone CLI for manual uploads
   - Options: `--script`, `--audio`, `--video`, `--all`
   - Options: `--folder-id`, `--folder-name`
   - Progress reporting

5. **Update `package.json`**
   - Add `googleapis` dependency
   - Add scripts:
     ```json
     "upload:drive": "tsx src/cli/uploadToDrive.ts",
     "upload:script": "npm run upload:drive -- --script",
     "upload:audio": "npm run upload:drive -- --audio",
     "upload:video": "npm run upload:drive -- --video",
     "generate:all:upload": "npm run generate:all && npm run upload:drive -- --all"
     ```

### Phase 3: Auto-Upload Integration (1-2 hrs)

6. **Modify `src/cli/generateScript.ts`**
   - Add `--upload` flag to auto-upload after generation
   - Call uploadManager.uploadScript() if enabled

7. **Modify `src/cli/generateAudio.ts`**
   - Add `--upload` flag to auto-upload after generation
   - Call uploadManager.uploadAudio() if enabled

### Phase 4: Documentation & Testing (1-2 hrs)

8. **Update `.env.example`** with Google Drive config
9. **Update `README.md`** with setup instructions
10. **Test with actual Google Drive account**

## Google Drive API Setup

### Service Account (Recommended for CI/CD)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project or select existing
3. Enable **Google Drive API**
4. Create **Service Account** → Keys → Create JSON key
5. Download JSON key file → save as `google-service-account.json` in project root
6. Share target Google Drive folder with service account email (Editor access)
7. Get folder ID from URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`

### OAuth2 (For User-Owned Drives)

1. Create OAuth 2.0 Client ID in Google Cloud Console
2. Add authorized redirect URI: `http://localhost:3000/oauth2callback` (for initial auth)
3. Run initial auth flow to get refresh token
4. Store credentials in `.env`

## Upload Flow Diagram

```
┌─────────────────┐
│ Generate Script │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ Save to         │────▶│ Upload to        │
│ src/generated/  │     │ Google Drive     │
└─────────────────┘     │ (script.json,    │
         │              │  script.ts,      │
         ▼              │  composition-    │
┌─────────────────┐     │  config.json)    │
│ Generate Audio  │     └──────────────────┘
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────┐
│ Save to         │────▶│ Upload to        │
│ public/audio/   │     │ Google Drive     │
│ generated/      │     │ (audio files,    │
└─────────────────┘     │  manifest, vtt)  │
         │              └──────────────────┘
         ▼
┌─────────────────┐     ┌──────────────────┐
│ Render Video    │────▶│ Upload to        │
│ (remotion)      │     │ Google Drive     │
└─────────────────┘     │ (video.mp4)      │
                        └──────────────────┘
```

## Error Handling

- **Retry logic**: Exponential backoff for network errors (max 3 retries)
- **Large files**: Use resumable upload for files > 5MB
- **Quota handling**: Detect and report quota exceeded errors
- **Permission errors**: Clear message if service account lacks access
- **Partial uploads**: Track which files succeeded/failed, allow retry

## Testing Checklist

- [ ] Service account auth works
- [ ] OAuth2 auth works (if implemented)
- [ ] Folder creation/find works
- [ ] Small file upload (< 5MB) works
- [ ] Large file upload (> 100MB) works with resumable
- [ ] Batch upload reports correct status
- [ ] Auto-upload after script generation works
- [ ] Auto-upload after audio generation works
- [ ] Manual CLI upload works
- [ ] Error messages are clear and actionable

## Estimated Effort

| Phase | Hours | Complexity |
|-------|-------|------------|
| Phase 1: Core Service | 3-4 | Medium |
| Phase 2: CLI Integration | 2-3 | Low |
| Phase 3: Auto-Upload | 1-2 | Low |
| Phase 4: Docs & Testing | 1-2 | Low |
| **Total** | **7-11** | **Medium** |

## Next Steps

1. **Decide on auth method**: Service Account (recommended) vs OAuth2
2. **Create Google Cloud project** and enable Drive API
3. **Set up credentials** and test folder access
4. **Start implementation** with Phase 1

---

*Plan created: 2026-11-05*
*Project: ai-code2video-creator*