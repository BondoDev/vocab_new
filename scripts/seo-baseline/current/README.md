# SEO / performance baseline

`manifest.json`, `performance.json`, and `routes/seo-snapshot-prod.json` were captured 2026-07-14 at source commit `d123ff1c` (master, clean tree). `routes/seo-snapshot-local.json` was refreshed 2026-07-16 at source commit `8e0e0aed` (master, clean tree), adding 3 fixtures (SEO-hub, word-hub summary, word-hub level) that were previously uncovered, as the pre-refactor reference baseline for Issue 15 (the SEO metadata module split).

- `manifest.json` — identity, commands, canonical host, production Worker config (all still from the original 2026-07-14 capture), plus a `localSnapshotRefresh` record documenting the 2026-07-16 partial refresh of `routes/seo-snapshot-local.json` only.
- `performance.json` — Worker bundle/gzip size vs guards, Static Assets/shard counts, client bundle sizes, build/prerender/sitemap counts, build durations.
- `routes/seo-snapshot-local.json` — authoritative SEO content baseline (44 fixtures, captured via `server-build/entry-server.js`, the same renderer `scripts/prerender.mjs` and the Worker runtime use). Deterministic: re-captured twice with 0 mismatches. This is the checked-in reference used for regression comparison — refreshed intentionally, via the capture command below, whenever the accepted baseline changes (e.g. fixture coverage is deliberately expanded, as it was here); it is not overwritten by every local run.
- `routes/seo-snapshot-prod.json` — live `https://www.fluentstellar.com` fetch of the original 41 fixtures. Used only for host/redirect/core-route parity — word/error/redirect fixtures return `403` with `Cf-Mitigated: challenge` in production (WAF) and must not be treated as an SEO content regression.

Compare a future local capture against this baseline with:

```
npm run seo-baseline:capture -- --out <new-snapshot>.json
npm run seo-baseline:compare -- --a scripts/seo-baseline/current/routes/seo-snapshot-local.json --b <new-snapshot>.json
```

This folder is Git-tracked and holds the project's checked-in reference baseline, not scratch output. Ad hoc comparison or verification captures (temp directories, other machines, `<new-snapshot>.json` above) are disposable and must not replace `routes/seo-snapshot-local.json` unless deliberately promoted into this folder through the same capture command, the way this refresh was.
