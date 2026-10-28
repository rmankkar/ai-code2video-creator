/**
 * Sample Script - Matches existing Short.tsx content
 * Used for testing the script-driven rendering pipeline
 */

import { VideoScript } from '../types/script';

export const sampleScript: VideoScript = {
  title: 'THE FUTURE OF QA - AI × QUALITY × ENGINEERING',
  durationFrames: 600,
  fps: 30,
  width: 1080,
  height: 1920,
  scenes: [
    {
      startFrame: 0,
      endFrame: 150,
      tag: 'THE FUTURE OF QA',
      kicker: 'QUALITY ENGINEERING',
      lines: ['TEST', 'SMARTER.'],
      accentLineIndex: 1,
      description: 'AI is changing how we build quality.',
      narration: 'The future of quality assurance is here. AI is fundamentally changing how we build and test software.',
      icon: '✳',
    },
    {
      startFrame: 150,
      endFrame: 300,
      tag: '01 / INTELLIGENCE',
      kicker: 'LESS MANUAL WORK',
      lines: ['AI-POWERED', 'TESTING.'],
      accentLineIndex: 1,
      description: 'Generate test cases from requirements.',
      narration: 'First, intelligence. AI-powered testing generates comprehensive test cases directly from requirements, eliminating hours of manual work.',
      icon: '⌘',
    },
    {
      startFrame: 300,
      endFrame: 450,
      tag: '02 / AUTOMATION',
      kicker: 'CATCH BUGS EARLIER',
      lines: ['FIND', 'HIDDEN BUGS.'],
      accentLineIndex: 1,
      description: 'Spot risks. Analyze failures. Speed up RCA.',
      narration: 'Second, automation. Advanced AI spots hidden bugs earlier, analyzes failure patterns, and dramatically speeds up root cause analysis.',
      icon: '⌁',
    },
    {
      startFrame: 450,
      endFrame: 600,
      tag: '03 / THE NEXT LEVEL',
      kicker: 'HUMANS + AI',
      lines: ['QUALITY', 'AT SCALE.'],
      accentLineIndex: 1,
      description: 'Engineers lead. AI accelerates.',
      narration: 'The next level: humans and AI together. Engineers lead strategy while AI accelerates execution, delivering quality at unprecedented scale.',
      icon: '↗',
    },
  ],
  metadata: {
    generatedAt: new Date().toISOString(),
    model: 'sample',
    prompt: 'Sample script matching original Short.tsx',
    version: '1.0.0',
  },
  globalNarration: 'Welcome to the future of Quality Engineering.',
};