import { CalculateMetadataFunction, Composition } from "remotion";
import { Short } from "./Short";
import { sampleScript } from "./data/sampleScript";
import type { VideoScript, AudioManifest } from "./types/script";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CompositionProps {
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
  console.log("[Composition] Loaded audio manifest, segments:", audioManifest?.segments?.length);
} catch (e) {
  console.log("[Composition] No audio manifest found:", e);
}

// Load script at bundle time so Short.tsx renders updated content from script.json/script.ts
let script: VideoScript | undefined;
try {
  const scriptPathAbs = resolve(__dirname, "generated/script.json");
  const content = readFileSync(scriptPathAbs, "utf-8");
  script = JSON.parse(content) as VideoScript;
  console.log("[Composition] Loaded script from script.json, scenes:", script?.scenes?.length);
} catch {
  console.log("[Composition] No script.json found, will use scriptPath fallback");
}

// Default props — pass script directly so Short.tsx uses updated content
const scriptPath = "./generated/script"; // resolves to generated/script.ts module
const defaultProps: CompositionProps = {
  scriptPath,
  script,
  audioManifest,
};

// Calculate metadata from generated script (for title/description in Remotion UI)
// NOTE: Do NOT return `props` here — let `defaultProps` on Composition flow naturally
const calculateMetadata: CalculateMetadataFunction<CompositionProps> = () => {
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

export const MyComposition = () => {
  return (
    <Composition
      id="PixelPulseShort"
      component={Short}
      durationInFrames={sampleScript.durationFrames}
      fps={sampleScript.fps}
      width={sampleScript.width}
      height={sampleScript.height}
      calculateMetadata={calculateMetadata}
      defaultProps={defaultProps}
    />
  );
};