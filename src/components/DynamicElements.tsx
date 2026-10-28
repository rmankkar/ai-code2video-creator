/**
 * DynamicElements — Data-driven viral hooks for PixelPulse
 * Renders Comment Ticker, Trend Pulse Line, and Creator Watermark
 * All content derived from script + audioManifest at render time
 */

import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { VideoScript, AudioManifest, ViralHooks } from "../types/script";
import { VIDEO_CONFIG } from "../config/video";

const C = VIDEO_CONFIG.colors;
const SAFE_BOTTOM = 400; // hard 200px bottom margin

// Simple seeded PRNG for deterministic "randomness"
function mulberry32(a: number) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface DynamicElementsProps {
  script: VideoScript;
  audioManifest: AudioManifest;
  viralHooks?: ViralHooks;
}

function generateCommentLines(script: VideoScript, count: number = 8): string[] {
  const pool: string[] = [];
  const keywords = script.scenes.flatMap(s =>
    s.narration
      .toLowerCase()
      .match(/\b(ai|gpu|npu|console|ps6|xbox|neural|fps|ray tracing|upscale|latency|cloud|edge|inference|model)\b/gi) || []
  );
  const uniqueKeywords = [...new Set(keywords)];

  const templates = [
    (kw: string) => `${kw.toUpperCase()} IS THE FUTURE`,
    (kw: string) => `JUST GOT ${kw.toUpperCase()} ON MY RIG`,
    (kw: string) => `${kw.toUpperCase()} CHANGES EVERYTHING`,
    (kw: string) => `WAIT ${kw.toUpperCase()} IS REAL??`,
    (kw: string) => `MY ${kw.toUpperCase()} BUILD INCOMING`,
    () => "PIXELPULSE NEVER MISSES",
    () => "THIS IS THE CONTENT I SUB FOR",
    () => "NOTIFICATION SQUAD WHERE U AT",
    () => "ALGO BROUGHT ME HERE AGAIN",
    () => "SAVED FOR LATER REFERENCE",
  ];

  const rng = mulberry32(hashString(script.title + script.metadata.generatedAt));

  // Keyword-based lines
  uniqueKeywords.forEach(kw => {
    if (pool.length >= count) return;
    const tpl = templates[Math.floor(rng() * (templates.length - 4))];
    pool.push(tpl(kw));
  });

  // Generic hype lines
  while (pool.length < count) {
    const tpl = templates[Math.floor(rng() * 4) + templates.length - 4];
    pool.push(tpl(""));
  }

  return pool.slice(0, count);
}

