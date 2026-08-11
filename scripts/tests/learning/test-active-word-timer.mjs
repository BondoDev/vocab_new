// Focused guard for the shared active-time timer in
// src/data/learning/activeWordTimer.ts. That module is deliberately
// import-free and dependency-injected (a fake `now`/`documentRef` instead of
// performance.now()/the global document), so it loads directly here via
// Node's native TypeScript stripping — no browser, no Supabase.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-active-word-timer.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_IDLE_THRESHOLD_MS,
  MAX_WORD_TIME_SECONDS,
  createActiveWordTimer,
} from "../../../src/data/learning/activeWordTimer.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

// Deterministic stepped clock: each call to now() returns the next queued
// value (or the last one repeated, if the queue runs out) — lets a test
// script the exact elapsed time between calls without any real waiting.
function createManualClock(startMs = 0) {
  let current = startMs;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
      return current;
    },
  };
}

// Minimal fake document — visibilityState plus a single-listener
// addEventListener/removeEventListener pair, enough for
// activeWordTimer.ts's ActiveWordTimerDocumentLike contract.
function createFakeDocument(initialState = "visible") {
  let visibilityState = initialState;
  const listeners = new Set();
  return {
    get visibilityState() {
      return visibilityState;
    },
    addEventListener(type, listener) {
      if (type === "visibilitychange") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "visibilitychange") listeners.delete(listener);
    },
    setHidden() {
      visibilityState = "hidden";
      for (const listener of listeners) listener();
    },
    setVisible() {
      visibilityState = "visible";
      for (const listener of listeners) listener();
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

console.log("\n=== activeWordTimer: basic accumulation ===\n");

test("1. A freshly created timer that never started freezes at 0 seconds", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null });
  assert.equal(timer.freeze(), 0);
});

test("2. start() then freeze() after N seconds elapsed reports N seconds", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null });
  timer.start();
  clock.advance(4200);
  assert.equal(timer.freeze(), 4);
});

test("3. floor(activeMilliseconds / 1000) — 999ms does not round up to 1 second", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null });
  timer.start();
  clock.advance(999);
  assert.equal(timer.freeze(), 0);
});

test("4. Counts only active intervals: time before start() never counts", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null });
  clock.advance(10000);
  timer.start();
  clock.advance(2000);
  assert.equal(timer.freeze(), 2);
});

console.log("\n=== activeWordTimer: pause/resume ===\n");

test("5. pause() stops accumulation; time elapsed while paused is not counted", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null });
  timer.start();
  clock.advance(1000);
  timer.pause();
  clock.advance(10000); // must not be counted
  timer.resume();
  clock.advance(1000);
  assert.equal(timer.freeze(), 2);
});

test("6. resume() correctly continues accumulating after pause()", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null });
  timer.start();
  clock.advance(3000);
  timer.pause();
  timer.resume();
  clock.advance(3000);
  assert.equal(timer.freeze(), 6);
});

test("7. Repeated start() calls do not double-count an already-running window", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null });
  timer.start();
  clock.advance(1000);
  timer.start(); // must be a no-op — must not reset the in-progress window
  timer.start();
  clock.advance(1000);
  assert.equal(timer.freeze(), 2);
});

test("8. Repeated resume() calls do not double-count", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null });
  timer.start();
  clock.advance(1000);
  timer.pause();
  timer.resume();
  timer.resume();
  timer.resume();
  clock.advance(1000);
  assert.equal(timer.freeze(), 2);
});

console.log("\n=== activeWordTimer: document visibility ===\n");

test("9. Timer pauses immediately when document.visibilityState becomes hidden", () => {
  const clock = createManualClock();
  const doc = createFakeDocument("visible");
  const timer = createActiveWordTimer({ now: clock.now, documentRef: doc });
  timer.start();
  clock.advance(2000);
  doc.setHidden();
  clock.advance(50000); // must not be counted while hidden
  assert.equal(timer.freeze(), 2);
});

test("10. Timer resumes accumulating when the document becomes visible again", () => {
  const clock = createManualClock();
  const doc = createFakeDocument("visible");
  const timer = createActiveWordTimer({ now: clock.now, documentRef: doc });
  timer.start();
  clock.advance(1000);
  doc.setHidden();
  clock.advance(5000);
  doc.setVisible();
  clock.advance(1000);
  assert.equal(timer.freeze(), 2);
});

