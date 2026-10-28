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
      // Never under the listen button pinned at the row's left edge
      // (UniversalExerciseInput: 2.5rem + breathing room, mirrored on the
      // right since the field is centered). Longer answers wrap and grow in
      // height instead. Phone breakpoints override this with a !important
      // percentage in exercises.scss.
      maxWidth: "calc(100% - 6rem)",
    },
    enableOverlayAutoFit: segmentCount > 1,
  };
}

