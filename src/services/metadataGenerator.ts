/**
 * YouTube Shorts Metadata Generator
 * Uses NVIDIA NIM to generate title, description, tags, and first comment
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import {
  YouTubeMetadata,
  MetadataGeneratorOptions,
  MetadataGeneratorResult,
  YOUTUBE_LIMITS,
} from '../types/metadata.js';
import { validateScript } from '../types/script.js';
import { getNIMClient } from '../lib/nimClient.js';

/**
 * Build the prompt for metadata generation
 */
function buildMetadataPrompt(options: MetadataGeneratorOptions): string {
  const { topic, scriptTitle, scenes, customPrompt, audience = 'gamers', durationSeconds = 60 } = options;

  const sceneContext = scenes.map((s, i) =>
    `Scene ${i + 1}: ${s.narration.slice(0, 150)}...`
  ).join('\n');

  const audienceGuidance = {
    general: 'Accessible to everyone, avoid jargon',
    gamers: 'Use gaming terminology, reference games/mechanics',
    tech: 'Technical depth, mention specs/tech details',
    casual: 'Fun, conversational, emoji-friendly',
  }[audience];

  return `You are a YouTube Shorts metadata expert. Generate optimized metadata for a 60-second vertical video.

VIDEO CONTEXT:
- Topic: "${topic}"
- Script Title: "${scriptTitle}"
- Duration: ~${durationSeconds} seconds
- Target Audience: ${audience} (${audienceGuidance})
- Scenes Summary:
${sceneContext}

${customPrompt ? `CUSTOM INSTRUCTIONS: ${customPrompt}` : ''}

REQUIREMENTS:
1. TITLE: Catchy, click-worthy, max ${YOUTUBE_LIMITS.TITLE_MAX} chars. Include hooks like "Why...", "How...", "The Truth About...", "Stop...", "Don't...". No clickbait - must deliver on promise.
2. DESCRIPTION: 2-3 engaging sentences + 8-12 relevant hashtags (including #Shorts). First 2 lines are critical for preview.
3. TAGS: 10-15 comma-separated keywords for YouTube tags box. Mix broad + specific.
4. FIRST COMMENT: Pinned comment to boost engagement. Ask a question, share a hot take, or add value. Max ${YOUTUBE_LIMITS.COMMENT_MAX} chars. Natural, not promotional.

OUTPUT FORMAT (JSON only, no markdown):
{
  "title": "string",
  "description": "string",
  "tags": "tag1, tag2, tag3, ...",
  "firstComment": "string"
}`;
}

/**
 * Parse and validate the LLM response
 */
function parseMetadataResponse(response: string, scriptTitle: string): YouTubeMetadata {
  let parsed: Record<string, unknown>;

  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in response');
    }
  } catch (e) {
    throw new Error(`Failed to parse metadata response: ${e}`);
  }

  // Validate and sanitize
  const title = String(parsed.title || scriptTitle).slice(0, YOUTUBE_LIMITS.TITLE_MAX);
  const description = String(parsed.description || '').slice(0, YOUTUBE_LIMITS.DESCRIPTION_MAX);
  const tags = String(parsed.tags || '').slice(0, YOUTUBE_LIMITS.TAGS_MAX);
  const firstComment = String(parsed.firstComment || '').slice(0, YOUTUBE_LIMITS.COMMENT_MAX);

  // Ensure hashtags in description
  const hasShortsTag = /#shorts/i.test(description);
  const finalDescription = hasShortsTag ? description : `${description}\n\n#Shorts #Gaming #VideoGames`;

  return {
    title,
    description: finalDescription,
    tags,
    firstComment,
    meta: {
      generatedAt: new Date().toISOString(),
      model: process.env.NVIDIA_NIM_MODEL || 'unknown',
      scriptTitle,
      topic: '',
    },
  };
}

/**
 * Generate metadata using NVIDIA NIM
 */
export async function generateMetadata(options: MetadataGeneratorOptions): Promise<MetadataGeneratorResult> {
  const client = getNIMClient();
  const prompt = buildMetadataPrompt(options);

  const response = await client.generateStructuredOutput<{
    title: string;
    description: string;
    tags: string;
    firstComment: string;
  }>(
    'You are a YouTube Shorts metadata expert. Output ONLY valid JSON.',
    prompt
  );

  const rawResponse = JSON.stringify(response);
  const metadata = parseMetadataResponse(rawResponse, options.scriptTitle);
  metadata.meta.topic = options.topic;

  return { metadata, rawResponse };
}

/**
 * Generate metadata with retry logic
 */
export async function generateMetadataWithRetry(
  options: MetadataGeneratorOptions,
  maxRetries = 3
): Promise<MetadataGeneratorResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateMetadata(options);
    } catch (error) {
      lastError = error as Error;
      console.warn(`⚠️  Metadata generation attempt ${attempt} failed: ${lastError.message}`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw new Error(`Failed to generate metadata after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Load script and generate metadata
 */
export async function generateMetadataFromScript(
  scriptPath: string,
  options: Partial<MetadataGeneratorOptions> = {}
): Promise<MetadataGeneratorResult> {
  const scriptContent = readFileSync(scriptPath, 'utf-8');
  const script = validateScript(JSON.parse(scriptContent));

  const metadataOptions: MetadataGeneratorOptions = {
    topic: options.topic || script.metadata?.prompt || script.title,
    scriptTitle: script.title,
    scenes: script.scenes.map(s => ({
      narration: s.narration,
      description: s.description,
    })),
    customPrompt: options.customPrompt,
    audience: options.audience,
    durationSeconds: options.durationSeconds,
  };

  return generateMetadataWithRetry(metadataOptions);
}

/**
 * Save metadata to files
 */
export function saveMetadata(
  metadata: YouTubeMetadata,
  outputDir: string = resolve('src/generated')
): { jsonPath: string; txtPath: string } {
  mkdirSync(outputDir, { recursive: true });

  // JSON for programmatic use
  const jsonPath = resolve(outputDir, 'youtube-metadata.json');
  writeFileSync(jsonPath, JSON.stringify(metadata, null, 2));

  // Human-readable text file
  const txtPath = resolve(outputDir, 'youtube-metadata.txt');
  const txtContent = `📺 YOUTUBE SHORTS METADATA
Generated: ${metadata.meta.generatedAt}
Model: ${metadata.meta.model}
Topic: ${metadata.meta.topic}
Script: ${metadata.meta.scriptTitle}

═══════════════════════════════════════
TITLE (${metadata.title.length}/${YOUTUBE_LIMITS.TITLE_MAX} chars)
═══════════════════════════════════════
${metadata.title}

═══════════════════════════════════════
DESCRIPTION
═══════════════════════════════════════
${metadata.description}

═══════════════════════════════════════
TAGS (for YouTube tags box)
═══════════════════════════════════════
${metadata.tags}

═══════════════════════════════════════
FIRST COMMENT (pinned)
═══════════════════════════════════════
${metadata.firstComment}
`;
  writeFileSync(txtPath, txtContent);

  return { jsonPath, txtPath };
}