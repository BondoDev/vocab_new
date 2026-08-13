// Contract guard for update_user_nickname's response parser
// (parseUpdateUserNicknameRow in src/lib/userProfileNickname.ts) — the
// Settings nickname-editing follow-up's narrow nickname-replacement RPC.
// Same behavioral, direct-import precedent as
// test-update-user-timezone-response.mjs.
//
// Run: node --experimental-strip-types scripts/tests/account/test-update-user-nickname-response.mjs
import assert from "node:assert/strict";
import { parseUpdateUserNicknameRow } from "../../../src/lib/userProfileNickname.ts";

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
  nickname: "Bondo",
  updated_at: "2026-08-13T12:00:00.000Z",
};

console.log("\n=== update_user_nickname response parser contract ===\n");

test("1. A fully valid row parses to the expected typed result", () => {
  const result = parseUpdateUserNicknameRow(VALID_ROW);
  assert.deepEqual(result, {
    nickname: "Bondo",
    updatedAt: "2026-08-13T12:00:00.000Z",
  });
});

test("2. A Unicode nickname round-trips unchanged", () => {
  const result = parseUpdateUserNicknameRow({ ...VALID_ROW, nickname: "Þórdís Åsa" });
  assert.equal(result.nickname, "Þórdís Åsa");
});

test("3. A malformed (empty/whitespace/non-string) nickname is rejected", () => {
  assert.throws(() => parseUpdateUserNicknameRow({ ...VALID_ROW, nickname: "" }), /nickname must be a non-empty string/);
  assert.throws(() => parseUpdateUserNicknameRow({ ...VALID_ROW, nickname: "   " }), /nickname must be a non-empty string/);
  assert.throws(() => parseUpdateUserNicknameRow({ ...VALID_ROW, nickname: 42 }), /nickname must be a non-empty string/);
});

test("4. A malformed updated_at is rejected", () => {
  assert.throws(
    () => parseUpdateUserNicknameRow({ ...VALID_ROW, updated_at: null }),
    /updated_at must be a non-empty string/,
  );
  assert.throws(
    () => parseUpdateUserNicknameRow({ ...VALID_ROW, updated_at: undefined }),
    /updated_at must be a non-empty string/,
  );
});

test("5. An unexpected null row, a bare string, and an array are all rejected", () => {
  assert.throws(() => parseUpdateUserNicknameRow(null), /malformed row/);
  assert.throws(() => parseUpdateUserNicknameRow(undefined), /malformed row/);
  assert.throws(() => parseUpdateUserNicknameRow("not a row"), /malformed row/);
  assert.throws(() => parseUpdateUserNicknameRow([VALID_ROW]), /malformed row/);
});

test("6. Every thrown error carries the unexpected_response category (ClassifiedSupabaseError contract)", () => {
  try {
    parseUpdateUserNicknameRow(null);
    assert.fail("must throw");
  } catch (err) {
    assert.equal(err.category, "unexpected_response");
    assert.equal(err.name, "ClassifiedSupabaseError");
  }
});

test("7. The parsed result carries only nickname/updatedAt — no other field is invented from an over-supplied row", () => {
  const result = parseUpdateUserNicknameRow({ ...VALID_ROW, onboarding_completed: true, daily_goal: 50 });
  assert.deepEqual(Object.keys(result).sort(), ["nickname", "updatedAt"].sort());
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("update_user_nickname response parser contract passed");
}
