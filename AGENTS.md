# FluentStellar collaboration guide

`AGENTS.md` is the single repository-wide instruction file for AI agents and
developers. README files in subfolders may add local ownership, file-placement,
and workflow rules; follow the nearest applicable local instructions whenever
working in that folder.

## Cheap-first workflow

- Prefer targeted reads and focused searches. Do not perform broad repository
  scans unless they are necessary.
- Avoid repeating scans or checks unless new evidence justifies them.
- Do not run builds, full test chains, sitemap generation, or other expensive
  checks unless the user explicitly requests them or they are materially
  necessary for safe completion.
- Warn the user before genuinely expensive work. Ordinary focused tests do not
  need a warning.
- Summarize command output instead of dumping large logs. Keep progress updates
  concise and report meaningful findings, changes, and verification results.
- Do not run checks after every task by default. Run a check only when the
  change could plausibly break something that check would catch, and run
  the lightest one that covers that risk:
  - Copy, styling, layout tweaks, reordering, renames, docs: no checks.
  - TypeScript logic or type changes: `npx tsc --noEmit`, plus the one
    focused test for that area if one exists.
  - Routing, SSR/prerender, sitemap, or SEO output changes: the relevant
    focused test; run `npm run build` or `npm run test:seo-output` only
    when the change actually affects what they verify.
- Do not start a dev server, run browser/Playwright passes, or take
  screenshots unless the user asks or a behavior cannot be confirmed any
  other way. Do not add new tests for small changes unless asked.
- Do not repeat a check that already passed unless the code it covers has
  changed since. Never run tests or audits "just in case"; it inflates task
  time without reducing real risk.
- When checks are skipped, say so in one line in the final report so the
  user can request them.

Suggested warning: `This may require a broader scan/build and use more tokens. Proceed?`

## UI/UX design workflow

For new pages or significant visual design changes:

1. **UI UX Pro Max** — Use by default for design planning, including layouts, typography, colors, spacing, and UX.
2. **Frontend Design** — Use for implementing new interfaces or significant redesigns.
3. **Impeccable** — Use for final visual review and polishing when beneficial.

Rules:
- Select only the skills relevant to the task; don't automatically run all three.
- For small CSS fixes, text changes, or minor adjustments, no design skill is necessary.
- Preserve FluentStellar's existing visual identity, functionality, and styling conventions.
- Prefer existing components and styles over introducing new dependencies.
- Avoid generic SaaS layouts, excessive whitespace, and repetitive card designs.
- Keep skill usage token-efficient.
- Verify responsive layouts and functionality after meaningful UI changes.

## Git control

- Perform Git actions only after explicit user instruction.
- Do not commit, push, fetch, pull, merge, rebase, reset, stash, switch
  branches, or open a pull request unless requested or directly required by the
  requested Git action.
- Never force-push or rewrite history. Preserve unrelated changes.
- Before an explicitly requested push, inspect the remote, fetch, and compare
  local and remote history. Stop on divergence or unexpected remote
  advancement.
- An explicitly authorized direct push to `master` is permitted. Do not invent
  a mandatory feature-branch or pull-request workflow.

## Comments and maintainability

Important non-obvious logic must be documented, but obvious code should remain
uncluttered. Add concise, accurate, professional comments where they materially
improve maintainability or comprehension—especially for architecture
boundaries, SSR and hydration behavior, state ownership, effect ordering,
routing precedence or parsing, generated-data ownership, guard constraints,
unusual performance or compatibility decisions, and code that would otherwise
be easy to simplify incorrectly.

Comments should explain intent, invariants, lifecycle assumptions, ownership,
constraints, or why a design exists. Do not restate obvious code or annotate
small self-explanatory expressions and trivial functions. Update or remove
comments when behavior changes so they never become misleading.

## Files and folders

Before adding a file or folder, inspect the target directory and read its
`README.md` if present. Also read the nearest applicable parent-folder README
when it defines ownership, naming, generated-data, or placement rules. Follow
the documented naming, ownership, barrel-export, testing, and generated-file
conventions. Do not create an item until its correct ownership location is
established.

After adding any file or folder, AI agents must tell the user what was added,
whether it is a file or folder, its exact repository-relative path, its
purpose, and which local README rules were followed. This reporting requirement
applies even to small additions; developers do not need to provide chat-style
reports while coding.

## Editing and preservation

- Preserve unrelated work and inspect dependencies before moving or deleting
  files.
- Use `git mv` when a history-preserving move is requested.
- Do not delete or rewrite code solely because it appears unused; verify its
  consumers first.
- Do not hand-edit generated artifacts unless their ownership documentation
  explicitly permits it.
- Use focused verification proportional to the change and do not broaden scope
  without user approval.

## Graphify knowledge graph

A local, gitignored structure graph of `src/` lives in `src/graphify-out/`
(`graph.json`, `GRAPH_REPORT.md`, `graph.html`). Generated `*.json` data is
excluded via `src/graphify-out/.graphify_build.json`. Never commit it.

- **Use it first, with focused commands**, for architecture, dependency,
  ownership, or cross-module questions. All take
  `--graph src/graphify-out/graph.json`:
  - `graphify explain "Symbol()"` — one node and its direct connections.
  - `graphify path "A()" "B()"` — how two symbols connect.
  - `graphify query "<question>" --budget 1500` — broader context; keep the
    budget small and narrow the question rather than raising it.
  Never read `graph.json` or `graph.html`, and read only the needed section of
  `GRAPH_REPORT.md`. Routine edits to known files need no graph lookup at all.
- **Verify against source before acting.** The graph uses graphify's legacy
  node-ID scheme, so same-named symbols in different files can collide; an
  ambiguous name lists its candidates (re-query with the listed `path::symbol`
  or node id). Treat INFERRED/AMBIGUOUS edges as leads, not facts, and never
  justify a refactor by centrality alone.
- **Refresh once, at the end, only when structure changed.** If a task added,
  removed, renamed, or moved files under `src/`, or changed imports/exports or
  component, hook, or module boundaries, run `graphify update src` once after
  the last edit — not after each edit. It is incremental, code-only, uses no
  LLM or tokens, and keeps the saved community names and `*.json` exclusion.
  Skip it for copy, styling, comment, test-only, or logic changes inside
  existing functions. If others' changes were pulled since the last refresh,
  run it once before relying on the graph.
- **README changes under `src/`** need the token-costing semantic pass
  (`/graphify src --update`); run it only when a README's ownership or
  architecture rules changed, and mention it in the report.
- If `src/graphify-out/` is missing, do not rebuild it automatically; ask the
  user before running a full `/graphify src` build.
- Report a refresh (or why one was skipped) in one line.

## Quick reference

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server. |
| `npm run build` | Generate client and SSR bundles, prerender static routes, and verify the SSR package. |
| `npm run sitemap` | Regenerate sitemap files. |
| `npx tsc --noEmit` | Type-check without emitting files. |
| `npm run test:architecture-guards` | Run repository architecture and ownership guards. |
| `npm run test:seo-output` | Run the SEO and rendering regression suite. |

For project and ownership detail, use [README.md](README.md),
[architecture](docs/architecture.md), [deployment](docs/deployment.md),
[dependency ownership](docs/dependency-ownership.md),
[generated data](docs/generated-data.md), and
[scripts](scripts/README.md). Do not duplicate their detailed architecture in
this guide.

## Reporting

- Clearly disclose skipped checks and why.
- Do not claim a test, build, commit, push, or deployment occurred unless it
  actually occurred.
- Always report newly added files and folders with their exact paths.
