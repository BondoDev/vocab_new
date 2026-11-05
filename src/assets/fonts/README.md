# Self-hosted fonts

WOFF2 files for the site's two typefaces, declared in
[`src/styles/fonts.css`](../../styles/fonts.css), which is the only consumer.
Vite fingerprints them into `/assets/` at build time.

| File | Family | Subset | Weights (variable) |
|---|---|---|---|
| `manrope-latin.woff2` | Manrope v23 | latin | 400–700 |
| `manrope-latin-ext.woff2` | Manrope v23 | latin-ext | 400–700 |
| `manrope-cyrillic.woff2` | Manrope v23 | cyrillic | 400–700 |
| `manrope-greek.woff2` | Manrope v23 | greek | 400–700 |
| `sora-latin.woff2` | Sora v17 | latin | 600–800 |
| `sora-latin-ext.woff2` | Sora v17 | latin-ext | 600–800 |

**Source:** downloaded unmodified from Google Fonts (`fonts.gstatic.com`),
exactly the files its CSS API served for
`Manrope:wght@400;500;600;700&family=Sora:wght@600;700;800`.

**License:** SIL Open Font License 1.1, in `OFL-manrope.txt` and
`OFL-sora.txt` (from `google/fonts`). The OFL requires the license to stay
alongside redistributed font files, so keep these files here.

**Rules**

- Don't add subsets, weights, or families unless the UI or content needs
  them. Each `@font-face` in `fonts.css` must use Google's matching
  `unicode-range`, so browsers only fetch the subsets a page actually uses.
- To update a font, re-download every subset of that family together and
  update the version in this table and the `fonts.css` header.
