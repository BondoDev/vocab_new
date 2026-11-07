import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const outDir = '.playwright-build';
const fingerprintFile = join(root, outDir, '.source-fingerprint');

// Never load the production Vite config: its loadEnv call reads local secrets.
// Empty envPrefix also prevents arbitrary inherited VITE_* values from shipping.
const config = {
  root,
  configFile: false,
  envDir: false,
  envPrefix: [],
  mode: 'browser-test',
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('../../../src', import.meta.url)) } },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:4173/__mock-supabase'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('browser-tests-only'),
    'import.meta.env.VITE_GA_MEASUREMENT_ID': JSON.stringify(''),
  },
  build: { outDir, emptyOutDir: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, open: false },
};

// Everything the client build can read. Content (not mtime) is hashed, so any
// edit, addition, deletion or rename under these paths forces a rebuild.
// Tailwind only scans src/ (see src/styles/tailwind.css), and node_modules is
// represented by the lockfile. This script is included so config edits rebuild.
const BUILD_INPUTS = ['src', 'public', 'index.html', 'package-lock.json', 'postcss.config.mjs', 'tsconfig.json', 'scripts/tests/browser/serve.mjs'];

function hashSources() {
  const hash = createHash('sha256');
  const visit = (absolute) => {
    if (!existsSync(absolute)) return;
    if (statSync(absolute).isDirectory()) {
      for (const name of readdirSync(absolute).sort()) visit(join(absolute, name));
      return;
    }
    hash.update(relative(root, absolute).replaceAll('\\', '/')).update('\0');
    hash.update(readFileSync(absolute)).update('\0');
  };
  for (const input of BUILD_INPUTS) visit(join(root, input));
  return hash.digest('hex');
}

// Local runs reuse the previous build only when the source fingerprint matches
// exactly. CI and PLAYWRIGHT_FORCE_BUILD=1 always rebuild from scratch. The
// fingerprint is written only after a successful build and removed before a new
// one, so an interrupted build can never be mistaken for a valid cache.
const forceBuild = Boolean(process.env.CI) || process.env.PLAYWRIGHT_FORCE_BUILD === '1';

// Concurrency guard: hold the preview port (strictPort) from before the cache
// check until preview takes over. A second local test process then fails here
// instead of reading the fingerprint or rebuilding the shared output under a
// running server. The OS releases the port if this process dies, so no stale
// lock file can remain. It answers 503 so Playwright keeps waiting for preview.
const portGuard = createServer((_request, response) => response.writeHead(503).end());
await new Promise((resolve, reject) => {
  portGuard.once('error', (error) => reject(error.code === 'EADDRINUSE'
    ? new Error(`[browser-test server] Port ${config.preview.port} is in use; another browser-test run is active. Run one at a time.`)
    : error));
  portGuard.listen(config.preview.port, config.preview.host, resolve);
});
const fingerprint = hashSources();
const cached = !forceBuild
  && existsSync(join(root, outDir, 'index.html'))
  && existsSync(fingerprintFile)
  && readFileSync(fingerprintFile, 'utf8') === fingerprint;

if (cached) {
  console.log(`[browser-test server] Source unchanged; reusing ${outDir}/ (set PLAYWRIGHT_FORCE_BUILD=1 to rebuild).`);
} else {
  rmSync(fingerprintFile, { force: true });
  // Client-only build: no production prebuild, prerender, SSR, or dist reuse.
  await build(config);
  // Sources edited while the build ran would make this output stale: skip the
  // fingerprint so the next run rebuilds instead of trusting it.
  if (hashSources() === fingerprint) writeFileSync(fingerprintFile, fingerprint);
  else console.warn('[browser-test server] Sources changed during build; next run will rebuild.');
}

await new Promise((resolve) => portGuard.close(resolve));
const server = await preview(config);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.httpServer.close(() => process.exit(0)));
}
