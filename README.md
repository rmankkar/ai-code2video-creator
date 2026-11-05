# AI Video Generator 🎬

> **End-to-end AI pipeline** that turns a topic into a polished vertical video (1080×1920, 30fps, 20s) with synchronized narration and captions — built with Remotion, NVIDIA NIM, and macOS native TTS.

<p align="center">
  <img src="https://img.shields.io/badge/Remotion-4.0.539-00D4AA?style=for-the-badge&logo=remotion&logoColor=white" alt="Remotion">
  <img src="https://img.shields.io/badge/NVIDIA%20NIM-nemotron--3--ultra-76B900?style=for-the-badge&logo=nvidia&logoColor=white" alt="NVIDIA NIM">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/macOS-TTS-000000?style=for-the-badge&logo=apple&logoColor=white" alt="macOS TTS">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen?style=flat-square" alt="PRs Welcome">
  <img src="https://img.shields.io/badge/Status-Active-success?style=flat-square" alt="Status">
</p>

---

## 🎯 What It Does

| Input | Output |
|-------|--------|
| A **topic string** (e.g., `"AI in Gaming"`) | **MP4 video** (1080×1920, 30fps, 20s) with:<br>• 4 animated scenes<br>• Kinetic typography<br>• Synchronized narration audio<br>• WebVTT captions |

**Zero manual editing** — the entire pipeline runs from CLI:

```bash
cd video
npm run generate:script "AI in Gaming"   # 1️⃣ LLM writes structured script
npm run generate:audio                   # 2️⃣ macOS `say` + ffmpeg → audio + captions
npx remotion render PixelPulseShort out.mp4 --enforce-audio-track  # 3️⃣ Remotion renders final video
```

---

## 🏗 Architecture

```mermaid
flowchart LR
    A[Topic] --> B[NVIDIA NIM<br/>nemotron-3-ultra]
    B --> C[Script JSON<br/>4 scenes, Zod-validated]
    C --> D[generate:script CLI]
    D --> E[script.json + script.ts]
    C --> F[generate:audio CLI]
    F --> G[macOS say → AIFF]
    G --> H[ffmpeg → MP3]
    H --> I[audio-manifest.json + .ts]
    I --> J[captions.vtt]
    E --> K[Remotion Bundle]
    I --> K
    J --> K
    K --> L[npx remotion render]
    L --> M[final.mp4 ✨]
```

### Key Design Decisions

| Layer | Technology | Why |
|-------|------------|-----|
| **LLM** | NVIDIA NIM (OpenAI-compatible) | Structured JSON output, single provider |
| **TTS** | macOS `say` + ffmpeg | Free, offline, high-quality voices |
| **Video** | Remotion 4.x | React-based, frame-accurate, programmatic |
| **Validation** | Zod v4 | Runtime schema safety |
| **Config** | JSON + TS modules | Bundle-time + runtime compatibility |

---

