/**
 * Runs exactly one measureOnePass() and prints its JSON result to stdout.
 * Invoked as a fresh child process by scripts/benchmark-word-render.mjs to
 * capture genuine "cold start" timings (fresh module graph, nothing cached).
 */

import { measureOnePass } from "./wordRenderBreakdown.mjs";

measureOnePass()
  .then((result) => {
    process.stdout.write(JSON.stringify(result));
  })
  .catch((error) => {
    process.stderr.write(String(error?.stack ?? error));
    process.exitCode = 1;
  });
