// Guards the brand-asset ownership contract established by the 2026-07-16
// favicon audit (see docs/brand-asset-ownership.md). Protects: the four
// optimized public brand assets exist with their exact contracted
// dimensions and size budgets, the non-public 1024px master is retained
// under src/assets/brand/, every HTML/SEO/Worker reference points at an
// existing public asset with a matching MIME declaration, and the
// oversized-favicon regression (1.5 MB PNG served as favicon) cannot
// silently return.
//
// Read-only. No network. No credentials read. Node standard library only.
// Run: node scripts/tests/architecture/test-brand-asset-ownership.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), "..", "..", "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const MASTER_PATH = path.join(ROOT_DIR, "src", "assets", "brand", "favicon-master.png");
const DOC_PATH = path.join(ROOT_DIR, "docs", "brand-asset-ownership.md");

// Contract: every public brand asset, its exact dimensions, and its byte
// budget. Budgets are deliberate ceilings from docs/brand-asset-ownership.md
// — raising one requires editing the doc and this list together.
const PUBLIC_BRAND_ASSETS = {
  "favicon.png": { width: 96, height: 96, maxBytes: 25 * 1024 },
  "favicon.ico": { icoSizes: [16, 32, 48], maxBytes: 50 * 1024 },
  "apple-touch-icon.png": { width: 180, height: 180, maxBytes: 100 * 1024 },
  "og-image.png": { width: 1200, height: 630, maxBytes: 500 * 1024 },
};

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

function pngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.ok(buf.length > 24, `${filePath} is too small to be a PNG`);
  assert.equal(buf.readUInt32BE(0), 0x89504e47, `${filePath} missing PNG signature`);
  assert.equal(buf.toString("ascii", 12, 16), "IHDR", `${filePath} missing IHDR chunk`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function icoFrameSizes(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.ok(buf.length > 6, `${filePath} is too small to be an ICO`);
  assert.equal(buf.readUInt16LE(0), 0, `${filePath} bad ICO reserved field`);
  assert.equal(buf.readUInt16LE(2), 1, `${filePath} is not an ICO (type != 1)`);
  const count = buf.readUInt16LE(4);
  const sizes = [];
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    const w = buf[entry] === 0 ? 256 : buf[entry];
    const h = buf[entry + 1] === 0 ? 256 : buf[entry + 1];
    assert.equal(w, h, `${filePath} frame ${i} is not square (${w}x${h})`);
    sizes.push(w);
  }
  return sizes.sort((a, b) => a - b);
}

const indexHtml = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");
const siteTs = fs.readFileSync(path.join(ROOT_DIR, "src", "seo", "site.ts"), "utf8");

console.log("\n=== public brand-asset existence & budget guards ===\n");

for (const [name, contract] of Object.entries(PUBLIC_BRAND_ASSETS)) {
  test(`public/${name} exists within its ${Math.round(contract.maxBytes / 1024)} KB budget`, () => {
    const filePath = path.join(PUBLIC_DIR, name);
    assert.ok(fs.existsSync(filePath), `public/${name} is missing`);
    const bytes = fs.statSync(filePath).size;
    assert.ok(
      bytes <= contract.maxBytes,
      `public/${name} is ${bytes} bytes, exceeding the ${contract.maxBytes}-byte budget`
    );
  });
}

console.log("\n=== dimension guards ===\n");

for (const [name, contract] of Object.entries(PUBLIC_BRAND_ASSETS)) {
  const filePath = path.join(PUBLIC_DIR, name);
  if (!fs.existsSync(filePath)) continue;
  if (contract.icoSizes) {
    test(`public/${name} contains exactly the ${contract.icoSizes.join("/")} frames`, () => {
      assert.deepEqual(icoFrameSizes(filePath), contract.icoSizes);
    });
  } else {
    test(`public/${name} is exactly ${contract.width}x${contract.height}`, () => {
      const dims = pngDimensions(filePath);
      assert.deepEqual(dims, { width: contract.width, height: contract.height });
    });
  }
}

console.log("\n=== master-source guards ===\n");

test("non-public master exists at src/assets/brand/favicon-master.png (1024x1024)", () => {
  assert.ok(fs.existsSync(MASTER_PATH), "favicon-master.png is missing");
  const dims = pngDimensions(MASTER_PATH);
  assert.deepEqual(dims, { width: 1024, height: 1024 });
});

test("no oversized brand master sits under public/", () => {
  const offenders = fs
    .readdirSync(PUBLIC_DIR)
    .filter((f) => /\.(png|ico|jpg|jpeg|webp|svg)$/i.test(f))
    .filter((f) => fs.statSync(path.join(PUBLIC_DIR, f)).size > 500 * 1024);
  assert.deepEqual(offenders, [], `oversized public image(s): ${offenders.join(", ")}`);
});

console.log("\n=== HTML declaration guards ===\n");