test("11. A timer started while already hidden does not accumulate until visible", () => {
  const clock = createManualClock();
  const doc = createFakeDocument("hidden");
  const timer = createActiveWordTimer({ now: clock.now, documentRef: doc });
  timer.start();
  clock.advance(9000); // hidden — must not count
  doc.setVisible();
  clock.advance(1000);
  assert.equal(timer.freeze(), 1);
});

console.log("\n=== activeWordTimer: freeze semantics ===\n");

test("12. freeze() locks the duration — further clock advances are never counted again", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null });
  timer.start();
  clock.advance(3000);
  const frozen = timer.freeze();
  clock.advance(99000);
  assert.equal(timer.freeze(), frozen, "freeze() called again must return the identical cached value");
  assert.equal(timer.getFrozenSeconds(), frozen);
});

test("13. Frozen duration remains unchanged across simulated save retries (start/pause/resume become inert once frozen)", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null });
  timer.start();
  clock.advance(5000);
  const frozen = timer.freeze();

  // Simulate a failed save + retry: nothing should be able to perturb the
  // already-frozen value.
  timer.start();
  timer.resume();
  clock.advance(20000);
  assert.equal(timer.getFrozenSeconds(), frozen);
  assert.equal(timer.freeze(), frozen);
});

test("14. getFrozenSeconds() is null before freeze() is ever called", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null });
  timer.start();
  clock.advance(1000);
  assert.equal(timer.getFrozenSeconds(), null);
});

console.log(`\n=== activeWordTimer: ${MAX_WORD_TIME_SECONDS}-second cap ===\n`);

test("15. Duration is capped at MAX_WORD_TIME_SECONDS under continuous interaction (no single gap exceeds the idle threshold)", () => {
  // Idle protection (added alongside this test) means a session can no
  // longer bank many minutes of pure clock time with zero interaction —
  // see the idle-detection section below. To still exercise the
  // MAX_WORD_TIME_SECONDS cap on its own, this pings recordInteraction()
  // every 30s (well under the 60s default idle threshold) across more than
  // MAX_WORD_TIME_SECONDS of simulated continuous activity, so idle
  // protection never triggers and MAX_WORD_TIME_SECONDS is the only thing
  // that caps the result.
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null });
  timer.start();
  const totalSimulatedSeconds = MAX_WORD_TIME_SECONDS + 500;
  for (let elapsed = 0; elapsed < totalSimulatedSeconds; elapsed += 30) {
    clock.advance(30_000);
    timer.recordInteraction();
  }
  assert.equal(timer.freeze(), MAX_WORD_TIME_SECONDS);
});

test("16. MAX_WORD_TIME_SECONDS is exactly 300", () => {
  assert.equal(MAX_WORD_TIME_SECONDS, 300);
});

console.log("\n=== activeWordTimer: reset ===\n");

test("17. reset() clears accumulated and frozen state, ready for a fresh word", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null });
  timer.start();
  clock.advance(5000);
  timer.freeze();
  timer.reset();
  assert.equal(timer.getFrozenSeconds(), null);

  timer.start();
  clock.advance(2000);
  assert.equal(timer.freeze(), 2, "a new word's timer must start from zero after reset()");
});

test("18. reset() does not itself start accumulating — freeze() immediately after reset() is 0", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null });
  timer.start();
  clock.advance(5000);
  timer.reset();
  clock.advance(5000);
  assert.equal(timer.freeze(), 0);
});

console.log("\n=== activeWordTimer: dispose / cleanup ===\n");

test("19. dispose() stops further accumulation", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null });
  timer.start();
  clock.advance(1000);
  timer.dispose();
  clock.advance(9000);
  assert.equal(timer.freeze(), 1);
});

test("20. dispose() removes the visibilitychange listener (no leak on unmount/navigation)", () => {
  const doc = createFakeDocument("visible");
  const timer = createActiveWordTimer({ documentRef: doc });
  assert.equal(doc.listenerCount(), 1);
  timer.dispose();
  assert.equal(doc.listenerCount(), 0);
});

test("21. dispose() is safe to call multiple times", () => {
  const timer = createActiveWordTimer({ documentRef: null });
  timer.dispose();
  assert.doesNotThrow(() => timer.dispose());
});

console.log("\n=== activeWordTimer: idle detection ===\n");

test("26. DEFAULT_IDLE_THRESHOLD_MS is exactly 60000 (60 seconds)", () => {
  assert.equal(DEFAULT_IDLE_THRESHOLD_MS, 60_000);
});

