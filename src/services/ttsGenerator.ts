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
  enablePostProcessing?: boolean; // ffmpeg loudnorm + fades + compression
  enableSSML?: boolean; // use SSML prosody markup for natural pacing
}

const DEFAULT_TTS_OPTIONS: TTSOptions = {
  voice: process.env.TTS_VOICE || 'Samantha',
  rate: parseInt(process.env.TTS_RATE || '165', 10),
  outputDir: resolve('public/audio'),
  scriptTitle: 'generated',
  enablePostProcessing: true,
  enableSSML: true,
};

// Voice fallback chain — tried in order if the requested voice fails
const VOICE_FALLBACKS: string[] = ['Samantha', 'Alex', 'Victoria', 'Daniel'];

/**
 * Phase 3 — Text Preprocessing
 * Convert written narration into speakable, SSML-annotated text.
 * macOS `say` reads SSML when piped to stdin (-f -).
 */

const ABBREVIATIONS: Record<string, string> = {
  SSD: 'S-S-D',
  HDD: 'H-D-D',
  NVMe: 'N-V-M-E',
  GPU: 'G-P-U',
  CPU: 'C-P-U',
  AI: 'A-I',
  FPS: 'F-P-S',
  RTX: 'R-T-X',
  RX: 'R-X',
  DLSS: 'D-L-S-S',
  PCIe: 'P-C-I-E',
  QA: 'Q-A',
  RCA: 'R-C-A',
  TB: 'terabyte',
  GB: 'gigabyte',
  MHz: 'megahertz',
  GHz: 'gigahertz',
};

function expandAbbreviations(text: string): string {
  let result = text;
  for (const [abbr, spoken] of Object.entries(ABBREVIATIONS)) {
    // Match whole-word abbreviations only (boundaries on both sides)
    const regex = new RegExp(`\\b${abbr}\\b`, 'g');
    result = result.replace(regex, spoken);
  }
  return result;
}

function convertSymbols(text: string): string {
  return text
    // "20-40%" → "twenty to forty percent"
    .replace(/(\d+)\s*-\s*(\d+)%/g, (_m, a, b) => `${numberToWords(a)} to ${numberToWords(b)} percent`)
    // "40%" → "forty percent"
    .replace(/(\d+)%/g, (_m, n) => `${numberToWords(n)} percent`)
    // "$800" → "eight hundred dollars"
    .replace(/\$(\d+)/g, (_m, n) => `${numberToWords(n)} dollars`)
    // "&" → " and "
    .replace(/&/g, ' and ')
    // "+" → " plus "
    .replace(/\+/g, ' plus ')
    // "x" between numbers → "by"
    .replace(/(\d+)x(\d+)/g, (_m, a, b) => `${numberToWords(a)} by ${numberToWords(b)}`);
}

// Very small spoken-number map (0–99 covers most narration needs)
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function numberToWords(nStr: string): string {
  const n = parseInt(nStr, 10);
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? TENS[t] : `${TENS[t]}-${ONES[o]}`;
  }
  return nStr; // fall back to digits for 100+
}

/**
 * Add SSML break tags between sentences so `say` pauses for breath.
 * Only applied when enableSSML is true.
 */
function addSentenceBreaks(text: string): string {
  return text.replace(/([.!?])\s+/g, '$1<break time="350ms"/> ');
}

/**
 * Wrap preprocessed text in SSML speak/prosody tags.
 * Rate is passed via the `say -r` flag; SSML handles breaks/emphasis only.
 */
function wrapInSSML(text: string): string {
  return `<speak>${text}</speak>`;
}

/**
 * Combine all Phase 3 preprocessing steps.
 */
function preprocessForTTS(text: string, useSSML: boolean): string {
  let result = expandAbbreviations(text);
  result = convertSymbols(result);
  if (useSSML) {
    result = addSentenceBreaks(result);
    result = wrapInSSML(result);
  }
  return result;
}

/**
 * Phase 1 — Resolve voice with fallback chain.
 * Returns the first voice that exists on the system.
 */
function resolveVoice(requested: string): string {
  if (voiceExists(requested)) return requested;
  for (const fallback of VOICE_FALLBACKS) {
    if (voiceExists(fallback)) return fallback;
  }
  return requested; // last resort — let `say` error if nothing works
}

function voiceExists(voice: string): boolean {
  const result = spawnSync('say', ['-v', '?'], { encoding: 'utf-8' });
  if (result.status !== 0) return false;
  // Each line: "VoiceName  locale  # sample"
  return result.stdout.split('\n').some((line) => line.startsWith(voice + ' '));
}

