# SEO / performance baseline — captured 2026-07-14

Source commit: `d123ff1c` (master, clean tree).

- `manifest.json` — identity, commands, canonical host, production Worker config.
- `performance.json` — Worker bundle/gzip size vs guards, Static Assets/shard counts, client bundle sizes, build/prerender/sitemap counts, build durations.
- `routes/seo-snapshot-local.json` — authoritative SEO content baseline (41 fixtures, captured via `server-build/entry-server.js`, the same renderer `scripts/prerender.mjs` and the Worker runtime use). Deterministic: re-captured twice with 0 mismatches.
- `routes/seo-snapshot-prod.json` — live `https://www.fluentstellar.com` fetch of the same 41 fixtures. Used only for host/redirect/core-route parity — word/error/redirect fixtures return `403` with `Cf-Mitigated: challenge` in production (WAF) and must not be treated as an SEO content regression.

Compare a future local capture against this baseline with:

```
npm run seo-baseline:capture -- --out <new-snapshot>.json
npm run seo-baseline:compare -- --a scripts/seo-baseline/current/routes/seo-snapshot-local.json --b <new-snapshot>.json
```

This folder is currently **untracked** (not committed). Not decided yet whether to commit it, gitignore it, or keep it as a CI artifact only — see the baseline capture report for the tradeoffs.
