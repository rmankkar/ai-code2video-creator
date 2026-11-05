/**
 * Cross-Platform TTS Generator
 * Supports macOS (say), Windows (SAPI), and Linux (espeak)
 * Free, offline, built-in text-to-speech on all platforms
 *
 * macOS voices: say -v '?'
 * Windows voices: PowerShell GetInstalledVoices
 * Linux voices: espeak --voices
 */

import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { AudioSegment, AudioManifest, validateAudioManifest, ScriptScene } from '../types/script';
import { VIDEO_CONFIG } from '../config/video';

// Platform detection
const IS_MACOS = process.platform === 'darwin';
const IS_WINDOWS = process.platform === 'win32';
const IS_LINUX = process.platform === 'linux';

export interface TTSOptions {
  voice: string;
  rate: number; // words per minute
  outputDir: string;
  scriptTitle: string;
  enablePostProcessing?: boolean; // ffmpeg loudnorm + fades + compression
  enableSSML?: boolean; // use SSML prosody markup for natural pacing (macOS only)
}

// Platform-specific default voices
const DEFAULT_VOICES = {
  darwin: 'Samantha',
  win32: 'Microsoft David Desktop',
  linux: 'en_US',
};

const DEFAULT_TTS_OPTIONS: TTSOptions = {
  voice: process.env.TTS_VOICE || DEFAULT_VOICES[process.platform as keyof typeof DEFAULT_VOICES] || 'Samantha',
  rate: parseInt(process.env.TTS_RATE || '165', 10),
  outputDir: resolve('public/audio'),
  scriptTitle: 'generated',
  enablePostProcessing: true,
  enableSSML: IS_MACOS, // SSML only supported on macOS with `say`
};

// Voice fallback chains per platform
const VOICE_FALLBACKS: Record<string, string[]> = {
  darwin: ['Samantha', 'Alex', 'Victoria', 'Daniel', 'Fred', 'Susan'],
  win32: ['Microsoft David Desktop', 'Microsoft Zira Desktop'],
  linux: ['en_US', 'en', 'english'],
};

/**
 * Phase 3 — Text Preprocessing
 * Convert written narration into speakable text.
 * SSML is only used on macOS; other platforms get plain text.
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
    const regex = new RegExp(`\\b${abbr}\\b`, 'g');
    result = result.replace(regex, spoken);
  }
  return result;
}

function convertSymbols(text: string): string {
  return text
    .replace(/(\d+)\s*-\s*(\d+)%/g, (_m, a, b) => `${numberToWords(a)} to ${numberToWords(b)} percent`)
    .replace(/(\d+)%/g, (_m, n) => `${numberToWords(n)} percent`)
    .replace(/\$(\d+)/g, (_m, n) => `${numberToWords(n)} dollars`)
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' plus ')
    .replace(/(\d+)x(\d+)/g, (_m, a, b) => `${numberToWords(a)} by ${numberToWords(b)}`);
}

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
  return nStr;
}

/**
 * Add SSML break tags between sentences (macOS only).
 */
function addSentenceBreaks(text: string): string {
  return text.replace(/([.!?])\s+/g, '$1<break time="350ms"/> ');
}

function wrapInSSML(text: string): string {
  return `<speak>${text}</speak>`;
}

function preprocessForTTS(text: string, useSSML: boolean): string {
  let result = expandAbbreviations(text);
  result = convertSymbols(result);
  if (useSSML && IS_MACOS) {
    result = addSentenceBreaks(result);
    result = wrapInSSML(result);
  }
  return result;
}

/**
 * Phase 1 — Resolve voice with fallback chain per platform.
 */
function resolveVoice(requested: string): string {
  const fallbacks = VOICE_FALLBACKS[process.platform] || VOICE_FALLBACKS.darwin;
  if (voiceExists(requested)) return requested;
  for (const fallback of fallbacks) {
    if (voiceExists(fallback)) return fallback;
  }
  return requested;
}

function voiceExists(voice: string): boolean {
  if (IS_MACOS) {
    const result = spawnSync('say', ['-v', '?'], { encoding: 'utf-8' });
    if (result.status !== 0) return false;
    return result.stdout.split('\n').some((line) => line.startsWith(voice + ' '));
  }
  if (IS_WINDOWS) {
    const psScript = `
      Add-Type -AssemblyName System.Speech
      $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
      $voices = $s.GetInstalledVoices()
      foreach ($v in $voices) { if ($v.VoiceInfo.Name -eq '${voice.replace(/'/g, "''")}') { exit 0 } }
      exit 1
    `;
    const result = spawnSync('powershell', ['-NoProfile', '-Command', psScript], { encoding: 'utf-8' });
    return result.status === 0;
  }
  if (IS_LINUX) {
    const result = spawnSync('espeak', ['--voices'], { encoding: 'utf-8' });
    if (result.status !== 0) return false;
    return result.stdout.includes(voice);
  }
  return false;
}

