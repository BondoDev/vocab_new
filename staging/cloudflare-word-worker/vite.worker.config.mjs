// STAGING-ONLY Vite config used solely to pre-bundle the Worker's SSR entry.
// noExternal forces Vite to inline npm dependencies (react, react-dom,
// react-router-dom, lucide-react) into the output instead of leaving them as
// bare specifiers Node would resolve from node_modules — Workers has no
// node_modules resolution at runtime. The import.meta.glob-derived lazy
// chunks (vocabulary/*, interface/*, word-browse-shards/*) are unaffected by
// this setting and remain separate files, which is what keeps the deployed
// Worker script small (see bundle-size findings in the final report).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "..", "..", "src"),
    },
  },
  ssr: {
    noExternal: true,
  },
  define: {
    // React's CJS-interop shims (e.g. react/jsx-runtime's production/dev
    // split) reference process.env.NODE_ENV at module scope. Workers has no
    // `process` global at all (unlike Node), so this must be statically
    // replaced at build time — once it's a literal, esbuild/Rollup dead-code
    // -eliminate the unreached branch and no runtime `process` reference
    // remains. This avoids needing the nodejs_compat compatibility flag.
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
