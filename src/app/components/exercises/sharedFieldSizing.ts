import { type CSSProperties } from "react";

export type SharedExerciseFieldSizing = {
  fieldStyle: CSSProperties;
  enableOverlayAutoFit: boolean;
};

export function getSharedExerciseFieldSizing(
  rawWord: string,
): SharedExerciseFieldSizing {
  const safeWord = typeof rawWord === "string" ? rawWord : "";
  const segmentCount = safeWord.split(" ").length;
  const widthCharCount = Math.max(1, safeWord.length);

  return {
    fieldStyle: {
      width:
        segmentCount > 1
          ? "max-content"
          : `calc(${widthCharCount}ch + ${
              (widthCharCount - 1) * 0.5
            }em + 2rem)`,
      maxWidth: "100%",
    },
    enableOverlayAutoFit: segmentCount > 1,
  };
}

