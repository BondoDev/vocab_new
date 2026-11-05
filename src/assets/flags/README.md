# Self-hosted country flags

True-proportion SVG flags for the seven supported languages (`gb`, `es`, `fr`,
`de`, `it`, `pt`, `ru`). Their only consumer is
[`src/app/components/LanguageSelector.tsx`](../../app/components/LanguageSelector.tsx),
which imports each file explicitly. That selector is used by Custom
Practice, account onboarding, and the level-test language modal.

Other flag UI (header language switcher, Explore, SEO hubs, homepage) uses
the bundled `flag-icons` npm package's `.fi` classes instead. That package
has no ties to these files.

**Source:** downloaded unmodified from `hampusborgos/country-flags` (`svg/`,
`main` branch as of 2026-11-06), the same files LanguageSelector previously
loaded from jsDelivr. Checked to contain no scripts or external references.

**License:** the upstream repository states that its flags are in the public
domain (taken from Wikimedia Commons).

**Rules:** add a flag only when a new supported language needs one. Import it
in `LanguageSelector.tsx`'s `FLAG_SRC_BY_CODE` map, and keep the upstream
file unmodified.
