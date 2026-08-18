// Reads a hydration/state payload embedded by SSR/prerender as an inert
// `<script type="application/json" id="...">` data block, never an
// executable `window.X = ...` assignment (CSP Phase 2A migration — see
// src/entry-server.tsx and workers/word-ssr/src/index.full.ts for the two
// producers, both writing the same id/shape convention). Shared by every
// client-side reader of such a block so the DOM lookup + parse + failure
// handling lives in exactly one place, per consumer id.
//
// Fails safe in every case: never throws, never executes the embedded text
// as code. Two distinct "nothing here" outcomes are handled differently on
// purpose:
//   - element missing entirely: normal/expected (e.g. a client-side
//     navigation with no SSR payload for this id) — returns null silently.
//   - element present but its content isn't valid JSON: the producer always
//     emits JSON.stringify output through HTML-safe escaping, so this can
//     only mean the escaping/producer broke or the markup was mangled in
//     transit — a genuine bug worth surfacing, not silently swallowing.
//     Still fails safe (returns null, never throws) but logs so the bug
//     isn't hidden.
export function readEmbeddedJson<T>(id: string): T | null {
  if (typeof document === "undefined") {
    return null;
  }

  const element = document.getElementById(id);
  if (!element) {
    return null;
  }

  if (element.tagName !== "SCRIPT" || element.getAttribute("type") !== "application/json") {
    console.error(`readEmbeddedJson: element #${id} is not an inert application/json script block.`);
    return null;
  }

  const raw = element.textContent;
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`readEmbeddedJson: failed to parse embedded JSON for #${id}.`, error);
    return null;
  }
}
