# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Collaboration Rules

- Default to cheap-first work. Do not do broad repo scans unless necessary.
- Do not run builds, full test suites, sitemap regeneration, or other expensive verification unless the user explicitly asks or it is clearly required to complete the task safely (warn first).
- Before expensive work: "This may require a broader scan/build and use more tokens. Proceed?"
- Prefer targeted file reads and focused searches. Keep responses concise.

## Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # Full SSG build: sitemap → client → server → prerender
npm run sitemap      # Generate sitemap only
```

No test runner is configured.

## Architecture

React 18 + Vite + TypeScript SPA with SSR/SSG capability. Deployed to Cloudflare (Workers Builds + a word-page SSR Worker); GitHub Pages is retired. See [`docs/architecture.md`](docs/architecture.md) for the full system overview and [`docs/deployment.md`](docs/deployment.md) for current production/deployment behavior — this section is a quick agent-facing reference, not the authoritative source.

**Entry points:**
- `src/main.tsx` — browser dev entry
- `src/entry-client.tsx` — hydration entry (production client)
- `src/entry-server.tsx` — SSR entry used by `scripts/build/prerender.mjs`

**Routing:** React Router v6, defined in `src/app/App.tsx`. Routes include language/level/category/exercise selection, vocabulary practice, level exams, SEO hub pages, and about/help.

**State:** `src/contexts/LanguageContext.tsx` holds global app state (selected language, level, exercise settings) and persists to `localStorage`.

**Data:** All vocabulary, inflected forms, UI translations, and level test configs live as JSON files under `src/data/`. Exercise behavior is data-driven from these configs.

**Languages supported:** English (GB), Spanish, French, German, Italian, Portuguese, Russian — with CEFR levels A1–C2.

**Component organization** under `src/app/components/`:
- `exercises/` — exercise type implementations (WordTyping, BrokenWord, ConnectWords, etc.)
- `practice/` — vocabulary practice flow
- `ui/` — shared UI primitives
- `figma/` — Figma integration components

**Styling:** Tailwind CSS v4 (no PostCSS plugin needed) + SCSS modules. Path alias `@` maps to `src/`.

**UI libraries:** Radix UI (headless — alert-dialog, dialog, dropdown-menu, label, popover, select, slot only) + class-variance-authority/clsx/tailwind-merge, Motion (animations), Lucide React (icons), react-dnd (drag-and-drop). See `docs/dependency-ownership.md` for the full dependency inventory (36 unused packages, including MUI/Emotion, recharts, sonner, and React Hook Form, were removed 2026-07-15).