test('index.html <link rel="icon"> references an existing public PNG with type image/png', () => {
  const match = indexHtml.match(/<link\s+rel="icon"\s+type="([^"]+)"\s+href="\/([^"]+)"/);
  assert.ok(match, 'no <link rel="icon"> declaration found in index.html');
  assert.equal(match[1], "image/png", `declared MIME ${match[1]} != image/png`);
  assert.ok(match[2].endsWith(".png"), `declared type image/png but href is ${match[2]}`);
  assert.ok(fs.existsSync(path.join(PUBLIC_DIR, match[2])), `public/${match[2]} is missing`);
});

test("index.html apple-touch-icon declaration references an existing public file", () => {
  const match = indexHtml.match(/<link\s+rel="apple-touch-icon"\s+href="\/([^"]+)"/);
  assert.ok(match, "no apple-touch-icon declaration found in index.html");
  assert.ok(fs.existsSync(path.join(PUBLIC_DIR, match[1])), `public/${match[1]} is missing`);
});

test("index.html og:image references an existing public asset on the canonical host", () => {
  const match = indexHtml.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
  assert.ok(match, "no og:image declaration found in index.html");
  const url = new URL(match[1]);
  assert.equal(url.origin, "https://www.fluentstellar.com", `og:image host ${url.origin} is not canonical`);
  assert.ok(fs.existsSync(path.join(PUBLIC_DIR, url.pathname.slice(1))), `public${url.pathname} is missing`);
});

test("declared og:image:width/height match the actual og-image dimensions", () => {
  const w = indexHtml.match(/<meta\s+property="og:image:width"\s+content="(\d+)"/);
  const h = indexHtml.match(/<meta\s+property="og:image:height"\s+content="(\d+)"/);
  const img = indexHtml.match(/<meta\s+property="og:image"\s+content="[^"]*\/([^"/]+)"/);
  assert.ok(w && h && img, "og:image width/height/content declarations incomplete");
  const dims = pngDimensions(path.join(PUBLIC_DIR, img[1]));
  assert.deepEqual(
    { width: Number(w[1]), height: Number(h[1]) },
    dims,
    `declared ${w[1]}x${h[1]} != actual ${dims.width}x${dims.height}`
  );
});

console.log("\n=== SEO / Worker reference guards ===\n");

test("DEFAULT_OG_IMAGE in src/seo/site.ts matches the index.html og:image URL", () => {
  const htmlOg = indexHtml.match(/<meta\s+property="og:image"\s+content="([^"]+)"/)?.[1];
  const tsOg = siteTs.match(/DEFAULT_OG_IMAGE\s*=\s*`\$\{DEFAULT_SITE_ORIGIN\}(\/[^`]+)`/)?.[1];
  assert.ok(tsOg, "DEFAULT_OG_IMAGE not found in src/seo/site.ts");
  assert.equal(`https://www.fluentstellar.com${tsOg}`, htmlOg, "site.ts and index.html og:image diverge");
});

test("tracked Worker client-asset manifests point faviconHref at an existing public asset", () => {
  for (const rel of ["client-assets.full.json"]) {
    const file = path.join(ROOT_DIR, "workers", "word-ssr", "data", rel);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.ok(data.faviconHref, `${rel} has no faviconHref`);
    const target = path.join(PUBLIC_DIR, data.faviconHref.replace(/^\//, ""));
    assert.ok(fs.existsSync(target), `${rel} faviconHref ${data.faviconHref} has no public source`);
  }
});

test("no stale brand-asset reference remains in index.html or src/seo/", () => {
  const sources = [
    ["index.html", indexHtml],
    ["src/seo/site.ts", siteTs],
    ["src/seo/SeoContext.tsx", fs.readFileSync(path.join(ROOT_DIR, "src", "seo", "SeoContext.tsx"), "utf8")],
  ];
  const offenders = [];
  for (const [name, content] of sources) {
    for (const m of content.matchAll(/\/(favicon[\w.-]*|og-image[\w.-]*|apple-touch-icon[\w.-]*)/g)) {
      if (!fs.existsSync(path.join(PUBLIC_DIR, m[1]))) offenders.push(`${name}: /${m[1]}`);
    }
  }
  assert.deepEqual(offenders, [], `stale reference(s): ${offenders.join(", ")}`);
});

console.log("\n=== ownership-documentation guards ===\n");

test("docs/brand-asset-ownership.md documents every public brand asset", () => {
  assert.ok(fs.existsSync(DOC_PATH), "docs/brand-asset-ownership.md is missing");
  const doc = fs.readFileSync(DOC_PATH, "utf8");
  const missing = Object.keys(PUBLIC_BRAND_ASSETS).filter((name) => !doc.includes(name));
  assert.deepEqual(missing, [], `asset(s) undocumented: ${missing.join(", ")}`);
  assert.ok(doc.includes("favicon-master.png"), "master source undocumented");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("brand-asset-ownership guards passed");
}
