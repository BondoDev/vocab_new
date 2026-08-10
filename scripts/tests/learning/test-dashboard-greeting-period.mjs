// Focused guard for the pure Dashboard-greeting helper in
// src/features/user-profile/sections/dashboard/dashboardGreeting.ts, plus
// the shared {token} interpolation helper (src/lib/interpolateTemplate.ts)
// it uses for {name} — imported directly from its own canonical module
// (not re-exported from dashboardGreeting.ts) so each pure module under
// test stays import-free of its siblings, matching dailyStreak.ts/
// todayProgressDisplay.ts's own precedent. Import-free of React/the app's
// t() lookup so both load directly via Node's native TypeScript stripping.
// Pins the exact hour-boundary behavior from the Dashboard Phase 1 brief
// (05:00/12:00/18:00 cutoffs, evening wrapping past midnight) and the
// {name} interpolation contract.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-dashboard-greeting-period.mjs
import assert from "node:assert/strict";
import { getDashboardGreetingPeriod } from "../../../src/features/user-profile/sections/dashboard/dashboardGreeting.ts";
import { interpolateTemplate } from "../../../src/lib/interpolateTemplate.ts";

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

console.log("\n=== getDashboardGreetingPeriod boundary values ===\n");

test("1. 04:59 (hour 4) -> evening", () => assert.equal(getDashboardGreetingPeriod(4), "evening"));
test("2. 05:00 (hour 5) -> morning", () => assert.equal(getDashboardGreetingPeriod(5), "morning"));
test("3. 11:59 (hour 11) -> morning", () => assert.equal(getDashboardGreetingPeriod(11), "morning"));
test("4. 12:00 (hour 12) -> afternoon", () => assert.equal(getDashboardGreetingPeriod(12), "afternoon"));
test("5. 17:59 (hour 17) -> afternoon", () => assert.equal(getDashboardGreetingPeriod(17), "afternoon"));
test("6. 18:00 (hour 18) -> evening", () => assert.equal(getDashboardGreetingPeriod(18), "evening"));
test("7. 00:00 (hour 0) -> evening (wraps past midnight)", () => assert.equal(getDashboardGreetingPeriod(0), "evening"));
test("8. 23:00 (hour 23) -> evening", () => assert.equal(getDashboardGreetingPeriod(23), "evening"));

console.log("\n=== interpolateTemplate ===\n");

test("9. Substitutes a single {name} token", () => {
  assert.equal(
    interpolateTemplate("Good morning, {name}. Ready to keep learning?", { name: "Bondo" }),
    "Good morning, Bondo. Ready to keep learning?",
  );
});

test("10. Leaves an unmatched token untouched rather than dropping it", () => {
  assert.equal(interpolateTemplate("Hello, {name}!", {}), "Hello, {name}!");
});

test("11. A template with no tokens passes through unchanged", () => {
  assert.equal(interpolateTemplate("Ready to keep learning?", { name: "Bondo" }), "Ready to keep learning?");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("dashboard-greeting-period guard passed");
}
