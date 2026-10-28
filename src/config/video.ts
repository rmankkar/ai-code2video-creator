/**
 * Video Configuration Constants
 * Centralized video settings for easy adjustment
 */

export const VIDEO_CONFIG = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 600, // 20 seconds at 30fps
  sceneDurationFrames: 150, // 4 scenes × 150 frames = 600 frames
  numScenes: 4,

  // Safe margins for Instagram Reels / YouTube Shorts UI
  safeMargin: {
    top: 150,    // Avoid profile/handle area
    bottom: 200, // Avoid caption/action bar
    left: 60,
    right: 60,
  },

  // Color palette (matching existing Short.tsx)
  colors: {
    bg: '#070816',
    violet: '#9B7BFF',
    cyan: '#5CEBFF',
    white: '#F7F7FF',
    muted: '#A6A9C5',
    pink: '#FF65C8',
  },
} as const;

export type VideoConfig = typeof VIDEO_CONFIG;