// Contract guard for update_user_timezone's response parser
// (parseUpdateUserTimezoneRow in src/lib/userProfileTimezone.ts) — the
// Settings backend follow-up's explicit-replacement timezone RPC. Same
// behavioral, direct-import precedent as
// test-user-profile-languages-response.mjs.
//
// Run: node --experimental-strip-types scripts/tests/account/test-update-user-timezone-response.mjs
import assert from "node:assert/strict";
import {
  parseInitializeUserTimezoneRow,
  parseUpdateUserTimezoneRow,
} from "../../../src/lib/userProfileTimezone.ts";

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

const VALID_ROW = {
  timezone: "Europe/Berlin",
  timezone_updated_at: "2026-08-12T12:00:00.000Z",
  updated: true,
};

console.log("\n=== update_user_timezone response parser contract ===\n");

test("1. A fully valid row parses to the expected typed result", () => {
  const result = parseUpdateUserTimezoneRow(VALID_ROW);
  assert.deepEqual(result, {
    timezone: "Europe/Berlin",
    timezoneUpdatedAt: "2026-08-12T12:00:00.000Z",
    updated: true,
  });
});

test("2. updated may be false and still parses (defensive — the RPC itself never returns false today, but the parser must not assume that)", () => {
  const result = parseUpdateUserTimezoneRow({ ...VALID_ROW, updated: false });
  assert.equal(result.updated, false);
});

test("3. A non-boolean updated field is rejected", () => {
  assert.throws(() => parseUpdateUserTimezoneRow({ ...VALID_ROW, updated: "true" }), /updated must be a boolean/);
  assert.throws(() => parseUpdateUserTimezoneRow({ ...VALID_ROW, updated: undefined }), /updated must be a boolean/);
});

test("4. A malformed (empty/whitespace/non-string) timezone is rejected", () => {
  assert.throws(() => parseUpdateUserTimezoneRow({ ...VALID_ROW, timezone: "" }), /timezone must be a non-empty string/);
  assert.throws(() => parseUpdateUserTimezoneRow({ ...VALID_ROW, timezone: "   " }), /timezone must be a non-empty string/);
  assert.throws(() => parseUpdateUserTimezoneRow({ ...VALID_ROW, timezone: 42 }), /timezone must be a non-empty string/);
});

test("5. A malformed timezone_updated_at is rejected", () => {
  assert.throws(
    () => parseUpdateUserTimezoneRow({ ...VALID_ROW, timezone_updated_at: null }),
    /timezone_updated_at must be a non-empty string/,
  );
});

test("6. An unexpected null row, a bare string, and an array are all rejected", () => {
  assert.throws(() => parseUpdateUserTimezoneRow(null), /malformed row/);
  assert.throws(() => parseUpdateUserTimezoneRow(undefined), /malformed row/);
  assert.throws(() => parseUpdateUserTimezoneRow("not a row"), /malformed row/);
  assert.throws(() => parseUpdateUserTimezoneRow([VALID_ROW]), /malformed row/);
});

test("7. Every thrown error carries the unexpected_response category (ClassifiedSupabaseError contract)", () => {
  try {
    parseUpdateUserTimezoneRow(null);
    assert.fail("must throw");
  } catch (err) {
    assert.equal(err.category, "unexpected_response");
    assert.equal(err.name, "ClassifiedSupabaseError");
  }
});

test("8. update_user_timezone's row shape is distinct from initialize_user_timezone's (updated vs. initialized) — the two parsers are not interchangeable", () => {
  // A row shaped for initialize_user_timezone (has `initialized`, not
  // `updated`) must be rejected by the update parser, and vice versa.
  const initializeShapedRow = { timezone: "UTC", timezone_updated_at: "2026-08-12T12:00:00.000Z", initialized: true };
  assert.throws(() => parseUpdateUserTimezoneRow(initializeShapedRow), /updated must be a boolean/);

  const updateShapedRow = { timezone: "UTC", timezone_updated_at: "2026-08-12T12:00:00.000Z", updated: true };
  assert.throws(() => parseInitializeUserTimezoneRow(updateShapedRow), /initialized must be a boolean/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("update_user_timezone response parser contract passed");
}
