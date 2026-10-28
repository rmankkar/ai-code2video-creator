/**
 * TTS Generator using macOS `say` command
 * Free, offline, built-in text-to-speech
 *
 * Voices available: say -v '?'
 * Good voices for narration: Samantha, Alex, Victoria, Fred, Susan
 */

import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { AudioSegment, AudioManifest, validateAudioManifest, ScriptScene } from '../types/script';
import { VIDEO_CONFIG } from '../config/video';

export interface TTSOptions {
  voice: string;
  rate: number; // words per minute
  outputDir: string;
  scriptTitle: string;
}

const DEFAULT_TTS_OPTIONS: TTSOptions = {
  voice: process.env.TTS_VOICE || 'Samantha',
  rate: parseInt(process.env.TTS_RATE || '200', 10),
  outputDir: resolve('public/audio'),
  scriptTitle: 'generated',
};

/**
 * Generate audio for a single scene using macOS `say`
 */
function generateSceneAudio(
  scene: ScriptScene,
  sceneIndex: number,
  options: TTSOptions,
  previousEndFrame: number = 0
): AudioSegment {
  const { voice, rate, outputDir } = options;

  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });

  // Generate unique filename
  const timestamp = Date.now();
  const aiffPath = resolve(outputDir, `scene-${sceneIndex}-${timestamp}.aiff`);
  const mp3Path = resolve(outputDir, `scene-${sceneIndex}-${timestamp}.mp3`);

  console.log(`🔊 Generating audio for scene ${sceneIndex} (${scene.narration.length} chars)...`);

  // Step 1: Generate AIFF using macOS `say`
  // -v voice, -r rate (words per minute), -o output file
  const sayResult = spawnSync('say', [
    '-v', voice,
    '-r', String(rate),
    '-o', aiffPath,
    scene.narration
  ], { encoding: 'utf-8' });

  if (sayResult.status !== 0) {
    throw new Error(`say command failed: ${sayResult.stderr}`);
  }

  if (!existsSync(aiffPath)) {
    throw new Error(`Audio file not created: ${aiffPath}`);
  }

  // Step 2: Convert AIFF to MP3 using ffmpeg
  const ffmpegResult = spawnSync('ffmpeg', [
    '-y',           // overwrite
    '-i', aiffPath, // input
    '-codec:a', 'libmp3lame',
    '-q:a', '2',    // high quality VBR
    mp3Path
  ], { encoding: 'utf-8' });

  if (ffmpegResult.status !== 0) {
    throw new Error(`ffmpeg conversion failed: ${ffmpegResult.stderr}`);
  }

  // Clean up AIFF
  try { spawnSync('rm', [aiffPath]); } catch { /* ignore cleanup errors */ }

  if (!existsSync(mp3Path)) {
    throw new Error(`MP3 file not created: ${mp3Path}`);
  }

  // Step 3: Get audio duration using ffprobe
  const probeResult = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    mp3Path
  ], { encoding: 'utf-8' });

  let durationMs = 5000; // fallback 5 seconds
  if (probeResult.status === 0 && probeResult.stdout.trim()) {
    durationMs = Math.round(parseFloat(probeResult.stdout.trim()) * 1000);
  }

  // Calculate frame timing based on ACTUAL audio duration
  // Chain scenes sequentially: each starts where previous ended
  const fps = VIDEO_CONFIG.fps;
  const startFrame = previousEndFrame;
  const endFrame = startFrame + Math.ceil(durationMs / 1000 * fps);

  // Return relative path for web serving
  const relativePath = `/audio/${basename(mp3Path)}`;

  console.log(`   ✅ ${basename(mp3Path)} - ${durationMs}ms (frames ${startFrame}-${endFrame})`);

  return {
    sceneIndex,
    text: scene.narration,
    startFrame,
    endFrame,
    durationMs,
    audioPath: relativePath,
  };
}

/**
 * Generate audio for all scenes in a script
 */
/**
 * Concatenate multiple audio files into a single file using ffmpeg
 */
function concatenateAudioFiles(mp3Paths: string[], outputPath: string): void {
  // Create a concat file list for ffmpeg
  const concatListPath = resolve(dirname(outputPath), 'concat-list.txt');
  const concatContent = mp3Paths.map(p => `file '${p}'`).join('\n');
  writeFileSync(concatListPath, concatContent);

  // Use ffmpeg concat demuxer to join files without re-encoding
  const concatResult = spawnSync('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',
    outputPath
  ], { encoding: 'utf-8' });

  if (concatResult.status !== 0) {
    throw new Error(`Audio concatenation failed: ${concatResult.stderr}`);
  }

  // Clean up concat list
  try { spawnSync('rm', [concatListPath]); } catch { /* ignore */ }
}

