// Deterministic guard for the dependency-removal decisions recorded in
// docs/dependency-audit.md (2026-07-15 cleanup, starting commit 165f0486).
// This is intentionally not a full dependency-graph analyzer — it protects
// the specific facts that audit established: which packages were proven
// unused and removed, which packages the retained UI primitives still need,
// and that package.json's script commands only invoke declared binaries.
//
// Read-only. No network. No browser. Node standard library only.
// Run: node scripts/test-dependency-ownership.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), "..");

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

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
const auditDoc = fs.readFileSync(path.join(ROOT_DIR, "docs", "dependency-audit.md"), "utf8");

// The 36 direct dependencies proven unused and removed by the 2026-07-15 audit.
const REMOVED_PACKAGES = [
  "@radix-ui/react-accordion",
  "@radix-ui/react-aspect-ratio",
  "@radix-ui/react-avatar",
  "@radix-ui/react-checkbox",
  "@radix-ui/react-collapsible",
  "@radix-ui/react-context-menu",
  "@radix-ui/react-hover-card",
  "@radix-ui/react-menubar",
  "@radix-ui/react-navigation-menu",
  "@radix-ui/react-progress",
  "@radix-ui/react-radio-group",
  "@radix-ui/react-scroll-area",
  "@radix-ui/react-separator",
  "@radix-ui/react-slider",
  "@radix-ui/react-switch",
  "@radix-ui/react-tabs",
  "@radix-ui/react-toggle",
  "@radix-ui/react-toggle-group",
  "@radix-ui/react-tooltip",
  "recharts",
  "embla-carousel-react",
  "cmdk",
  "react-day-picker",
  "vaul",
  "react-hook-form",
  "sonner",
  "next-themes",
  "input-otp",
  "react-resizable-panels",
  "@mui/material",
  "@mui/icons-material",
  "@emotion/react",
  "@emotion/styled",
  "@popperjs/core",
  "react-popper",
  "react-slick",
];

// Packages the 9 retained src/app/components/ui/ files depend on (see
// docs/ui-component-audit.md's per-file mapping and docs/dependency-audit.md
// §"Full direct-dependency inventory").
const RETAINED_UI_PACKAGES = [
  "@radix-ui/react-alert-dialog",
  "@radix-ui/react-dialog",
  "@radix-ui/react-dropdown-menu",
  "@radix-ui/react-label",
  "@radix-ui/react-popover",
  "@radix-ui/react-select",
  "@radix-ui/react-slot",
  "class-variance-authority",
  "clsx",
  "tailwind-merge",
];

const directDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
const directDepNames = Object.keys(directDeps);

console.log("\n=== dependency-ownership guards ===\n");

test("every removed package is absent from package.json", () => {
  const reintroduced = REMOVED_PACKAGES.filter((name) => name in directDeps);
  assert.deepEqual(reintroduced, [], `reintroduced removed package(s): ${reintroduced.join(", ")}`);
});

test("every retained UI package is still declared", () => {
  const missing = RETAINED_UI_PACKAGES.filter((name) => !(name in directDeps));
  assert.deepEqual(missing, [], `missing retained UI package(s): ${missing.join(", ")}`);
});

test("every direct dependency is represented in docs/dependency-audit.md", () => {
  const missingFromAudit = directDepNames.filter((name) => !auditDoc.includes(name));
  assert.deepEqual(
    missingFromAudit,
    [],
    `package(s) declared but not documented in docs/dependency-audit.md: ${missingFromAudit.join(", ")}`,
  );
});

test("docs/dependency-audit.md documents every removed package with a concrete classification", () => {
  const undocumented = REMOVED_PACKAGES.filter(
    (name) => !new RegExp(`\\| ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\|`).test(auditDoc),
  );
  assert.deepEqual(undocumented, [], `removed package(s) missing a table row: ${undocumented.join(", ")}`);
});

test("package manifest direct-dependency total matches the audit's documented total (32)", () => {
  assert.equal(directDepNames.length, 32, `expected 32 direct dependencies, found ${directDepNames.length}`);
});

console.log("\n=== script/binary ownership guards ===\n");

test("package.json scripts only invoke node, npm, or a declared dependency binary", () => {
  const KNOWN_BUILTIN_COMMANDS = new Set(["node", "npm"]);
  const problems = [];
  for (const [scriptName, command] of Object.entries(pkg.scripts ?? {})) {
    const segments = command.split("&&").map((s) => s.trim());
    for (const segment of segments) {
      const firstToken = segment.split(/\s+/)[0];
      if (KNOWN_BUILTIN_COMMANDS.has(firstToken)) continue;
      if (firstToken in directDeps) continue;
      problems.push(`${scriptName}: "${firstToken}" (from "${segment}")`);
    }
  }
  assert.deepEqual(problems, [], `script(s) invoking an undeclared binary: ${problems.join("; ")}`);
});

console.log("\n=== source/CSS reference guards ===\n");

function walkFiles(dir, extensions, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(abs, extensions, out);
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      out.push(abs);
    }
  }
  return out;
}

const sourceFiles = [
  ...walkFiles(path.join(ROOT_DIR, "src"), [".ts", ".tsx", ".css", ".scss"]),
  ...walkFiles(path.join(ROOT_DIR, "workers"), [".ts", ".tsx"]),
];

test("no source or CSS file imports a removed package", () => {
  const offenders = [];
  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, "utf8");
    for (const name of REMOVED_PACKAGES) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`["'\`]${escaped}(/[^"'\`]*)?["'\`]`).test(content)) {
        offenders.push(`${path.relative(ROOT_DIR, file)} references "${name}"`);
      }
    }
  }
  assert.deepEqual(offenders, [], `file(s) still referencing a removed package: ${offenders.join("; ")}`);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("dependency-ownership guards passed");
}
