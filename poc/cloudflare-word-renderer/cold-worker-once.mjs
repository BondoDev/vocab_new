// EXPERIMENTAL — spawned as a fresh child process by run-performance-check.mjs
// to get one genuine cold-start sample (fresh module graph, nothing cached).
import { loadSharedWordRouteModules } from "./compile-shared-modules.mjs";
import { renderWordPocResponse } from "./renderer.mjs";
import { loadStore } from "./load-store.mjs";

const t0 = process.hrtime.bigint();
const shared = loadSharedWordRouteModules();
const t1 = process.hrtime.bigint();
const store = loadStore();
const t2 = process.hrtime.bigint();

const parsed = shared.parseWordRoutePathname("/en/english-word-about--A1-00001");
const t3 = process.hrtime.bigint();
void parsed;

const concept = store.concepts["A1-00001"];
const otherMeanings = concept.otherMeaningConceptIds.map((id) => store.concepts[id]);
const relatedWords = concept.relatedConceptIds.map((id) => store.concepts[id]);
void otherMeanings;
void relatedWords;
const t4 = process.hrtime.bigint();

const response = renderWordPocResponse(
  "/en/english-word-about--A1-00001",
  "https://www.fluentstellar.com",
  shared,
  store,
);
const t5 = process.hrtime.bigint();

const ns = (a, b) => Number(b - a) / 1_000_000;

process.stdout.write(
  JSON.stringify({
    totalMs: ns(t0, t5),
    recordStoreLoadMs: ns(t1, t2),
    stages: {
      routeParse: ns(t2, t3),
      recordLookup: ns(t3, t4),
      fullResponseComposition: ns(t4, t5),
    },
    outputBytes: Buffer.byteLength(response.body, "utf8"),
    heapUsedBytes: process.memoryUsage().heapUsed,
  }),
);
