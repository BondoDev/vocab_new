import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = fileURLToPath(new URL('../../../', import.meta.url));

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
  build: { outDir: '.playwright-build', emptyOutDir: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, open: false },
};

// Client-only build: no production prebuild, prerender, SSR, or dist reuse.
await build(config);
const server = await preview(config);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.httpServer.close(() => process.exit(0)));
}
