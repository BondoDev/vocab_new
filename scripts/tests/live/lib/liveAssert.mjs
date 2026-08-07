// Small assertion helpers shared by every scenario in scripts/tests/live/.
// Kept separate from node:assert/strict itself only to attach the failing
// response's status/body to the failure message — a bare assert.ok(false)
// on a live HTTP call is nearly useless to debug without that context.
import assert from "node:assert/strict";

function describeResponse(response) {
  const body = response.json ?? response.raw ?? "";
  const bodyText = typeof body === "string" ? body : JSON.stringify(body);
  return `status ${response.status}, body: ${bodyText.slice(0, 500)}`;
}

export function assertOk(response, context) {
  assert.ok(response.ok, `${context}: expected a successful response, got ${describeResponse(response)}`);
}

export function assertError(response, context) {
  assert.ok(
    response.status >= 400,
    `${context}: expected an error response, got ${describeResponse(response)}`,
  );
}

export function assertStatus(response, expectedStatuses, context) {
  const expected = Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses];
  assert.ok(
    expected.includes(response.status),
    `${context}: expected status ${expected.join(" or ")}, got ${describeResponse(response)}`,
  );
}

// Verifies a server-generated timestamp is a real, parseable instant close
// to "now" from this test process's own clock — never an exact-millisecond
// equality check. Server and test-runner clocks are never perfectly
// synced, and the RPC's own now()/statement_timestamp() call happens
// mid-request, not at the instant this function runs — the task brief's
// own "Server timestamp verification" section asks for a tolerance check,
// not equality, for exactly this reason. 5 minutes is generous enough to
// absorb real network latency and modest clock drift while still failing
// loudly on a genuinely wrong value (e.g. a client-generated timestamp
// from months/years off, or a stuck/frozen server clock).
export function assertTimestampCloseToNow(isoString, context, { toleranceMs = 5 * 60 * 1000 } = {}) {
  assert.equal(typeof isoString, "string", `${context}: expected a timestamp string, got ${typeof isoString}`);
  const parsed = Date.parse(isoString);
  assert.ok(Number.isFinite(parsed), `${context}: "${isoString}" is not a parseable timestamp.`);
  const deltaMs = Math.abs(Date.now() - parsed);
  assert.ok(
    deltaMs <= toleranceMs,
    `${context}: timestamp ${isoString} is ${deltaMs}ms from now, expected within ${toleranceMs}ms.`,
  );
}

// Confirms a subsequent write actually moved a server timestamp forward
// (never backward, never unchanged) — used wherever a mutation is expected
// to bump `updated_at` and the test already holds a "before" value.
export function assertTimestampMovedForward(beforeISO, afterISO, context) {
  const before = Date.parse(beforeISO);
  const after = Date.parse(afterISO);
  assert.ok(
    Number.isFinite(before) && Number.isFinite(after),
    `${context}: malformed timestamps (before="${beforeISO}", after="${afterISO}").`,
  );
  assert.ok(after >= before, `${context}: expected ${afterISO} to not be before ${beforeISO}.`);
}
