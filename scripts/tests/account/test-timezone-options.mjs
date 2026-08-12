// Pure logic guard for Settings' Time & Region timezone list/search/offset
// helpers (src/app/utils/timezoneOptions.ts).
//
// Run: node --experimental-strip-types scripts/tests/account/test-timezone-options.mjs
import assert from "node:assert/strict";
import {
  buildTimezoneOptions,
  filterTimezoneOptions,
  formatTimezoneOffset,
  getSupportedTimezones,
  getTimezoneCityLabel,
  getTimezoneRegionLabel,
} from "../../../src/app/utils/timezoneOptions.ts";

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

console.log("\n=== Settings timezone-options contract ===\n");

test("1. getSupportedTimezones returns a non-empty list including well-known zones (platform Intl.supportedValuesOf on this Node runtime)", () => {
  const zones = getSupportedTimezones();
  assert.ok(Array.isArray(zones) && zones.length > 50, "expected a large IANA zone list");
  assert.ok(zones.includes("Asia/Tbilisi"));
  assert.ok(zones.includes("Europe/Berlin"));
  assert.ok(zones.includes("UTC"));
});

test("2. getTimezoneCityLabel extracts the final path segment and converts underscores to spaces", () => {
  assert.equal(getTimezoneCityLabel("Asia/Tbilisi"), "Tbilisi");
  assert.equal(getTimezoneCityLabel("America/Argentina/Buenos_Aires"), "Buenos Aires");
  assert.equal(getTimezoneCityLabel("America/New_York"), "New York");
  assert.equal(getTimezoneCityLabel("UTC"), "UTC");
});

test("3. getTimezoneRegionLabel returns everything before the final segment, or empty for a bare identifier", () => {
  assert.equal(getTimezoneRegionLabel("Asia/Tbilisi"), "Asia");
  assert.equal(getTimezoneRegionLabel("America/Argentina/Buenos_Aires"), "America/Argentina");
  assert.equal(getTimezoneRegionLabel("UTC"), "");
});

test("4. formatTimezoneOffset returns a normalized UTC±N string for a known zone", () => {
  const offset = formatTimezoneOffset("Asia/Tbilisi", new Date("2026-01-15T00:00:00Z"));
  assert.equal(offset, "UTC+4");
});

test("5. formatTimezoneOffset is date-sensitive across a DST boundary (Europe/Berlin: UTC+1 in January, UTC+2 in July)", () => {
  const winter = formatTimezoneOffset("Europe/Berlin", new Date("2026-01-15T12:00:00Z"));
  const summer = formatTimezoneOffset("Europe/Berlin", new Date("2026-07-15T12:00:00Z"));
  assert.equal(winter, "UTC+1");
  assert.equal(summer, "UTC+2");
  assert.notEqual(winter, summer, "the same zone must not reuse one fixed offset year-round");
});

test("6. formatTimezoneOffset normalizes UTC itself to 'UTC+0'", () => {
  assert.equal(formatTimezoneOffset("UTC", new Date("2026-01-15T00:00:00Z")), "UTC+0");
});

test("7. formatTimezoneOffset returns null for an unsupported/invalid zone identifier instead of throwing", () => {
  assert.equal(formatTimezoneOffset("Not/A_Real_Zone"), null);
});

test("8. buildTimezoneOptions returns one option per zone, sorted by id, each with a city/region/offset", () => {
  const options = buildTimezoneOptions(new Date("2026-01-15T00:00:00Z"));
  assert.ok(options.length > 50);
  const ids = options.map((option) => option.id);
  const sortedIds = [...ids].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(ids, sortedIds, "options must be sorted by id");

  const tbilisi = options.find((option) => option.id === "Asia/Tbilisi");
  assert.ok(tbilisi, "Asia/Tbilisi must be present");
  assert.equal(tbilisi.city, "Tbilisi");
  assert.equal(tbilisi.region, "Asia");
  assert.equal(tbilisi.offsetLabel, "UTC+4");
});

test("9. filterTimezoneOptions matches by city, by full identifier, and by offset — case-insensitively", () => {
  const options = buildTimezoneOptions(new Date("2026-01-15T00:00:00Z"));

  const byCity = filterTimezoneOptions(options, "tbil");
  assert.ok(byCity.some((option) => option.id === "Asia/Tbilisi"));

  const byId = filterTimezoneOptions(options, "Asia/Tbilisi");
  assert.ok(byId.some((option) => option.id === "Asia/Tbilisi"));

  const byOffset = filterTimezoneOptions(options, "+4");
  assert.ok(byOffset.some((option) => option.id === "Asia/Tbilisi"));
});

test("10. filterTimezoneOptions returns every option for an empty/whitespace-only query", () => {
  const options = buildTimezoneOptions();
  assert.deepEqual(filterTimezoneOptions(options, ""), options);
  assert.deepEqual(filterTimezoneOptions(options, "   "), options);
});

test("11. filterTimezoneOptions returns an empty array for a query matching nothing", () => {
  const options = buildTimezoneOptions();
  assert.deepEqual(filterTimezoneOptions(options, "zzzzz-not-a-real-city"), []);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("Settings timezone-options contract passed");
}