test("27. A gap longer than idleThresholdMs with no interaction stops accumulation past the threshold", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null, idleThresholdMs: 5000 });
  timer.start(); // lastActivityAtMs = 0
  clock.advance(3000); // still well inside the grace period
  clock.advance(10_000); // now 13s since the last (and only) activity ping
  // Credited only up to 5s (the idle threshold) past t=0 — the remaining
  // ~8s of pure idle clock time is excluded.
  assert.equal(timer.freeze(), 5);
});

test("28. recordInteraction() resumes accumulation, and the idle gap it closes is excluded", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null, idleThresholdMs: 5000 });
  timer.start(); // lastActivityAtMs = 0
  clock.advance(1000); // t=1000 — real activity 0..1000
  clock.advance(20_000); // t=21000 — a long idle gap with no interaction yet
  timer.recordInteraction(); // credits only 0..5000 (5s grace from t=0), then reopens a fresh window at t=21000
  clock.advance(2000); // t=23000 — real activity 21000..23000, well inside the grace period
  // 5s (idle-capped first window) + 2s (post-interaction window) = 7s —
  // strictly less than the 23s of real clock time that elapsed, proving
  // the idle gap was excluded rather than silently banked.
  assert.equal(timer.freeze(), 7);
});

test("29. Multiple separate idle gaps within one session are each excluded independently", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null, idleThresholdMs: 5000 });
  timer.start(); // lastActivityAtMs = 0
  clock.advance(2000);
  timer.recordInteraction(); // banks 2s (0..2000)
  clock.advance(20_000); // first idle gap
  timer.recordInteraction(); // banks 5s (idle-capped grace from the previous interaction)
  clock.advance(1000);
  timer.recordInteraction(); // banks 1s of real activity
  clock.advance(30_000); // second idle gap
  // 2s + 5s (first gap's grace) + 1s + 5s (second gap's grace) = 13s —
  // both idle gaps (20s and 30s of real clock time) were capped
  // independently at the 5s threshold, not just the most recent one.
  assert.equal(timer.freeze(), 13);
});

test("30. recordInteraction() is a no-op once frozen — cannot perturb an already-locked duration", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null, idleThresholdMs: 5000 });
  timer.start();
  clock.advance(1000);
  const frozen = timer.freeze();
  timer.recordInteraction();
  clock.advance(1000);
  assert.equal(timer.freeze(), frozen);
});

test("31. recordInteraction() is a no-op once disposed", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null, idleThresholdMs: 5000 });
  timer.start();
  clock.advance(1000);
  timer.dispose();
  timer.recordInteraction();
  clock.advance(1000);
  assert.equal(timer.freeze(), 1);
});

test("32. Idle-protected accumulation is always an integer number of seconds", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null, idleThresholdMs: 5000 });
  timer.start();
  clock.advance(5999); // just under the 6s mark
  assert.equal(timer.freeze(), Math.floor(5999 / 1000));
  assert.ok(Number.isInteger(timer.getFrozenSeconds()));
});

test("33. recordInteraction() called with zero elapsed time never produces a negative duration", () => {
  const clock = createManualClock();
  const timer = createActiveWordTimer({ now: clock.now, documentRef: null, idleThresholdMs: 5000 });
  timer.start();
  timer.recordInteraction();
  timer.recordInteraction();
  assert.equal(timer.freeze(), 0);
});

console.log("\n=== activeWordTimer: no interval-based ticking ===\n");

test("34. The module source never calls setInterval (documentation may still mention the word)", () => {
  const source = fs.readFileSync(path.join(ROOT_DIR, "src", "data", "learning", "activeWordTimer.ts"), "utf8");
  assert.doesNotMatch(source, /\bsetInterval\s*\(/);
});

test("35. The module source never calls localStorage/sessionStorage", () => {
  const source = fs.readFileSync(path.join(ROOT_DIR, "src", "data", "learning", "activeWordTimer.ts"), "utf8");
  assert.doesNotMatch(source, /\b(localStorage|sessionStorage)\s*\./);
});

test("36. The module source never references mouse/keyboard event types", () => {
  const source = fs.readFileSync(path.join(ROOT_DIR, "src", "data", "learning", "activeWordTimer.ts"), "utf8");
  assert.doesNotMatch(source, /mousemove|mousedown|keydown|keyup|keypress/i);
});

test("37. Default now() uses performance.now(), not Date.now()", () => {
  const source = fs.readFileSync(path.join(ROOT_DIR, "src", "data", "learning", "activeWordTimer.ts"), "utf8");
  assert.match(source, /performance\.now\(\)/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("active-word-timer guard passed");
}