export const DynamicElements: React.FC<DynamicElementsProps> = ({
  script,
  audioManifest,
  viralHooks,
}) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  // Merge defaults with provided config
  const hooks = useMemo(() => ({
    commentTicker: {
      enabled: true,
      lines: generateCommentLines(script, 10),
      speed: 28,
      ...viralHooks?.commentTicker,
    },
    trendPulse: {
      enabled: true,
      height: 10,
      color: C.cyan,
      samples: 60,
      ...viralHooks?.trendPulse,
    },
    watermark: {
      enabled: true,
      handle: "@PixelPulse",
      glitchInterval: 180,
      opacity: 0.3,
      ...viralHooks?.watermark,
    },
  }), [script, viralHooks]);

  // ─── Comment Ticker ───
  const tickerY = height - SAFE_BOTTOM - 48;
  const tickerLines = hooks.commentTicker.enabled ? hooks.commentTicker.lines : [];
  const tickerSpeed = hooks.commentTicker.speed; // px/sec
  const tickerOffset = (frame / fps) * tickerSpeed;
  const lineHeight = 24;
  const totalTickerWidth = tickerLines.reduce((sum, l) => sum + l.length * 9 + 40, 0);

  // ─── Trend Pulse Line ───
  const pulseY = height - SAFE_BOTTOM - 4;
  const pulseSamples = hooks.trendPulse.samples;
  const pulseHeight = hooks.trendPulse.height;
  const pulseColor = hooks.trendPulse.color;

  // Generate base waveform shape from audio segment durations (memoized)
  const baseWaveform = useMemo(() => {
    if (!hooks.trendPulse.enabled || !audioManifest?.segments?.length) return [];
    const segs = audioManifest.segments;
    const totalDur = segs.reduce((s, seg) => s + seg.durationMs, 1);
    const samples: number[] = [];
    for (let i = 0; i < pulseSamples; i++) {
      const t = (i / pulseSamples) * totalDur;
      let accum = 0;
      let idx = 0;
      for (const seg of segs) {
        if (t >= accum && t < accum + seg.durationMs) {
          // Base amplitude varies by segment
          const noise = Math.sin(idx * 7.3 + t * 0.001) * 0.4 + 0.6;
          samples.push(noise);
          break;
        }
        accum += seg.durationMs;
        idx++;
      }
      if (samples.length <= i) samples.push(0.5);
    }
    return samples;
  }, [audioManifest, pulseSamples]);

  // Animate waveform per frame using base shape + time-varying noise
  const waveform = baseWaveform.map((baseAmp, i) => {
    // Add frame-based animation: each bar oscillates at different frequency
    const time = frame / fps;
    const freq = 0.5 + (i % 7) * 0.3; // Varied frequency per bar
    const phase = i * 1.7; // Phase offset per bar
    const animatedNoise = Math.sin(time * freq * 10 + phase) * 0.3 + 0.7;
    return baseAmp * animatedNoise;
  });

  // ─── Creator Watermark ───
  const wm = hooks.watermark;
  const glitchPhase = Math.floor(frame / wm.glitchInterval) % 2 === 1;
  const glitchOffset = glitchPhase ? (Math.sin(frame * 0.5) * 2) : 0;

  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 100 }}>
      {/* Comment Ticker — scrolls horizontally */}
      {hooks.commentTicker.enabled && tickerLines.length > 0 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: tickerY,
            width: "100%",
            height: lineHeight,
            overflow: "hidden",
            whiteSpace: "nowrap",
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 21,
            fontWeight: 600,
            color: C.muted,
            opacity: 0.7,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              gap: 40,
              transform: `translateX(${-tickerOffset % totalTickerWidth}px)`,
              willChange: "transform",
            }}
          >
            {tickerLines.map((line, i) => (
              <span key={i} style={{ padding: "0 20px", whiteSpace: "nowrap" }}>
                {line}
              </span>
            ))}
            {/* Duplicate for seamless loop */}
            {tickerLines.map((line, i) => (
              <span key={i + 100} style={{ padding: "0 20px", whiteSpace: "nowrap" }}>
                {line}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Trend Pulse Line — audio-reactive waveform bar */}
      {hooks.trendPulse.enabled && waveform.length > 0 && (
        <div
          style={{
            position: "absolute",
            left: VIDEO_CONFIG.safeMargin.left,
            right: VIDEO_CONFIG.safeMargin.right,
            top: pulseY,
            height: pulseHeight+50,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          {waveform.map((amp, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: Math.max(1, Math.round(amp * pulseHeight * 4)),
                background: `linear-gradient(180deg, ${pulseColor}, ${C.violet})`,
                borderRadius: 1,
                opacity: 0.85,
                willChange: "height",
              }}
            />
          ))}
        </div>
      )}

      {/* Creator Watermark — subtle glitch */}
      {hooks.watermark.enabled && (
        <div
          style={{
            position: "absolute",
            left: VIDEO_CONFIG.safeMargin.left,
            bottom: 25,
            transform: `translateX(${glitchOffset}px)`,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: 1.5,
            color: C.cyan,
            opacity: wm.opacity,
            textShadow: `0 0 8px ${C.cyan}`,
            willChange: "transform",
            transition: "transform 0.02s linear",
          }}
        >
          {wm.handle}
          {glitchPhase && <span style={{ marginLeft: 4, color: C.pink }}>_</span>}
        </div>
      )}
    </AbsoluteFill>
  );
};