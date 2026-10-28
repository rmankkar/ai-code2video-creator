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
 * AudioPlayer - Plays the correct audio segment for the current frame
 * Each scene has its own audio file that plays during its frame range
 * All Audio components must be rendered for Remotion to include them in the output
 * Uses staticFile() to get the correct URL for public folder assets
 */
export const AudioPlayer: React.FC<AudioPlayerProps> = ({ manifest }) => {
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