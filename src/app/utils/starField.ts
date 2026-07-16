// Pure star-field background generators extracted from App.tsx.
//
// Deterministic by design: a seeded LCG (not Math.random) means the same
// seed always yields the same CSS background-image string, so the home-page
// buttons render identically on the server, at hydration, and across
// re-renders — no hydration mismatch and no visual flicker.
//
// Header.tsx, ExerciseSelection.tsx, and LevelCategorySelection.tsx contain
// their own private variants of this pattern; they are intentionally NOT
// consolidated here (their tuning constants differ subtly).

export function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function createDistributedStarFieldImage(
  starCount: number,
  seed = starCount,
): string {
  const cols = Math.ceil(Math.sqrt(starCount));
  const rows = Math.ceil(starCount / cols);
  const sparkleScaleOptions = [0.8, 1, 1.2, 1.4];
  const colorOptions = [
    "#fff",
    "#fff",
    "#fff",
    "#f3f3f3",
    "rgba(255,255,255,0.9)",
  ];
  const layers: string[] = [];
  const nextRandom = createSeededRandom(seed);

  for (let i = 0; i < starCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellWidth = 100 / cols;
    const cellHeight = 100 / rows;
    const xMin = col * cellWidth + 10;
    const xMax = (col + 1) * cellWidth - 10;
    const yMin = row * cellHeight + 14;
    const yMax = (row + 1) * cellHeight - 14;
    const x = (
      Math.max(5, xMin) +
      (Math.min(95, xMax) - Math.max(5, xMin)) * nextRandom()
    ).toFixed(1);
    const y = (
      Math.max(8, yMin) +
      (Math.min(92, yMax) - Math.max(8, yMin)) * nextRandom()
    ).toFixed(1);
    const sparkleScale =
      sparkleScaleOptions[
        Math.floor(nextRandom() * sparkleScaleOptions.length)
      ];
    const color = colorOptions[Math.floor(nextRandom() * colorOptions.length)];
    const longArm = ((4.8 + (6.6 - 4.8) * nextRandom()) * sparkleScale).toFixed(
      1,
    );
    const shortArm = (
      (1.05 + (1.45 - 1.05) * nextRandom()) *
      sparkleScale
    ).toFixed(2);
    const core = ((0.9 + (1.3 - 0.9) * nextRandom()) * sparkleScale).toFixed(2);

    layers.push(
      `radial-gradient(ellipse ${longArm}px ${shortArm}px at ${x}% ${y}%, ${color}, rgba(0,0,0,0) 72%)`,
      `radial-gradient(ellipse ${shortArm}px ${longArm}px at ${x}% ${y}%, ${color}, rgba(0,0,0,0) 72%)`,
      `radial-gradient(${core}px ${core}px at ${x}% ${y}%, rgba(255,255,255,0.98), rgba(0,0,0,0))`,
    );
  }

  return layers.join(",\n    ");
}