## 📋 Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | ≥20.19 | `brew install node@20` |
| **npm** | ≥10 | Included with Node |
| **ffmpeg** | ≥6.0 | `brew install ffmpeg` |
| **macOS** | Any | Native `say` command |
| **NVIDIA NIM API Key** | — | See [Setup](#-setup) |

> ⚠️ **macOS required** for TTS. Linux/Windows users: swap `say` for `piper`, `coqui`, or cloud TTS in `src/services/ttsGenerator.ts`.

---

## 🚀 Setup

```bash
# 1. Clone & enter
git clone <your-repo>
cd ai-code-video-test/video

# 2. Install deps
npm i --loglevel=error

# 3. Configure NVIDIA NIM
cp .env.example .env   # Create .env with your credentials
# Edit .env:
# NVIDIA_NIM_API_KEY=your_key_here
# NVIDIA_NIM_BASE_URL=https://integrate.api.nvidia.com/v1
# NVIDIA_NIM_MODEL=nvidia/nemotron-3-ultra-550b-a55b

# 4. Verify ffmpeg & say
ffmpeg -version
say "Hello world"  # Should speak
```

### .env.example

```bash
# NVIDIA NIM (required for script generation)
NVIDIA_NIM_API_KEY=
NVIDIA_NIM_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_NIM_MODEL=nvidia/nemotron-3-ultra-550b-a55b

# Optional TTS overrides
TTS_VOICE=Samantha
TTS_RATE=200
```

---

## ⚡ Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | 🎞 Open Remotion Studio (live preview) |
| `npm run generate:script "topic"` | 🤖 Generate script via NVIDIA NIM |
| `npm run generate:audio` | 🎙 Generate narration + captions |
| `npm run generate:all "topic"` | 🔄 Run both steps above |
| `npm run build` | 📦 Bundle for production |
| `npx remotion render PixelPulseShort out.mp4 --enforce-audio-track` | 🎬 Render final MP4 |
| `npm run lint` | 🔍 ESLint + TypeScript check |
| `npm run upload:drive [topic] [options]` | ☁️ Upload to Google Drive |
| `npm run upload:drive:test` | ☁️ Test Google Drive connection |

### Quick Start (One-liner)

```bash
npm run generate:all "AI in Gaming" && npx remotion render PixelPulseShort output/my-video.mp4 --enforce-audio-track
```

### Google Drive Upload

Upload generated content (script, audio, video) to Google Drive:

```bash
# Test connection
npm run upload:drive:test

# Upload all (script + audio + video) for a topic
npm run upload:drive "AI Test Automation" --all --video out/video.mp4

# Upload script only
npm run upload:drive "My Topic" --script

# Upload audio only
npm run upload:drive "My Topic" --audio

# Upload video only
npm run upload:drive "My Topic" --video out/video.mp4

# Upload to specific parent folder
npm run upload:drive "My Topic" --all --video out/video.mp4 --parent-folder 1abc2def...

# Upload without timestamp in folder name
npm run upload:drive "My Topic" --all --video out/video.mp4 --no-timestamp
```

**Upload creates:** A folder named `{topic}_{timestamp}` under the parent folder, containing:
- Script: `script.json`, `script.ts`, `composition-config.json`
- Audio: `audio-manifest.json`, `captions.vtt`, audio segment files
- Video: `video.mp4` (or your rendered file)

[Google Drive Setup](#-google-drive-setup) below for authentication details.

---

## 🔄 Pipeline Deep Dive

### 1. Script Generation (`generate:script`)

```typescript
// src/cli/generateScript.ts
const script = await generateScriptWithRetry({ topic, customPrompt });
```

**Output:** `src/generated/`
- `script.json` — Raw validated JSON
- `script.ts` — ES module export for browser
- `composition-config.json` — Shared config for Remotion

**Script Schema (Zod):**
```typescript
interface VideoScript {
  title: string;
  durationFrames: 600;      // 20s @ 30fps
  fps: 30;
  width: 1080;
  height: 1920;
  scenes: ScriptScene[4];   // Exactly 4 scenes
  metadata: { model, generatedAt, prompt, version };
  globalNarration: string;
}
```

### 2. Audio Generation (`generate:audio`)

```typescript
// src/services/ttsGenerator.ts
const manifest = await generateAudioForScript(scenes, { voice: "Samantha", rate: 200 });
```

**Process per scene:**
1. `say -v Samantha -r 200 -o scene.aiff "narration text"`
2. `ffmpeg -i scene.aiff -c:a libmp3lame -b:a 128k scene.mp3`
3. `ffprobe` → exact duration (ms) → frame mapping

**Output:** `src/generated/`
- `audio/scene-{0..3}-{timestamp}.mp3`
- `audio-manifest.json` + `.ts` module
- `captions.vtt` — WebVTT synchronized to frames

### 3. Video Rendering (`Short.tsx`)

```tsx
// Receives script + audioManifest via defaultProps
const scenes = script?.scenes ?? fallbackScenes;
const scene = scenes[Math.floor(frame / 150)];
```

- **Dynamic scenes** from script (not hardcoded)
- **AudioPlayer** reads manifest → plays correct segment per frame
- **Visual debug banner** shows `GENERATED: {title}` (green) or `FALLBACK` (red)

---

## 📁 Project Structure

```
video/
├── src/
│   ├── cli/
│   │   ├── generateScript.ts      # NVIDIA NIM → script.json/.ts
│   │   └── generateAudio.ts       # macOS say + ffmpeg → audio/
│   ├── components/
│   │   └── AudioPlayer.tsx        # Frame-synced audio playback
│   ├── config/
│   │   └── video.ts               # Colors, durations, constants
│   ├── data/
│   │   └── sampleScript.ts        # Fallback script (never used if pipeline works)
│   ├── generated/                 # 📦 AUTO-GENERATED (gitignored)
│   │   ├── script.json / .ts
│   │   ├── audio-manifest.json / .ts
│   │   ├── composition-config.json
│   │   ├── captions.vtt
│   │   └── audio/*.mp3
│   ├── services/
│   │   ├── scriptGenerator.ts     # NIM chat completion + validation
│   │   └── ttsGenerator.ts        # TTS orchestration
│   ├── types/
│   │   └── script.ts              # Zod schemas (VideoScript, AudioManifest…)
│   ├── Composition.tsx            # Bundle-time metadata (calculateMetadata)
│   ├── Root.tsx                   # Remotion entry point (registers Composition)
│   ├── Short.tsx                  # Main video component
│   └── index.ts                   # registerRoot(RemotionRoot)
├── output/                        # 📦 Rendered MP4s (gitignored)
├── remotion.config.ts             # Rspack config
├── tsconfig.json
└── package.json
```

---

## 🎨 Customization

### Change Visual Theme
Edit `src/config/video.ts`:
```typescript
export const VIDEO_CONFIG = {
  colors: {
    bg: "#080816",
    white: "#F5F5F5",
    cyan: "#00EBFF",
    violet: "#9B7BFF",
    muted: "#6B6B8A",
  },
  sceneDurationFrames: 150,
  durationInFrames: 600,
};
```

### Change TTS Voice
```bash
# List voices: say -v "?"
npm run generate:audio -- --voice "Alex" --rate 180
```

### Change Video Dimensions
Update `VIDEO_CONFIG` and `VideoScript` schema — all dimensions flow from there.

---

## 🐛 Troubleshooting

| Issue | Fix |
|-------|-----|
| `Missing script: generate:script` | Run from `video/` directory, not repo root |
| `Cannot find module './generated/script'` | Run `npm run generate:script` first |
| Audio missing in output | Use `--enforce-audio-track` flag on render |
| `say` command not found | macOS only — install ffmpeg: `brew install ffmpeg` |
| NIM API 401/429 | Check `.env` key, verify quota at NVIDIA dashboard |
| TypeScript errors on `fs`/`path` | Ensure imports only in Node-only files (CLI, Composition.tsx) |
| Green banner shows `FALLBACK` | `generate:script` + `generate:audio` not run, or config stale |
| Google Drive upload fails | Verify OAuth2 credentials, check folder permissions, ensure refresh token is valid |

### Debug Checklist

```bash
# 1. Verify generated files exist
ls -la src/generated/

# 2. Check script is valid JSON
cat src/generated/script.json | jq '.scenes | length'  # Should be 4

# 3. Verify audio manifest
cat src/generated/audio-manifest.json | jq '.segments | length'  # Should be 4

# 4. Test render with verbose output
npx remotion render PixelPulseShort out.mp4 --enforce-audio-track --log-level verbose
```

---

## ☁️ Google Drive Setup

The upload feature uses **OAuth2** authentication (recommended for personal use) or **Service Account** (for CI/CD).

### Option 1: OAuth2 (Personal Use)

1. **Create OAuth 2.0 Credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing
   - Enable **Google Drive API**
   - Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**
   - Application type: **Desktop app**
   - Note down **Client ID** and **Client Secret**

2. **Get Refresh Token:**
   ```bash
   # Generate auth URL (run in Node.js)
   node -e "
   const {google} = require('googleapis');
   const oauth2Client = new google.auth.OAuth2(
     'YOUR_CLIENT_ID',
     'YOUR_CLIENT_SECRET',
     'http://localhost:3000/oauth2callback'
   );
   const url = oauth2Client.generateAuthUrl({
     access_type: 'offline',
     scope: ['https://www.googleapis.com/auth/drive.file'],
     prompt: 'consent'
   });
   console.log(url);
   "
   ```
   - Visit the printed URL in browser
   - Sign in and grant permission
   - Copy the `code` parameter from the redirect URL (e.g., `http://localhost:3000/oauth2callback?code=4/0AWg...`)

3. **Exchange Code for Refresh Token:**
   ```bash
   node -e "
   const {google} = require('googleapis');
   const oauth2Client = new google.auth.OAuth2(
     'YOUR_CLIENT_ID',
     'YOUR_CLIENT_SECRET',
     'http://localhost:3000/oauth2callback'
   );
   oauth2Client.getToken('YOUR_AUTH_CODE').then(({tokens}) => {
     console.log('REFRESH_TOKEN:', tokens.refresh_token);
   });
   "
   ```

4. **Configure `.env`:**
   ```bash
   GOOGLE_DRIVE_AUTH_TYPE=oauth2
   GOOGLE_DRIVE_CLIENT_ID=your_client_id
   GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret
   GOOGLE_DRIVE_REFRESH_TOKEN=your_refresh_token
   GOOGLE_DRIVE_PARENT_FOLDER_ID=your_parent_folder_id  # Optional
   ```

5. **Create Parent Folder (Optional):**
   - Create a folder in Google Drive (e.g., "AI Video Output")
   - Get folder ID from URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`
   - Share folder with your OAuth2 account (it's your account, so automatic)

### Option 2: Service Account (CI/CD / Automation)

1. **Create Service Account:**
   - In Google Cloud Console → **IAM & Admin** → **Service Accounts** → **Create Service Account**
   - Grant **Editor** role (or custom role with Drive permissions)
   - Create **JSON Key** → Download and save as `google-service-account.json` in project root

2. **Share Drive Folder with Service Account:**
   - In Google Drive, right-click your parent folder → **Share**
   - Add service account email (e.g., `my-svc@project.iam.gserviceaccount.com`)
   - Give **Editor** access

3. **Configure `.env`:**
   ```bash
   GOOGLE_DRIVE_AUTH_TYPE=service_account
   GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY_PATH=./google-service-account.json
   GOOGLE_DRIVE_PARENT_FOLDER_ID=your_parent_folder_id
   ```

### Test Connection

```bash
npm run upload:drive:test
```

Should output: `✅ Connected to Google Drive successfully`

---

## 📄 License

MIT License — see [LICENSE](../LICENSE) for details.

> **Note:** Remotion requires a [company license](https://www.remotion.dev/pricing) for commercial use (revenue >$100k/yr or team >3). Personal/educational use is free.

---

## 🙏 Credits

- **Remotion** — Programmatic video in React
- **NVIDIA NIM** — Nemotron 3 Ultra for structured generation
- **Zod** — TypeScript-first schema validation
- **macOS `say`** — Surprisingly great free TTS

---

<p align="center">
  <strong>Built with ❤️ for developers who hate manual video editing.</strong>
</p>