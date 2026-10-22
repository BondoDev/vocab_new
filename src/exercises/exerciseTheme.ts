import { useState, type CSSProperties } from "react";
import { Headphones, Keyboard, Link, Puzzle, TextCursorInput, type LucideIcon } from "lucide-react";
import type { ExerciseId } from "./exerciseIds";

// One icon per exercise type, shared by the setup tiles and the practice card
// header so an exercise is recognizable by the same glyph everywhere.
export const exerciseIcons: Record<ExerciseId, LucideIcon> = {
  wordTyping: Keyboard,
  halfWritten: TextCursorInput,
  brokenWord: Puzzle,
  connectWords: Link,
  listening: Headphones,
};

// --- Practice card surface colors -------------------------------------------
// generatePracticeCardSurface() returns a random, softly saturated card color.
// Boundaries: hue is random but skips mustard/olive (70-140), chroma stays in
// a muted range, and lightness is the highest value at which white text still
// has >= 4.6:1 contrast (so the color is as light as readability allows).

const SURFACE_CHROMA_MIN = 0.08;
const SURFACE_CHROMA_MAX = 0.12;
const SURFACE_MAX_LIGHTNESS = 0.66;
// White (luminance 1) against Y: (1 + 0.05) / (Y + 0.05) >= 4.6.
const SURFACE_MAX_LUMINANCE = 1.05 / 4.6 - 0.05;
const EXCLUDED_HUE_START = 70;
const EXCLUDED_HUE_SPAN = 70;

function oklchToLinearSrgb(l: number, c: number, hueDeg: number): [number, number, number] {
  const h = (hueDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

function linearToHex(channels: [number, number, number]): string {
  return `#${channels
    .map((v) => {
      const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, encoded)) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

export function generatePracticeCardSurface(): string {
  // Uniform over the allowed 290 degrees, skipping the excluded olive band.
  const raw = Math.random() * (360 - EXCLUDED_HUE_SPAN);
  const hue = raw < EXCLUDED_HUE_START ? raw : raw + EXCLUDED_HUE_SPAN;
  const chroma =
    SURFACE_CHROMA_MIN + Math.random() * (SURFACE_CHROMA_MAX - SURFACE_CHROMA_MIN);

  for (let l = SURFACE_MAX_LIGHTNESS; l > 0.3; l -= 0.005) {
    // Some hues (teal/cyan) leave the sRGB gamut at this chroma, so chroma
    // backs off before lightness does.
    for (let c = chroma; c >= 0.04; c -= 0.01) {
      const rgb = oklchToLinearSrgb(l, c, hue);
      if (!rgb.every((v) => v >= 0 && v <= 1)) continue;
      const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      if (luminance <= SURFACE_MAX_LUMINANCE) return linearToHex(rgb);
      break;
    }
  }
  return "#4338ca";
}

// A fresh random surface color every time `cardKey` changes, i.e. every time
// a new exercise card appears. Regenerating during render ("adjust state when
// inputs change") paints the new card in its new color on its first frame.
// Exercise cards render only on the client (they wait for loaded words), so
// the random value can't cause a hydration mismatch.
export function useRandomCardSurface(cardKey: string): string {
  const [surface, setSurface] = useState(() => ({
    key: cardKey,
    color: generatePracticeCardSurface(),
  }));
  if (surface.key !== cardKey) {
    const next = { key: cardKey, color: generatePracticeCardSurface() };
    setSurface(next);
    return next.color;
  }
  return surface.color;
}

// Practice state stores the exercise type as a plain string; fall back to the
// word-typing glyph rather than rendering nothing for an unknown id.
export function getExerciseIcon(exerciseId: string): LucideIcon {
  return exerciseIcons[exerciseId as ExerciseId] ?? Keyboard;
}

// Motion's `style` prop type doesn't declare arbitrary CSS custom properties,
// so plain object literals using them fail excess-property checks. Naming the
// exact custom properties here (rather than a generic `--${string}` index
// signature) keeps typos in call sites caught at compile time.
export type MotionCssVars<Name extends `--${string}`> = CSSProperties & {
  [K in Name]?: string;
};

export const exerciseCardBackgrounds: Record<string, string> = {
  wordTyping: "#F2F0FF",
  halfWritten: "#EEF9F2",
  brokenWord: "#FFF3EC",
  connectWords: "#EEF7FF",
  listening: "#FFF9E8",
};

export const exerciseCardBorders: Record<string, string> = {
  wordTyping: "#7A68D8",
  halfWritten: "#4FA876",
  brokenWord: "#D78A5C",
  connectWords: "#5B95DA",
  listening: "#C8A53A",
};

export const exerciseCardIconColors: Record<string, string> = {
  wordTyping: "#6B58C8",
  halfWritten: "#3E9765",
  brokenWord: "#C67646",
  connectWords: "#4B86CB",
  listening: "#B8932E",
};