/**
 * Get available voices for current platform
 */
export function getAvailableVoices(): string[] {
  if (IS_MACOS) {
    const result = spawnSync('say', ['-v', '?'], { encoding: 'utf-8' });
    if (result.status !== 0) return [];
    return result.stdout
      .split('\n')
      .map(line => line.split(' ')[0])
      .filter(Boolean);
  }
  if (IS_WINDOWS) {
    const psScript = `
      Add-Type -AssemblyName System.Speech
      $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
      $voices = $s.GetInstalledVoices()
      foreach ($v in $voices) { $v.VoiceInfo.Name }
    `;
    const result = spawnSync('powershell', ['-NoProfile', '-Command', psScript], { encoding: 'utf-8' });
    if (result.status !== 0) return [];
    return result.stdout.trim().split('\n').filter(Boolean);
  }
  if (IS_LINUX) {
    const result = spawnSync('espeak', ['--voices'], { encoding: 'utf-8' });
    if (result.status !== 0) return [];
    // Parse espeak --voices output
    return result.stdout
      .split('\n')
      .slice(1) // skip header
      .map(line => line.trim().split(/\s+/)[3]) // language column
      .filter(Boolean);
  }
  return [];
}

/**
 * Phase 4 — Audio post-processing with ffmpeg.
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

  const fadeDur = Math.min(0.1, durationSec / 2);

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
 * Cross-platform file deletion using Node.js fs (more reliable than shell commands)
 */
function deleteFile(filePath: string): void {
  try { unlinkSync(filePath); } catch { /* ignore cleanup errors */ }
}

/**
 * Generate audio using macOS `say` command
 */
