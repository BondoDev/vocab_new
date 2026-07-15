# Agent-tool folders (`.agents/`, `.claude/`, `.codex/`)

Audited 2026-07-16. Guard script: `npm run test:agent-folder-ownership`
(`scripts/test-agent-folder-ownership.mjs`), wired into
`npm run test:architecture-guards`.

## Why these folders reappear

`.agents/`, `.claude/`, and `.codex/` are created locally by AI coding
assistants (Claude Code, Codex-style CLIs, and similar tools) when they run
against this repository. They store per-machine session state — locks,
scheduled-task metadata, caches — not project source. Deleting them by hand
does nothing to stop a tool from recreating them the next time it runs; that
is expected, not a repository bug.

Git does not track empty directories, so a folder can exist on disk with
zero effect on `git status`. The only thing that matters for repository
hygiene is whether a **file** inside one of these folders is tracked or
would be tracked if added.

## Audit findings (2026-07-16)

| Folder | Contents found | Tracked files | Evidence of creator |
|---|---|---|---|
| `.agents/` | Empty (no files) | None | No reference found in this repo or in global tool config. Creator unconfirmed. |
| `.claude/` | `scheduled_tasks.lock` (session id, pid, timestamp) | None | Matches Claude Code's own local-only `.git/info/exclude` block (`# claude-code-runtime`), which already ignores this exact filename and sibling state files (`scheduled_tasks.json`, `routines/.state/`, `worktrees/`, `checkpoints/`, `mailbox/`, `agent-registry.json`, `agent-memory-local`, `first-run`, `assistant-daemon-state.json`). |
| `.codex/` | Empty (no files) | None | The global `~/.codex/config.toml` on this machine lists this repository under `[projects.'...\wcb_web']`, confirming a Codex-style CLI is used against this project and would write local state here. |

No file in any of the three folders contained project instructions,
duplicated `CLAUDE.md`, or duplicated any other tracked documentation.
Nothing sensitive (keys, tokens, credentials) was found.

## Canonical instructions

Project-wide instructions for AI assistants live in exactly one place:

- `CLAUDE.md` (repository root)

`guidelines/Guidelines.md` and `docs/` hold human-facing guidance and
architecture notes (see `docs/guidelines-folder-ownership.md`). None of the
three tool folders should ever hold instructional content — if a tool ever
writes a project-instructions file into `.claude/` or `.codex/`, move the
unique content into `CLAUDE.md` and delete the copy, rather than tracking it
in place.

## Git policy

All three folders are ignored wholesale in the tracked `.gitignore`:

```
.agents/
.claude/
.codex/
```

A whole-directory rule (rather than a selective `!exception`) was used
because the audit found zero tracked or intentionally-shared files in any of
the three folders — there is nothing to carve out. If a future need arises
for one shared, human-reviewed file inside one of these folders, add a
narrow negation (`.claude/*` + `!.claude/some-shared-file.json`) instead of
widening this rule, and document the exception here.

This tracked rule is the authoritative, cross-machine safety net. A
separate, local-only `.git/info/exclude` on this machine already lists
finer-grained Claude Code state filenames; that file is per-clone and never
committed, so it does not help a fresh checkout or a different contributor.
The tracked `.gitignore` rule above covers everyone.

## What must never be committed

- Session IDs, process IDs, lock files, or timestamps from `.claude/`
- Codex or Claude auth tokens, API keys, or credential files
- Local absolute paths or machine identifiers
- Command/session history or private prompt logs

None of these were found tracked as of this audit; the guard script asserts
they stay that way.

## How to inspect these folders safely

```bash
git ls-files .agents .claude .codex   # should always print nothing
git check-ignore -v .claude/<file>    # confirms a given file is ignored
```

## How to clean local state safely

Deleting the folders is safe at any time — they hold no data the repository
needs. They may reappear the next time an agent tool runs; that is expected
and is not a sign of repository drift, since nothing inside them is tracked.
