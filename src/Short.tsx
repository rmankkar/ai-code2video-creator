import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { VideoScript, ScriptScene, AudioManifest } from "./types/script";
import { VIDEO_CONFIG } from "./config/video";
import { AudioPlayer } from "./components/AudioPlayer";

interface ShortProps {
  script?: VideoScript;          // generated script passed directly (preferred)
  scriptPath?: string;           // path to generated script module (fallback)
  audioManifest?: AudioManifest; // passed from Composition (static, rarely changes)
}

const C = VIDEO_CONFIG.colors;

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

const particles = Array.from({ length: 24 }, (_, i) => ({
  x: (i * 137.5 + 7) % 100,
  y: (i * 73.7 + 13) % 100,
  size: 2 + (i % 3) * 2,
  speed: 0.3 + (i % 5) * 0.12,
}));

// Hardcoded fallback scenes (used if script module fails to load)
const fallbackScenes: ScriptScene[] = [
  {
    startFrame: 0,
    endFrame: 150,
    tag: "THE FUTURE OF QA",
    kicker: "QUALITY ENGINEERING",
    lines: ["TEST", "SMARTER."],
    accentLineIndex: 1,
    description: "AI is changing how we build quality.",
    narration: "",
    icon: "✳",
  },
  {
    startFrame: 150,
    endFrame: 300,
    tag: "01 / INTELLIGENCE",
    kicker: "LESS MANUAL WORK",
    lines: ["AI-POWERED", "TESTING."],
    accentLineIndex: 1,
    description: "Generate test cases from requirements.",
    narration: "",
    icon: "⌘",
  },
  {
    startFrame: 300,
    endFrame: 450,
    tag: "02 / AUTOMATION",
    kicker: "CATCH BUGS EARLIER",
    lines: ["FIND", "HIDDEN BUGS."],
    accentLineIndex: 1,
    description: "Spot risks. Analyze failures. Speed up RCA.",
    narration: "",
    icon: "⌁",
  },
  {
    startFrame: 450,
    endFrame: 600,
    tag: "03 / THE NEXT LEVEL",
    kicker: "HUMANS + AI",
    lines: ["QUALITY", "AT SCALE."],
    accentLineIndex: 1,
    description: "Engineers lead. AI accelerates.",
    narration: "",
    icon: "↗",
  },
];