export async function generateAudioForScript(
  scenes: ScriptScene[],
  options: Partial<TTSOptions> = {}
): Promise<AudioManifest> {
  // Filter out undefined values so defaults are preserved
  const filteredOptions: Partial<TTSOptions> = {};
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) {
      (filteredOptions as Record<keyof TTSOptions, unknown>)[key as keyof TTSOptions] = value;
    }
  }
  const mergedOptions: TTSOptions = { ...DEFAULT_TTS_OPTIONS, ...filteredOptions };
  const segments: AudioSegment[] = [];
  let totalDurationMs = 0;
  let previousEndFrame = 0;
  const mp3Paths: string[] = [];

  console.log(`\n🎙️  Generating narration audio for ${scenes.length} scenes...`);
  console.log(`   Voice: ${mergedOptions.voice}, Rate: ${mergedOptions.rate} wpm`);

  for (let i = 0; i < scenes.length; i++) {
    const segment = generateSceneAudio(scenes[i], i, mergedOptions, previousEndFrame);
    segments.push(segment);
    totalDurationMs += segment.durationMs;
    previousEndFrame = segment.endFrame;
    // Store the full path for concatenation
    mp3Paths.push(resolve(mergedOptions.outputDir, basename(segment.audioPath)));
  }

  // Concatenate all scene audio into a single file
  const timestamp = Date.now();
  const concatMp3Path = resolve(mergedOptions.outputDir, `full-narration-${timestamp}.mp3`);
  console.log(`🔗 Concatenating ${mp3Paths.length} audio files...`);
  concatenateAudioFiles(mp3Paths, concatMp3Path);

  // Verify concatenated file duration
  const probeResult = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    concatMp3Path
  ], { encoding: 'utf-8' });

  let concatDurationMs = totalDurationMs;
  if (probeResult.status === 0 && probeResult.stdout.trim()) {
    concatDurationMs = Math.round(parseFloat(probeResult.stdout.trim()) * 1000);
  }
  console.log(`   ✅ Concatenated: ${basename(concatMp3Path)} - ${concatDurationMs}ms`);

  // Create manifest with single concatenated audio file
  // Keep segments for caption timing, but add a fullAudioPath
  const manifest: AudioManifest = {
    scriptVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    segments,
    totalDurationMs: concatDurationMs,
    fullAudioPath: `/audio/${basename(concatMp3Path)}`,
  };

  // Save manifest JSON
  const manifestPath = resolve('src/generated/audio-manifest.json');
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Also generate .ts module for browser-safe import
  const manifestTsPath = manifestPath.replace('.json', '.ts');
  const manifestTsContent = `// Auto-generated — do not edit manually
import type { AudioManifest } from '../types/script';

const manifest: AudioManifest = ${JSON.stringify(manifest, null, 2)};

export default manifest;
`;
  writeFileSync(manifestTsPath, manifestTsContent);

  console.log(`\n📊 Audio generation complete:`);
  console.log(`   Total duration: ${(concatDurationMs / 1000).toFixed(1)}s`);
  console.log(`   Manifest saved: ${manifestPath}`);
  console.log(`   Module saved: ${manifestTsPath}`);
  console.log(`   Full audio: ${manifest.fullAudioPath}`);

  return validateAudioManifest(manifest);
}

/**
 * Generate WebVTT captions from audio manifest
 */
export function generateCaptions(manifest: AudioManifest): string {
  let vtt = 'WEBVTT\n\n';

  for (const segment of manifest.segments) {
    const startTime = formatTime(segment.startFrame / VIDEO_CONFIG.fps);
    const endTime = formatTime(segment.endFrame / VIDEO_CONFIG.fps);

    vtt += `${startTime} --> ${endTime}\n${segment.text}\n\n`;
  }

  const captionsPath = resolve('src/generated/captions.vtt');
  writeFileSync(captionsPath, vtt);
  console.log(`📝 Captions saved: ${captionsPath}`);

  return vtt;
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

/**
 * Validate ffmpeg and say are available
 */
export function checkDependencies(): { ffmpeg: boolean; say: boolean; ffprobe: boolean } {
  const ffmpeg = spawnSync('which', ['ffmpeg']).status === 0;
  const say = spawnSync('which', ['say']).status === 0;
  const ffprobe = spawnSync('which', ['ffprobe']).status === 0;

  if (!ffmpeg) console.warn('⚠️  ffmpeg not found. Install: brew install ffmpeg');
  if (!say) console.warn('⚠️  say command not found (macOS only)');
  if (!ffprobe) console.warn('⚠️  ffprobe not found (comes with ffmpeg)');

  return { ffmpeg, say, ffprobe };
}