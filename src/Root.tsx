
import React from "react";
import { CalculateMetadataFunction, Composition } from "remotion";
import { Short } from "./Short";
import { sampleScript } from "./data/sampleScript";
import type { VideoScript, AudioManifest } from "./types/script";

// Type for generated composition config (JSON import)
interface GeneratedConfig {
  scriptPath: string;
  script: VideoScript;
  video: {
    durationInFrames: number;
    fps: number;
    width: number;
    height: number;
  };
  audioManifest?: AudioManifest;
}

// Import generated config as JSON (browser-safe static import)
import generatedConfig from "./generated/composition-config.json";

const config = generatedConfig as GeneratedConfig;

interface CompositionProps {
  script?: VideoScript;
  scriptPath?: string;
  audioManifest?: AudioManifest;
  [key: string]: unknown;
}

// Default props from generated config
const defaultProps: CompositionProps = {
  script: config.script,
  scriptPath: config.scriptPath,
  audioManifest: config.audioManifest,
};

// Calculate metadata from generated config
// Use audio manifest total duration for video length (so audio plays fully)
const calculateMetadata: CalculateMetadataFunction<CompositionProps> = () => {
  const video = config.video ?? {
    durationInFrames: sampleScript.durationFrames,
    fps: sampleScript.fps,
    width: sampleScript.width,
    height: sampleScript.height,
  };

  // Override duration from audio manifest if available
  let durationInFrames = video.durationInFrames;
  if (config.audioManifest?.totalDurationMs) {
    const fps = video.fps;
    durationInFrames = Math.ceil(config.audioManifest.totalDurationMs / 1000 * fps);
  }

  return {
    durationInFrames,
    fps: video.fps,
    width: video.width,
    height: video.height,
  } as const;
};

export const RemotionRoot: React.FC = () => {
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
