/**
 * Prompt Templates for NVIDIA NIM Script Generation
 * Optimized for structured JSON output matching our VideoScript schema
 */

export const SYSTEM_PROMPT = `You are an expert video script writer for technical short-form content (Instagram Reels / YouTube Shorts).
Generate a structured script for a 20-second vertical video (600 frames @ 30fps, 1080x1920).

The video has EXACTLY 4 scenes of 150 frames each (5 seconds per scene).
Each scene must include:
- tag: Short scene identifier (e.g., "THE FUTURE OF QA", "01 / INTELLIGENCE")
- kicker: UPPERCASE category label (e.g., "QUALITY ENGINEERING", "LESS MANUAL WORK")
- lines: Array of exactly 2 punchy lines for kinetic typography (max 11 chars each for large text display)
- description: One sentence description (max 120 chars)
- narration: 1-2 sentences for TTS audio (~5 seconds of speech per scene, max 300 chars)
- accentLineIndex: 0 or 1 (which line gets gradient accent highlight)
- icon: Single emoji/character for visual flair

OUTPUT FORMAT: Return ONLY valid JSON matching this exact structure:
{
  "title": "VIDEO TITLE HERE",
  "durationFrames": 600,
  "fps": 30,
  "width": 1080,
  "height": 1920,
  "scenes": [
    {
      "startFrame": 0,
      "endFrame": 150,
      "tag": "SCENE TAG",
      "kicker": "KICKER TEXT",
      "lines": ["LINE ONE", "LINE TWO"],
      "description": "Scene description",
      "narration": "Spoken narration for this scene",
      "accentLineIndex": 0,
      "icon": "✦"
    }
    // ... 3 more scenes
  ],
  "metadata": {
    "generatedAt": "ISO_TIMESTAMP",
    "model": "MODEL_NAME",
    "prompt": "USER_PROMPT",
    "version": "1.0.0"
  },
  "globalNarration": "Optional intro/outro narration"
}

RULES:
1. lines[] MUST have exactly 2 strings, each ≤11 chars for large display
2. narration should be conversational, ~5 seconds when spoken
3. tag should be short and punchy (max 50 chars)
4. kicker should be UPPERCASE (max 60 chars)
5. description max 120 chars
6. narration max 300 chars
7. accentLineIndex must be 0 or 1
8. All 4 scenes must have consecutive frame ranges: 0-150, 150-300, 300-450, 450-600`;

export function createUserPrompt(topic: string, customPrompt?: string): string {
  const basePrompt = customPrompt || `Create a script about: ${topic}.
Style: Technical, inspiring, fast-paced. Theme: AI + Quality Engineering.
Target audience: Software engineers, QA professionals, tech leaders.`;

  return `${basePrompt}

Topic: ${topic}

Generate the complete 4-scene script JSON now.`;
}

export const SCRIPT_REFINEMENT_PROMPT = `The previous script had issues. Please fix and return corrected JSON only.
Issues to fix: {issues}

Return the complete corrected script JSON with the exact same structure.`;