/**
 * Script Type Definitions
 * Matches the existing 4-scene × 150-frame structure in Short.tsx
 * Extended with narration for TTS audio generation
 */

import { z } from 'zod';
import { VIDEO_CONFIG } from '../config/video';

// ============================================
// Zod Schemas for Validation
// ============================================

export const ScriptSceneSchema = z.object({
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  tag: z.string().min(1).max(50),
  kicker: z.string().min(1).max(60),
  lines: z.array(z.string().min(1).max(15)).length(2),
  description: z.string().min(1).max(120),
  narration: z.string().min(1).max(300), // ~5 seconds of speech
  accentLineIndex: z.number().int().min(0).max(1),
  icon: z.string().min(1).max(2),
});

export const VideoScriptSchema = z.object({
  title: z.string().min(1).max(100),
  durationFrames: z.number().int().positive(),
  fps: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  scenes: z.array(ScriptSceneSchema).length(VIDEO_CONFIG.numScenes),
  metadata: z.object({
    generatedAt: z.string().datetime(),
    model: z.string(),
    prompt: z.string(),
    version: z.string(),
  }),
  globalNarration: z.string().optional(), // Optional intro/outro
});

// ============================================
// TypeScript Types (inferred from schemas)
// ============================================

export type ScriptScene = z.infer<typeof ScriptSceneSchema>;
export type VideoScript = z.infer<typeof VideoScriptSchema>;

// ============================================
// Audio Types
// ============================================

export const AudioSegmentSchema = z.object({
  sceneIndex: z.number().int().min(0).max(3),
  text: z.string(),
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().positive(),
  durationMs: z.number().positive(),
  audioPath: z.string(),
});

export type AudioSegment = z.infer<typeof AudioSegmentSchema>;

export const AudioManifestSchema = z.object({
  scriptVersion: z.string(),
  generatedAt: z.string().datetime(),
  segments: z.array(AudioSegmentSchema),
  totalDurationMs: z.number().positive(),
});

export type AudioManifest = z.infer<typeof AudioManifestSchema>;

// ============================================
// Caption Types (WebVTT format)
// ============================================

export interface CaptionCue {
  startTime: number; // seconds
  endTime: number;   // seconds
  text: string;
}

export interface CaptionsManifest {
  cues: CaptionCue[];
  language: string;
}

// ============================================
// Helper Functions
// ============================================

export function validateScript(data: unknown): VideoScript {
  return VideoScriptSchema.parse(data);
}

export function validateAudioManifest(data: unknown): AudioManifest {
  return AudioManifestSchema.parse(data);
}

export function createEmptyScript(title: string = 'Untitled'): VideoScript {
  const now = new Date().toISOString();
  const frameDuration = VIDEO_CONFIG.sceneDurationFrames;

  return {
    title,
    durationFrames: VIDEO_CONFIG.durationInFrames,
    fps: VIDEO_CONFIG.fps,
    width: VIDEO_CONFIG.width,
    height: VIDEO_CONFIG.height,
    scenes: Array.from({ length: VIDEO_CONFIG.numScenes }, (_, i) => ({
      startFrame: i * frameDuration,
      endFrame: (i + 1) * frameDuration,
      tag: `SCENE ${i + 1}`,
      kicker: 'PLACEHOLDER',
      lines: ['LINE ONE', 'LINE TWO'],
      description: 'Scene description goes here.',
      narration: 'Narration for this scene goes here.',
      accentLineIndex: 0,
      icon: '✦',
    })),
    metadata: {
      generatedAt: now,
      model: 'manual',
      prompt: 'Manual creation',
      version: '1.0.0',
    },
  };
}