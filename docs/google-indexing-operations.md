# Google indexing operations

Manual-only operator script that submits FluentStellar URLs to the Google
Indexing API (Search Console). Never wired into `prebuild`, `build`, CI,
Cloudflare deploy, `postinstall`, or any scheduled task — it is run by hand
when the operator wants to nudge indexing for new or changed pages.

Audited and relocated 2026-07-16 (previously root-level `google-index.js`).
Guard: `npm run test:operational-security`
(`scripts/test-operational-security.mjs`), chained into
`npm run test:architecture-guards`.

## Command

```bash
npm run google:index               # submit up to 200 pending URLs
npm run google:index -- --limit=50 # smaller batch
npm run google:index -- --url=https://www.fluentstellar.com/some/page
npm run google:index -- --dry-run  # resolve + validate, no API calls
npm run google:index -- --help
```

Equivalent direct invocation: `node scripts/operations/google-index.mjs`.

## URL source and batching

- Default source: the live sitemap tree under `public/sitemap.xml` +
  `public/sitemaps/*.xml`, parsed locally (no network fetch).
- `--url=<url>` submits exactly one explicit URL instead.
- Only URLs beginning with `https://www.fluentstellar.com/` are accepted;
  anything else is rejected before any request is made.
- Default batch limit is 200 URLs per run (`--limit=<n>` to override).
  URLs already recorded in the progress state are skipped first, then the
  remaining pending URLs are capped at the limit.

## Credential setup

Resolution order:

1. `GOOGLE_APPLICATION_CREDENTIALS` — an OS environment variable (set in
   your shell, not in `.env`) pointing at a service-account JSON key file
   anywhere on disk.
2. Fallback: `service-account.json` at the repo root (legacy path, kept for
   backward compatibility). This file **must never be committed** — it is
   covered by `.gitignore` (`service-account.json`, `service-account*.json`).

The script fails with a clear, secret-free error if neither resolves to a
readable file. It never prints key contents, tokens, or full API response
bodies — only `error.message` on failures.

### Rotating a compromised or old service-account key

1. In Google Cloud Console → IAM & Admin → Service Accounts, open the
   `fluentstellar-indexing` service account.
2. Create a new key (JSON), download it, store it outside the repo (or as
   the repo-root `service-account.json`, which stays gitignored).
3. Point `GOOGLE_APPLICATION_CREDENTIALS` at the new file, or replace the
   local fallback file.
4. Delete the old key from the service account in Cloud Console.
5. If a key was ever committed to Git history, rotation is mandatory even
   after the file is deleted from the latest commit — a deleted file does
   not undo exposure of a historical blob. History rewriting (if pursued
   later) is a separate, additional step from rotation, requires a
   force-push, and means every collaborator/clone must recreate their
   local copy of the repo.

## Progress state

- Path: `scripts/operations/state/indexed-progress.json` (gitignored,
  covered by the `indexed-progress.json` and `scripts/operations/state/`
  `.gitignore` entries).
- Contents: a flat JSON array of successfully submitted URL strings only —
  no timestamps, no tokens, no API response bodies.
- Created automatically (as `[]`) if missing.
- Writes are atomic (write to a temp file, then rename) so a killed process
  can't leave a half-written progress file.
- If the file is malformed JSON, the script fails with a clear error rather
  than silently discarding state. To recover: fix the JSON by hand, or
  delete the file — it is fully regenerable, but any existing resume state
  (which URLs were already submitted) will be lost, and previously-indexed
  URLs may be resubmitted on the next run (harmless, just wasted quota).

## Dry-run usage

`--dry-run` resolves and validates the URL list (including domain
validation and progress-file dedup) and prints what would be submitted,
but makes no Google API requests and does not modify the progress file.
Use it to sanity-check a run before spending API quota.

## What Git ignores

```
.env
.env.*
!.env.example
service-account.json
service-account*.json
indexed-progress.json
scripts/operations/state/
```

## Environment variables

`.env` in this repo is otherwise only for `VITE_`-prefixed client variables
loaded by Vite. `GOOGLE_APPLICATION_CREDENTIALS` is unrelated to that
mechanism — it's a plain OS environment variable read directly via
`process.env` when you run the script manually. See `.env.example` for a
documented placeholder (no real values).
