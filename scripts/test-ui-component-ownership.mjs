// Deterministic guard for src/app/components/ui/ ownership, documented in
// docs/ui-component-ownership.md. Complements scripts/test-interactive-contracts.mjs
// (which guards routing/profile-shell contracts) by guarding the shadcn/ui
// primitive-library surface: the retained set stays reachable, the removed
// set doesn't silently reappear, and no source file points at a missing
// ui/ component. Node stdlib only, read-only, deterministic.
//
// Run: node scripts/test-ui-component-ownership.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const UI_DIR = path.join(ROOT_DIR, "src", "app", "components", "ui");
const AUDIT_DOC = path.join(ROOT_DIR, "docs", "ui-component-ownership.md");

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

// Retained set, as established by the 2026-07-15 audit (docs/ui-component-ownership.md).
const EXPECTED_RETAINED = [
  "alert-dialog.tsx",
  "button.tsx",
  "dialog.tsx",
  "dropdown-menu.tsx",
  "input.tsx",
  "label.tsx",
  "popover.tsx",
  "select.tsx",
  "utils.ts",
].sort();

// Removed set, as established by the same audit — must not silently reappear.
const EXPECTED_REMOVED = [
  "accordion.tsx", "alert.tsx", "aspect-ratio.tsx", "avatar.tsx", "badge.tsx",
  "breadcrumb.tsx", "calendar.tsx", "card.tsx", "carousel.tsx", "chart.tsx",
  "checkbox.tsx", "collapsible.tsx", "command.tsx", "context-menu.tsx",
  "drawer.tsx", "form.tsx", "hover-card.tsx", "input-otp.tsx", "menubar.tsx",
  "navigation-menu.tsx", "pagination.tsx", "progress.tsx", "radio-group.tsx",
  "resizable.tsx", "scroll-area.tsx", "separator.tsx", "sheet.tsx",
  "sidebar.tsx", "skeleton.tsx", "slider.tsx", "sonner.tsx", "switch.tsx",
  "table.tsx", "tabs.tsx", "textarea.tsx", "toggle.tsx", "toggle-group.tsx",
  "tooltip.tsx", "use-mobile.ts",
];

function walkSourceFiles(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(abs, results);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      results.push(abs);
    }
  }
  return results;
}

console.log("\n=== src/app/components/ui/ retained-set integrity ===\n");

const actualFiles = fs
  .readdirSync(UI_DIR, { withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => e.name)
  .sort();

test("src/app/components/ui/ contains exactly the 9 retained files established by the audit", () => {
  assert.deepEqual(
    actualFiles,
    EXPECTED_RETAINED,
    "src/app/components/ui/ file set no longer matches docs/ui-component-ownership.md's retained set — update the audit in the same change if this is intentional",
  );
});

console.log("\n=== removed components do not silently reappear ===\n");

test("none of the 39 audited-and-removed component files have returned", () => {
  const reappeared = EXPECTED_REMOVED.filter((name) =>
    fs.existsSync(path.join(UI_DIR, name)),
  );
  assert.deepEqual(
    reappeared,
    [],
    `removed ui/ file(s) have reappeared without an audit update: ${reappeared.join(", ")}`,
  );
});

console.log("\n=== no dangling imports into src/app/components/ui/ ===\n");

test("every relative import into components/ui/ resolves to a file that exists", () => {
  const srcDir = path.join(ROOT_DIR, "src");
  const files = walkSourceFiles(srcDir);
  // Matches two known-real shapes: a pure "../"-chain ending in "ui/<name>"
  // (a consumer inside src/app/components/), or the same chain continuing
  // through the literal "app/components/" segment (a consumer elsewhere,
  // e.g. src/features/practice/, reaching back into components/ui/). This
  // stays anchored to those two concrete shapes rather than a bare [\w./]+,
  // which would also match unrelated paths that merely end in the letters
  // "ui/" (e.g. a hypothetical "gui/" or "requi/" directory).
  const importPattern = /from\s+["']((?:\.\.?\/)*(?:app\/components\/)?ui\/[a-zA-Z0-9-]+)["']/g;
  const broken = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    let match;
    while ((match = importPattern.exec(text)) !== null) {
      const importerDir = path.dirname(file);
      const resolvedBase = path.resolve(importerDir, match[1]);
      const candidates = [`${resolvedBase}.ts`, `${resolvedBase}.tsx`];
      if (!candidates.some((c) => fs.existsSync(c))) {
        broken.push(`${path.relative(ROOT_DIR, file)} -> ${match[1]}`);
      }
    }
  }
  assert.deepEqual(broken, [], `dangling import(s) into components/ui/: ${broken.join("; ")}`);
});

console.log("\n=== retained components stay reachable ===\n");

test("every retained ui/ file is still imported by at least one file outside components/ui/", () => {
  const srcDir = path.join(ROOT_DIR, "src");
  const files = walkSourceFiles(srcDir).filter(
    (f) => !f.startsWith(UI_DIR + path.sep),
  );
  const allExternalSource = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  const unreferenced = EXPECTED_RETAINED.filter((name) => {
    const base = name.replace(/\.tsx?$/, "");
    // Same anchored shape as the dangling-import check above.
    const pattern = new RegExp(`from\\s+["'](?:\\.\\.?/)*(?:app/components/)?ui/${base}["']`);
    return !pattern.test(allExternalSource);
  }).filter((name) => name !== "utils.ts"); // utils.ts is also reached transitively via other ui/ files; checked separately below.
  assert.deepEqual(
    unreferenced,
    [],
    `retained ui/ file(s) no longer imported from outside components/ui/ — re-audit before removing: ${unreferenced.join(", ")}`,
  );
});

console.log("\n=== audit documentation completeness ===\n");

test("docs/ui-component-ownership.md exists and covers every current ui/ file plus the full removed set", () => {
  assert.ok(fs.existsSync(AUDIT_DOC), "docs/ui-component-ownership.md is missing");
  const text = fs.readFileSync(AUDIT_DOC, "utf8");
  const missing = [...EXPECTED_RETAINED, ...EXPECTED_REMOVED].filter(
    (name) => !text.includes(`\`${name}\``),
  );
  assert.deepEqual(
    missing,
    [],
    `docs/ui-component-ownership.md does not mention: ${missing.join(", ")}`,
  );
});

test("docs/ui-component-ownership.md states the audited totals", () => {
  const text = fs.readFileSync(AUDIT_DOC, "utf8");
  assert.ok(
    text.includes("48 files audited") && text.includes("9 actively used") && text.includes("39 unused and"),
    "docs/ui-component-ownership.md is missing the expected total/used/removed counts",
  );
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("ui-component-ownership guards passed");
}
