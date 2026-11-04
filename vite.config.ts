import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const repositoryName = (env.GITHUB_REPOSITORY || '').split('/')[1] || ''

  return {
    base: env.GITHUB_ACTIONS ? `/${repositoryName}/` : '/',
    plugins: [
      // The React and Tailwind plugins are both required for Make, even if
      // Tailwind is not being actively used – do not remove them
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        // Alias @ to the src directory
        '@': '/src',
      },
    },
    build: {
      rollupOptions: {
        // Same file-descriptor guard as workers/word-ssr/build/vite.worker.config.mjs:
        // the client build also loads all ~3.5k modules behind lucide-react's
        // barrel export, and Rollup 4's default of 1000 parallel file reads
        // can exhaust the open-file limit on Cloudflare Workers Builds (EMFILE).
        // Concurrency only; output is unchanged.
        maxParallelFileOps: 20,
      },
    },
  }
})
