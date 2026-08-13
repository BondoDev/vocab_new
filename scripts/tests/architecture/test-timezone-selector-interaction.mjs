// Regression guard for the Settings timezone popup interaction: the picker
// must use the app's controlled Radix dialog composition, with a single
// forwardRef-capable Button as the trigger, so opening the timezone list
// produces a centered modal popup rather than an anchored dropdown or a
// nested/raw button. This is a source-text guard, matching every other
// architecture test in this repository — there is no component-rendering
// test runner (RTL/vitest) in this project.
//
// Run: node scripts/tests/architecture/test-timezone-selector-interaction.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
}

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

console.log("\n=== Timezone selector interaction: root-cause regression guard ===\n");

const buttonSource = read("src/app/components/ui/button.tsx");

test("1. Button is a React.forwardRef component (the actual fix) — never reverts to a plain function component", () => {
  assert.match(buttonSource, /const Button = React\.forwardRef</);
  assert.doesNotMatch(buttonSource, /^function Button\(/m);
});

test("2. Button forwards its ref to the underlying element (Slot or native <button>), matching the DialogTrigger/AlertDialogTrigger precedent", () => {
  const fnMatch = buttonSource.match(/const Button = React\.forwardRef<[\s\S]*?\n\);/);
  assert.ok(fnMatch, "Button's forwardRef body must exist");
  assert.match(fnMatch[0], /<Comp\s*\n?\s*ref=\{ref\}/);
});

const timezoneSelectorSource = read("src/features/user-profile/sections/settings/TimezoneSelector.tsx");

console.log("\n=== TimezoneSelector: composition and interaction wiring ===\n");

test("3. The trigger is a single Button under DialogTrigger asChild — never a raw nested <button> (which would itself be invalid HTML) or a second wrapper", () => {
  const triggerBlock = timezoneSelectorSource.match(/<DialogTrigger asChild>([\s\S]*?)<\/DialogTrigger>/);
  assert.ok(triggerBlock, "expected a <DialogTrigger asChild> block");
  assert.match(triggerBlock[1], /<Button\b/);
  // Only the one top-level Button element inside the trigger slot — not a
  // second <button ...> anywhere within it.
  assert.doesNotMatch(triggerBlock[1], /<button\b/);
});

test("4. Dialog open state is explicitly controlled (open + onOpenChange), never left to Radix's own uncontrolled default", () => {
  assert.match(timezoneSelectorSource, /<Dialog\s*\n?\s*open=\{isOpen\}/);
  assert.match(timezoneSelectorSource, /onOpenChange=\{/);
  assert.match(timezoneSelectorSource, /<DialogContent className="settings-timezone-selector__content">/);
});

test("5. The option list is built from the shared buildTimezoneOptions/filterTimezoneOptions helpers — no second, divergent option source", () => {
  assert.match(timezoneSelectorSource, /buildTimezoneOptions\(\)/);
  assert.match(timezoneSelectorSource, /filterTimezoneOptions\(allOptions, query\)/);
});

test("6. Selecting an option calls onChange with the option id and closes the popup (setIsOpen(false))", () => {
  const handleSelectMatch = timezoneSelectorSource.match(/const handleSelect = \(option: TimezoneOption\) => \{([\s\S]*?)\};/);
  assert.ok(handleSelectMatch, "expected a handleSelect function");
  assert.match(handleSelectMatch[1], /onChange\(option\.id\)/);
  assert.match(handleSelectMatch[1], /setIsOpen\(false\)/);
});

test("7. Closing the popup (any path) resets the search query, so reopening never shows stale filtered results", () => {
  assert.match(timezoneSelectorSource, /if \(!nextOpen\) \{\s*setQuery\(""\);/);
});

test("8. TimezoneSelector never calls the backend directly — it only calls onChange (the draft setter); no Supabase/RPC/fetch reference exists in this file", () => {
  assert.doesNotMatch(timezoneSelectorSource, /supabase/i);
  assert.doesNotMatch(timezoneSelectorSource, /update_user_timezone|updateUserTimezone/);
  assert.doesNotMatch(timezoneSelectorSource, /fetch\(/);
});

console.log("\n=== SettingsSection: Save still persists through update_user_timezone only ===\n");

const settingsSectionSource = read("src/features/user-profile/sections/settings/SettingsSection.tsx");

test("9. TimezoneSelector's onChange only ever updates the local draft state (setTimezoneDraft) — selecting an option never triggers a save", () => {
  const wiringMatch = settingsSectionSource.match(/<TimezoneSelector[\s\S]*?\/>/);
  assert.ok(wiringMatch, "expected a <TimezoneSelector ... /> usage");
  assert.match(wiringMatch[0], /onChange=\{\(value\) => \{\s*setTimezoneDraft\(value\);/);
  assert.doesNotMatch(wiringMatch[0], /updateUserTimezone/);
});

test("10. Only the explicit Save action (handleSaveTimezone) calls updateUserTimezone, and it is the only timezone-write RPC referenced in this file", () => {
  const handleSaveMatch = settingsSectionSource.match(/const handleSaveTimezone = \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(handleSaveMatch, "expected a handleSaveTimezone function");
  assert.match(handleSaveMatch[0], /updateUserTimezone\(authSession, timezoneDraft\)/);

  const updateCalls = settingsSectionSource.match(/updateUserTimezone\(/g) ?? [];
  assert.equal(updateCalls.length, 1, "updateUserTimezone must be called from exactly one place (Save)");
  assert.doesNotMatch(settingsSectionSource, /initializeUserTimezone/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("timezone-selector-interaction guard failed");
  process.exit(1);
}

console.log("timezone-selector-interaction guard passed");
