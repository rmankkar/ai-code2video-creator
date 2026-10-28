/**
 * Script Generation Service
 * Orchestrates NVIDIA NIM calls to generate structured video scripts
 */

import { getNIMClient } from '../lib/nimClient.js';
import { SYSTEM_PROMPT, createUserPrompt } from '../lib/prompts.js';
import { VideoScript, validateScript, createEmptyScript } from '../types/script.js';
import { VIDEO_CONFIG } from '../config/video.js';

export interface ScriptGenerationOptions {
  topic: string;
  customPrompt?: string;
  model?: string;
}

export interface ScriptGenerationResult {
  script: VideoScript;
  rawResponse: string;
  tokensUsed: number;
  generationTimeMs: number;
}

function validateSceneStructure(script: VideoScript): string[] {
  const errors: string[] = [];

  if (script.scenes.length !== VIDEO_CONFIG.numScenes) {
    errors.push(`Expected ${VIDEO_CONFIG.numScenes} scenes, got ${script.scenes.length}`);
  }

  script.scenes.forEach((scene, i) => {
    const expectedStart = i * VIDEO_CONFIG.sceneDurationFrames;
    const expectedEnd = (i + 1) * VIDEO_CONFIG.sceneDurationFrames;

    if (scene.startFrame !== expectedStart) {
      errors.push(`Scene ${i}: startFrame should be ${expectedStart}, got ${scene.startFrame}`);
    }
    if (scene.endFrame !== expectedEnd) {
      errors.push(`Scene ${i}: endFrame should be ${expectedEnd}, got ${scene.endFrame}`);
    }
    if (scene.lines.length !== 2) {
      errors.push(`Scene ${i}: lines must have exactly 2 elements, got ${scene.lines.length}`);
    }
    if (scene.accentLineIndex < 0 || scene.accentLineIndex > 1) {
      errors.push(`Scene ${i}: accentLineIndex must be 0 or 1, got ${scene.accentLineIndex}`);
    }
    if (scene.lines.some(line => line.length > 11)) {
      errors.push(`Scene ${i}: lines must be ≤11 chars for large display`);
    }
  });

  return errors;
}

function fixSceneFrames(script: VideoScript): VideoScript {
  return {
    ...script,
    durationFrames: VIDEO_CONFIG.durationInFrames,
    fps: VIDEO_CONFIG.fps,
    width: VIDEO_CONFIG.width,
    height: VIDEO_CONFIG.height,
    scenes: script.scenes.map((scene, i) => ({
      ...scene,
      startFrame: i * VIDEO_CONFIG.sceneDurationFrames,
      endFrame: (i + 1) * VIDEO_CONFIG.sceneDurationFrames,
    })),
  };
}

export async function generateScript(
  options: ScriptGenerationOptions
): Promise<ScriptGenerationResult> {
  const client = getNIMClient();
  const startTime = Date.now();

  const userPrompt = createUserPrompt(options.topic, options.customPrompt);

  console.log(`🎬 Generating script for: "${options.topic}"`);
  console.log(`   Using model: ${process.env.NVIDIA_NIM_MODEL}`);

  let rawResponse = '';
  let script: VideoScript;

  try {
    // First attempt
    const result = await client.generateStructuredOutput<VideoScript>(
      SYSTEM_PROMPT,
      userPrompt
    );

    rawResponse = JSON.stringify(result);
    script = validateScript(result);

    // Validate and fix structure
    const errors = validateSceneStructure(script);
    if (errors.length > 0) {
      console.log(`⚠️  Structure issues found, auto-fixing: ${errors.join(', ')}`);
      script = fixSceneFrames(script);
      // Re-validate after fix
      script = validateScript(script);
    }

  } catch (error) {
    console.error(`❌ Script generation failed: ${error}`);
    throw error;
  }

  const generationTimeMs = Date.now() - startTime;

  // Estimate tokens (rough approximation)
  const tokensUsed = Math.ceil((SYSTEM_PROMPT.length + userPrompt.length + rawResponse.length) / 4);

  console.log(`✅ Script generated in ${generationTimeMs}ms (~${tokensUsed} tokens)`);

  return {
    script,
    rawResponse,
    tokensUsed,
    generationTimeMs,
  };
}

export async function generateScriptWithRetry(
  options: ScriptGenerationOptions,
  maxRetries: number = 2
): Promise<ScriptGenerationResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await generateScript(options);
    } catch (error) {
      lastError = error as Error;
      console.log(`⚠️  Attempt ${attempt + 1} failed: ${error}`);

      if (attempt < maxRetries) {
        console.log(`   Retrying with adjusted prompt...`);
        // Add more explicit instruction on retry
        options.customPrompt = (options.customPrompt || '') + '\n\nIMPORTANT: Return ONLY valid JSON matching the exact structure. No markdown, no explanation.';
      }
    }
  }

  throw new Error(`Script generation failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
}

// Export for CLI use
export { validateScript, createEmptyScript };