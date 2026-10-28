/**
 * Remotion AudioPlayer Component
 * Handles frame-accurate audio playback synchronized with video scenes
 */

import { Audio, staticFile } from "remotion";
import { AudioManifest, AudioSegment } from "../types/script";

interface AudioPlayerProps {
  manifest: AudioManifest;
}

/**
 * AudioPlayer - Plays the concatenated narration audio
 * Uses a single audio file that spans the entire video duration
 */
export const AudioPlayer: React.FC<AudioPlayerProps> = ({ manifest }) => {
  // Use the full concatenated audio if available, otherwise fall back to segments
  if (manifest.fullAudioPath) {
    return (
      <Audio
        src={staticFile(manifest.fullAudioPath)}
        startFrom={0}
        playbackRate={1}
      />
    );
  }

  // Fallback: play individual segments (legacy)
  return (
    <>
      {manifest.segments.map((segment: AudioSegment) => (
        <Audio
          key={segment.sceneIndex}
          src={staticFile(segment.audioPath)}
          startFrom={segment.startFrame / 30}
          endAt={segment.endFrame / 30}
          playbackRate={1}
        />
      ))}
    </>
  );
};

/**
 * Get the active audio segment for a given frame (for external use)
 */
export function getActiveAudioSegment(
  manifest: AudioManifest,
  frame: number,
  fps: number
): AudioSegment | null {
  const currentTime = frame / fps;
  return manifest.segments.find(
    (segment) =>
      currentTime >= segment.startFrame / fps &&
      currentTime < segment.endFrame / fps
  ) || null;
}

/**
 * AudioPlayer with volume control (for future use)
 */
interface AudioPlayerWithVolumeProps extends AudioPlayerProps {
  volume?: number;
}

export const AudioPlayerWithVolume: React.FC<AudioPlayerWithVolumeProps> = ({
  manifest,
  volume = 1
}) => {
  if (manifest.fullAudioPath) {
    return (
      <Audio
        src={staticFile(manifest.fullAudioPath)}
        startFrom={0}
        playbackRate={1}
        volume={volume}
      />
    );
  }

  return (
    <>
      {manifest.segments.map((segment: AudioSegment) => (
        <Audio
          key={segment.sceneIndex}
          src={staticFile(segment.audioPath)}
          startFrom={segment.startFrame / 30}
          endAt={segment.endFrame / 30}
          playbackRate={1}
          volume={volume}
        />
      ))}
    </>
  );
};