/**
 * Phase 4 — Audio post-processing with ffmpeg.
 * Applies loudness normalization, gentle compression, and fade in/out.
 * Uses WAV as intermediate format (AIFF + loudnorm is incompatible).
 */
function postProcessAudio(inputPath: string, outputPath: string): void {
  const durationResult = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    inputPath,
  ], { encoding: 'utf-8' });

  let durationSec = 5;
  if (durationResult.status === 0 && durationResult.stdout.trim()) {
    durationSec = parseFloat(durationResult.stdout.trim());
  }

  const fadeDur = Math.min(0.1, durationSec / 2); // 100ms fade, max half the clip

  const result = spawnSync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-af',
    `loudnorm=I=-16:LRA=11:tp=-1:linear=true,acompressor=threshold=-18dB:ratio=4:attack=5:release=50,afade=t=in:st=0:d=${fadeDur},afade=t=out:st=${durationSec - fadeDur}:d=${fadeDur}`,
    '-ar', '22050',
    '-ac', '1',
    outputPath,
  ], { encoding: 'utf-8' });

  if (result.status !== 0) {
    throw new Error(`Audio post-processing failed: ${result.stderr}`);
  }
}

/**
 * Generate audio for a single scene using macOS `say`
 * Phase 1: voice fallback, Phase 2: SSML prosody, Phase 4: post-processing
 */
function generateSceneAudio(
  scene: ScriptScene,
  sceneIndex: number,
  options: TTSOptions,
  previousEndFrame: number = 0
): AudioSegment {
  const { voice: requestedVoice, rate, outputDir, enablePostProcessing = true, enableSSML = true } = options;

  // Phase 1: resolve voice with fallback
  const voice = resolveVoice(requestedVoice);

  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });

  // Generate unique filename
  const timestamp = Date.now();
  const aiffPath = resolve(outputDir, `scene-${sceneIndex}-${timestamp}.aiff`);
  const processedAiffPath = resolve(outputDir, `scene-${sceneIndex}-${timestamp}-processed.aiff`);
  const mp3Path = resolve(outputDir, `scene-${sceneIndex}-${timestamp}.mp3`);

  console.log(`🔊 Generating audio for scene ${sceneIndex} (${scene.narration.length} chars, voice: ${voice}, rate: ${rate}wpm)...`);

  // Phase 3: preprocess narration text (abbreviations, symbols, SSML breaks)
  const preprocessed = preprocessForTTS(scene.narration, enableSSML);

  // Step 1: Generate AIFF using macOS `say`
  // Pipe SSML to stdin when enableSSML is true, otherwise pass plain text as argument
  let sayResult;
  if (enableSSML) {
    sayResult = spawnSync('say', [
      '-v', voice,
      '-r', String(rate),
      '-o', aiffPath,
      '-f', '-', // read SSML from stdin
    ], { input: preprocessed, encoding: 'utf-8' });
  } else {
    sayResult = spawnSync('say', [
      '-v', voice,
      '-r', String(rate),
      '-o', aiffPath,
      scene.narration,
    ], { encoding: 'utf-8' });
  }

  if (sayResult.status !== 0) {
    throw new Error(`say command failed: ${sayResult.stderr}`);
  }

  if (!existsSync(aiffPath)) {
    throw new Error(`Audio file not created: ${aiffPath}`);
  }

  // Phase 4: post-process audio (loudnorm, compression, fades)
  let finalAiffPath = aiffPath;
  if (enablePostProcessing) {
    postProcessAudio(aiffPath, processedAiffPath);
    finalAiffPath = processedAiffPath;
    try { spawnSync('rm', [aiffPath]); } catch { /* ignore cleanup errors */ }
  }

  // Step 2: Convert AIFF to MP3 using ffmpeg
  const ffmpegResult = spawnSync('ffmpeg', [
    '-y',           // overwrite
    '-i', finalAiffPath, // input
    '-codec:a', 'libmp3lame',
    '-q:a', '2',    // high quality VBR
    mp3Path
  ], { encoding: 'utf-8' });

  if (ffmpegResult.status !== 0) {
    throw new Error(`ffmpeg conversion failed: ${ffmpegResult.stderr}`);
  }

  // Clean up processed AIFF if different from original
  if (finalAiffPath !== aiffPath) {
    try { spawnSync('rm', [finalAiffPath]); } catch { /* ignore cleanup errors */ }
  }

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