function generateWithSay(
  text: string,
  voice: string,
  rate: number,
  outputPath: string,
  useSSML: boolean
): void {
  const args = ['-v', voice, '-r', String(rate), '-o', outputPath];
  if (useSSML) {
    args.push('-f', '-');
  } else {
    args.push(text);
  }

  const result = spawnSync('say', args, {
    input: useSSML ? text : undefined,
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    throw new Error(`say command failed: ${result.stderr}`);
  }
}

/**
 * Generate audio using Windows SAPI (PowerShell)
 */
function generateWithWindowsSAPI(
  text: string,
  voice: string,
  rate: number,
  outputPath: string
): void {
  // Convert rate (words per minute) to SAPI rate (-10 to 10)
  // 165 wpm ≈ 0 (default), 200+ wpm ≈ positive, slower ≈ negative
  const sapiRate = Math.max(-10, Math.min(10, Math.round((rate - 165) / 10)));

  // Escape single quotes for PowerShell
  const escapedText = text.replace(/'/g, "''");
  const escapedVoice = voice.replace(/'/g, "''");
  const escapedOutput = outputPath.replace(/'/g, "''").replace(/\\/g, '\\\\');

  const psScript = `
    Add-Type -AssemblyName System.Speech
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $synth.Rate = ${sapiRate}
    $synth.SelectVoice('${escapedVoice}')
    $synth.SetOutputToWaveFile('${escapedOutput}')
    $synth.Speak('${escapedText}')
    $synth.Dispose()
  `;

  const result = spawnSync('powershell', ['-NoProfile', '-Command', psScript], { encoding: 'utf-8' });

  if (result.status !== 0) {
    throw new Error(`Windows SAPI TTS failed: ${result.stderr}`);
  }
}

/**
 * Generate audio using Linux espeak
 */
function generateWithEspeak(
  text: string,
  voice: string,
  rate: number,
  outputPath: string
): void {
  // espeak uses -s for speed (words per minute), -v for voice
  const result = spawnSync('espeak', [
    '-v', voice,
    '-s', String(rate),
    '-w', outputPath,
    text
  ], { encoding: 'utf-8' });

  if (result.status !== 0) {
    throw new Error(`espeak TTS failed: ${result.stderr}`);
  }
}

/**
 * Generate audio for a single scene using platform-appropriate TTS
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
  const wavPath = resolve(outputDir, `scene-${sceneIndex}-${timestamp}.wav`);
  const processedWavPath = resolve(outputDir, `scene-${sceneIndex}-${timestamp}-processed.wav`);
  const mp3Path = resolve(outputDir, `scene-${sceneIndex}-${timestamp}.mp3`);

  console.log(`🔊 Generating audio for scene ${sceneIndex} (${scene.narration.length} chars, voice: ${voice}, rate: ${rate}wpm, platform: ${process.platform})...`);

  // Phase 3: preprocess narration text
  const preprocessed = preprocessForTTS(scene.narration, enableSSML);

  // Step 1: Generate WAV using platform-specific TTS
  if (IS_MACOS) {
    generateWithSay(preprocessed, voice, rate, wavPath, enableSSML);
  } else if (IS_WINDOWS) {
    generateWithWindowsSAPI(preprocessed, voice, rate, wavPath);
  } else if (IS_LINUX) {
    generateWithEspeak(preprocessed, voice, rate, wavPath);
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }

  if (!existsSync(wavPath)) {
    throw new Error(`Audio file not created: ${wavPath}`);
  }

  // Phase 4: post-process audio (loudnorm, compression, fades)
  let finalWavPath = wavPath;
  if (enablePostProcessing) {
    postProcessAudio(wavPath, processedWavPath);
    finalWavPath = processedWavPath;
    deleteFile(wavPath);
  }

  // Step 2: Convert WAV to MP3 using ffmpeg
  const ffmpegResult = spawnSync('ffmpeg', [
    '-y',
    '-i', finalWavPath,
    '-codec:a', 'libmp3lame',
    '-q:a', '2',
    mp3Path
  ], { encoding: 'utf-8' });

  if (ffmpegResult.status !== 0) {
    throw new Error(`ffmpeg conversion failed: ${ffmpegResult.stderr}`);
  }

  // Clean up processed WAV if different from original
  if (finalWavPath !== wavPath) {
    deleteFile(finalWavPath);
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

  let durationMs = 5000;
  if (probeResult.status === 0 && probeResult.stdout.trim()) {
    durationMs = Math.round(parseFloat(probeResult.stdout.trim()) * 1000);
  }

  // Calculate frame timing based on ACTUAL audio duration
  const fps = VIDEO_CONFIG.fps;
  const startFrame = previousEndFrame;
  const endFrame = startFrame + Math.ceil(durationMs / 1000 * fps);

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
 * Concatenate multiple audio files into a single file using ffmpeg
 */
function concatenateAudioFiles(mp3Paths: string[], outputPath: string): void {
  const concatListPath = resolve(dirname(outputPath), 'concat-list.txt');
  const concatContent = mp3Paths.map(p => `file '${p}'`).join('\n');
  writeFileSync(concatListPath, concatContent);

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

  deleteFile(concatListPath);
}

export async function generateAudioForScript(
  scenes: ScriptScene[],
  options: Partial<TTSOptions> = {}
): Promise<AudioManifest> {
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
  console.log(`   Platform: ${process.platform} | Voice: ${mergedOptions.voice} | Rate: ${mergedOptions.rate} wpm`);

  for (let i = 0; i < scenes.length; i++) {
    const segment = generateSceneAudio(scenes[i], i, mergedOptions, previousEndFrame);
    segments.push(segment);
    totalDurationMs += segment.durationMs;
    previousEndFrame = segment.endFrame;
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

  const manifest: AudioManifest = {
    scriptVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    segments,
    totalDurationMs: concatDurationMs,
    fullAudioPath: `/audio/${basename(concatMp3Path)}`,
  };

  const manifestPath = resolve('src/generated/audio-manifest.json');
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

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
 * Validate dependencies per platform
 */
function commandExists(cmd: string): boolean {
  const isWindows = process.platform === 'win32';
  const checkCmd = isWindows ? 'where' : 'which';
  const result = spawnSync(checkCmd, [cmd], { encoding: 'utf-8' });
  return result.status === 0;
}

export function checkDependencies(): { ffmpeg: boolean; tts: boolean; ffprobe: boolean; platform: string } {
  const ffmpeg = commandExists('ffmpeg');
  const ffprobe = commandExists('ffprobe');

  // Check platform-specific TTS
  let tts = false;
  if (IS_MACOS) {
    tts = commandExists('say');
  } else if (IS_WINDOWS) {
    // Windows always has SAPI built-in
    tts = true;
  } else if (IS_LINUX) {
    tts = commandExists('espeak');
  }

  if (!ffmpeg) console.warn('⚠️  ffmpeg not found. Install: https://ffmpeg.org/download.html');
  if (!tts) {
    if (IS_MACOS) console.warn('⚠️  say command not found (macOS only)');
    else if (IS_LINUX) console.warn('⚠️  espeak not found. Install: sudo apt install espeak');
  }
  if (!ffprobe) console.warn('⚠️  ffprobe not found (comes with ffmpeg)');

  return { ffmpeg, tts, ffprobe, platform: process.platform };
}