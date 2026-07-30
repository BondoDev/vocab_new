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
- Scale verification to the size and risk of the change. A small, low-risk
  edit (copy tweak, reordering elements, a rename) does not need a
  type-check, a guard-test run, or a browser/Playwright verification pass —
  reserve that level of checking for changes where logic, layout, or
  behavior could plausibly break. Do not run tests or audits "just in case"
  on trivial changes; it inflates task time without reducing real risk.

Suggested warning: `This may require a broader scan/build and use more tokens. Proceed?`

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
