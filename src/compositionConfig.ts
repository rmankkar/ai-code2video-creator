// Bundle-time configuration for Remotion Composition
// This runs in Node.js at bundle time — can use fs, path, etc.
import { CalculateMetadataFunction } from "remotion";
import { sampleScript } from "./data/sampleScript";
import type { VideoScript, AudioManifest } from "./types/script";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface CompositionProps {
  scriptPath?: string;
  audioManifest?: AudioManifest;
  [key: string]: unknown;
}

// Load audio manifest at bundle time (static, rarely changes)
let audioManifest: AudioManifest | undefined;
try {
  const manifestPath = resolve(__dirname, "generated/audio-manifest.json");
  const content = readFileSync(manifestPath, "utf-8");
  audioManifest = JSON.parse(content);
  console.log("[compositionConfig] Loaded audio manifest, segments:", audioManifest?.segments?.length);
} catch (e) {
  console.log("[compositionConfig] No audio manifest found:", e);
}

// Default props — pass scriptPath so Short loads it at RUNTIME in browser
const scriptPath = "./generated/script"; // resolves to generated/script.ts module
export const defaultProps: CompositionProps = {
  scriptPath,
  audioManifest,
};

// Calculate metadata from generated script (for title/description in Remotion UI)
// NOTE: Do NOT return `props` here — let `defaultProps` on Composition flow naturally
export const calculateMetadata: CalculateMetadataFunction<CompositionProps> = () => {
  // Try to read script for metadata (bundle time)
  let script: VideoScript = sampleScript;
  try {
    const scriptPathAbs = resolve(__dirname, "generated/script.json");
    const content = readFileSync(scriptPathAbs, "utf-8");
    script = JSON.parse(content);
  } catch {
    // use sampleScript
  }
  return {
    durationInFrames: script.durationFrames,
    fps: script.fps,
    width: script.width,
    height: script.height,
  } as const;
};