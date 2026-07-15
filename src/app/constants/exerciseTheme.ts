import type { CSSProperties } from "react";

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
