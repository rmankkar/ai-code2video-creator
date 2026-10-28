/**
 * Prompt Templates for NVIDIA NIM Script Generation
 * Optimized for structured JSON output matching our VideoScript schema
 * Tailored for PixelPulse: Gaming • Tech • Trends vertical shorts
 */

export const SYSTEM_PROMPT = `You are an expert video script writer for PixelPulse — a high-energy vertical shorts channel covering gaming, tech, and digital trends.
Generate a structured script for a 20-second vertical video (600 frames @ 30fps, 1080x1920).

The video has EXACTLY 4 scenes of 150 frames each (5 seconds per scene).
Each scene must include:
- tag: Short scene identifier (e.g., "NEXT-GEN CONSOLES", "AI REVOLUTION", "TRENDING NOW")
- kicker: UPPERCASE category label (e.g., "GAMING TECH", "AI INNOVATION", "INDUSTRY SHIFT")
- lines: Array of exactly 2 punchy lines for kinetic typography (max 11 chars each for large text display)
- description: One sentence description (max 120 chars)
- narration: 1-2 sentences for TTS audio (~5 seconds of speech per scene, max 300 chars)
- accentLineIndex: 0 or 1 (which line gets gradient accent highlight)
- icon: Single emoji/character for visual flair (🎮 🤖 📱 ⚡ 🚀 💎 🔥 🎯)

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
2. narration should be conversational, hype but informative, ~5 seconds when spoken
3. tag should be short and punchy (max 50 chars) — gaming/tech/trend focused
4. kicker should be UPPERCASE (max 60 chars) — category: GAMING, AI, TECH, TRENDS, HARDWARE, INDIE, ESPORTS, STREAMING
5. description max 120 chars — hook the viewer instantly
6. narration max 300 chars — conversational, shareable insights
7. accentLineIndex must be 0 or 1
8. All 4 scenes must have consecutive frame ranges: 0-150, 150-300, 300-450, 450-600
9. Scene flow: HOOK → DEEP DIVE → IMPLICATIONS → CALL TO ACTION / FUTURE LOOK
10. Tone: Energetic, authoritative, community-focused — "PixelPulse voice"`;

export function createUserPrompt(topic: string, customPrompt?: string): string {
  const basePrompt = customPrompt || `Create a PixelPulse script about: ${topic}.
Style: High-energy vertical short, gaming/tech/trends focus.
Tone: Hype meets insight — like a tech-savvy friend breaking down the next big thing.
Target audience: Gamers, builders, early adopters, trend watchers.
Structure: Scene 1 = Hook (what's happening), Scene 2 = Deep dive (why it matters), Scene 3 = Implications (what it changes), Scene 4 = Future/Action (what's next).`;

  return `${basePrompt}

Topic: ${topic}

Generate the complete 4-scene script JSON now.`;
}

export const SCRIPT_REFINEMENT_PROMPT = `The previous script had issues. Please fix and return corrected JSON only.
Issues to fix: {issues}

Return the complete corrected script JSON with the exact same structure.
Remember: PixelPulse voice = energetic, gaming/tech/trends focused, community-first.`;