export const Short: React.FC<ShortProps> = ({ script, scriptPath, audioManifest }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // DEBUG: Visual indicator of script source
  // const scriptSource = script
  //   ? `GENERATED: ${script.title}`
  //   : scriptPath
  //   ? "LOADING…"
  //   : "FALLBACK";

  // Use passed script or fall back to hardcoded
  const scenes: ScriptScene[] = script?.scenes ?? fallbackScenes;

  // Use audio manifest segments for timing if available (they have actual durations)
  // Otherwise use script scenes' startFrame/endFrame
  const timingSource = audioManifest?.segments?.length === scenes.length
    ? audioManifest.segments
    : scenes;

  // Find current scene based on actual startFrame/endFrame
  const sceneIndex = timingSource.findIndex(
    (s) => frame >= s.startFrame && frame < s.endFrame
  );
  const safeSceneIndex = Math.max(0, Math.min(scenes.length - 1, sceneIndex));
  const scene = scenes[safeSceneIndex];
  const timing = timingSource[safeSceneIndex];
  const local = frame - timing.startFrame;
  const sceneDurationFrames = timing.endFrame - timing.startFrame;

  const entrance = spring({
    frame: local,
    fps,
    config: { damping: 16, stiffness: 95, mass: 0.8 },
  });

  const exit = interpolate(
    local,
    [sceneDurationFrames - 25, sceneDurationFrames - 1],
    [1, 0],
    clamp
  );

  const opacity = Math.min(
    interpolate(entrance, [0, 1], [0, 1]),
    exit
  );

  const translateY = interpolate(
    entrance,
    [0, 1],
    [65, 0],
    clamp
  );

  const scale = interpolate(
    entrance,
    [0, 1],
    [0.94, 1],
    clamp
  );

  const pulse = 1 + Math.sin(frame / 10) * 0.035;
  const progress = ((frame + 1) / durationInFrames) * 100;

  const transitionIn = interpolate(
    local,
    [0, 12],
    [0, 1],
    clamp
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: C.bg,
        color: C.white,
        fontFamily: "Arial, Helvetica, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Audio Player - plays narration synchronized with scenes */}
      {audioManifest && <AudioPlayer manifest={audioManifest} />}

      {/* DEBUG: Script source indicator (top banner) */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          right: 10,
          background: "rgba(0,0,0,0.85)",
          color: script ? "#00ff00" : scriptPath ? "#ffaa00" : "#ff4444",
          fontSize: 13,
          fontFamily: "monospace",
          padding: "8px 12px",
          borderRadius: 4,
          zIndex: 9999,
          fontWeight: "bold",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {/* {scriptSource} */}
      </div>

      {/* Animated gradient atmosphere */}
      <AbsoluteFill
        style={{
          background: `
            radial-gradient(
              ellipse at ${25 + Math.sin(frame / 55) * 12}%
              ${25 + Math.cos(frame / 65) * 8}%,
              rgba(112, 65, 255, 0.24),
              transparent 48%
            ),
            radial-gradient(
              ellipse at ${80 + Math.cos(frame / 48) * 10}%
              ${65 + Math.sin(frame / 50) * 12}%,
              rgba(0, 205, 255, 0.15),
              transparent 42%
            )
          `,
        }}
      />

      {/* Technical grid */}
      <AbsoluteFill
        style={{
          opacity: 0.13,
          backgroundImage: `
            linear-gradient(
              rgba(166,169,197,0.28) 1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(166,169,197,0.28) 1px,
              transparent 1px
            )
          `,
          backgroundSize: "58px 58px",
          transform: `translateY(${(frame * 0.25) % 58}px)`,
        }}
      />

      {/* Floating light particles */}
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${(p.y - frame * p.speed * 0.08 + 100) % 100}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: i % 3 === 0 ? C.cyan : C.violet,
            opacity: 0.25 + Math.abs(Math.sin(frame / 22 + i)) * 0.55,
            boxShadow: `0 0 12px ${i % 3 === 0 ? C.cyan : C.violet}`,
          }}
        />
      ))}

      {/* Top brand bar */}
      <div
        style={{
          position: "absolute",
          top: 82,
          left: 64,
          right: 64,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #9B7BFF, #5CEBFF)",
              color: "#080816",
              fontSize: 25,
              fontWeight: 900,
              boxShadow: "0 0 25px rgba(155,123,255,0.35)",
            }}
          >
            Q
          </div>
          <div
            style={{
              fontSize: 23,
              fontWeight: 800,
              letterSpacing: 2,
            }}
          >
            QA<span style={{ color: C.cyan }}>//</span>AI
          </div>
        </div>

        <div
          style={{
            padding: "10px 15px",
            border: "1px solid rgba(155,123,255,0.5)",
            borderRadius: 30,
            color: C.muted,
            fontSize: 15,
            letterSpacing: 2,
          }}
        >
          TECH SERIES 01
        </div>
      </div>

      {/* Scene number and label */}
      <div
        style={{
          position: "absolute",
          top: 245,
          left: 66,
          right: 60,
          display: "flex",
          alignItems: "center",
          gap: 14,
          opacity: transitionIn,
        }}
      >
        <div
          style={{
            width: 35,
            height: 2,
            background: C.cyan,
            boxShadow: `0 0 12px ${C.cyan}`,
          }}
        />
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 3,
            color: C.cyan,
          }}
        >
          {scene.tag}
        </div>
      </div>

      {/* Central motion graphic */}
      <div
        style={{
          position: "absolute",
          right: 35,
          top: 300,
          width: 180,
          height: 180,
          transform: `rotate(${frame * 0.25}deg) scale(${pulse})`,
          opacity: 0.6,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: `1px solid ${C.violet}`,
            borderRadius: 42,
            transform: "rotate(45deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 25,
            border: `1px solid ${C.cyan}`,
            borderRadius: "50%",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 62,
            borderRadius: 18,
            background: `linear-gradient(135deg, ${C.violet}, ${C.cyan})`,
            boxShadow: `0 0 50px ${C.violet}`,
          }}
        />
      </div>

      {/* Main kinetic typography */}
      <div
        style={{
          position: "absolute",
          top: 520,
          left: 62,
          right: 42,
          opacity,
          transform: `translateY(${translateY}px) scale(${scale})`,
          transformOrigin: "left center",
        }}
      >
        <div
          style={{
            fontSize: 21,
            fontWeight: 700,
            color: C.muted,
            letterSpacing: 4,
            marginBottom: 25,
          }}
        >
          {scene.kicker}
        </div>

        {scene.lines.map((line, i) => {
          const wordProgress = spring({
            frame: Math.max(0, local - i * 7),
            fps,
            config: { damping: 14, stiffness: 105 },
          });

          const isAccent = i === scene.accentLineIndex;

          return (
            <div
              key={`${sceneIndex}-${line}`}
              style={{
                fontSize: line.length > 11 ? 69 : 91,
                fontWeight: 900,
                lineHeight: 1.03,
                letterSpacing: -3,
                whiteSpace: "nowrap",
                opacity: wordProgress,
                transform: `translateX(${(1 - wordProgress) * -65}px)`,
                color: isAccent ? "transparent" : C.white,
                background: isAccent
                  ? `linear-gradient(100deg, ${C.violet}, ${C.cyan})`
                  : undefined,
                backgroundClip: isAccent ? "text" : undefined,
                WebkitBackgroundClip: isAccent ? "text" : undefined,
                marginBottom: 8,
              }}
            >
              {line}
            </div>
          );
        })}

        {/* Animated underline */}
        <div
          style={{
            marginTop: 28,
            width: `${interpolate(local, [8, 38], [0, 390], clamp)}px`,
            height: 5,
            borderRadius: 8,
            background: `linear-gradient(90deg, ${C.violet}, ${C.cyan})`,
            boxShadow: `0 0 22px rgba(92,235,255,0.4)`,
          }}
        />

        <div
          style={{
            fontSize: 28,
            lineHeight: 1.45,
            color: C.muted,
            marginTop: 30,
            maxWidth: 700,
            opacity: interpolate(local, [18, 35], [0, 1], clamp),
          }}
        >
          {scene.description}
        </div>
      </div>

      {/* Bottom metadata */}
      <div
        style={{
          position: "absolute",
          bottom: 145,
          left: 66,
          right: 66,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: 17,
            color: C.muted,
            letterSpacing: 2,
          }}
        >
          AI × QUALITY × ENGINEERING
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: C.cyan,
          }}
        >
          0{sceneIndex + 1} / 0{scenes.length}
        </div>
      </div>

      {/* Progress track */}
      <div
        style={{
          position: "absolute",
          left: 66,
          right: 66,
          bottom: 105,
          height: 3,
          background: "rgba(255,255,255,0.15)",
          borderRadius: 10,
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            borderRadius: 10,
            background: `linear-gradient(90deg, ${C.violet}, ${C.cyan})`,
            boxShadow: `0 0 15px ${C.cyan}`,
          }}
        />
      </div>

      {/* Scene transition flash */}
      <AbsoluteFill
        style={{
          background: C.violet,
          opacity:
            sceneIndex > 0
              ? interpolate(
                  local,
                  [0, 3, 9],
                  [0.24, 0.08, 0],
                  clamp
                )
              : 0,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};