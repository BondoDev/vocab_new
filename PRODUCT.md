# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Self-study adult learners building vocabulary on their own, working toward a
CEFR level. Many arrive from search on a specific word or level-list page; some
continue into free practice, and some create an account for a personalized
learning plan.

## Product Purpose

FluentStellar is a CEFR-structured vocabulary-learning platform for seven
languages: English, French, German, Italian, Portuguese, Russian, and Spanish.
It helps learners know which words matter at their level, practice them
immediately, and retain them over time. Success is a learner steadily moving
through a level's vocabulary and keeping what they learned.

## Positioning

All four parts work together, and no single competitor combines them:

- **CEFR-structured lists:** vocabulary organized strictly by CEFR level, with
  complete per-level word totals.
- **Rich word pages:** per-word pages with inflections/conjugations, examples,
  and translations.
- **No signup to practice:** interactive exercises are usable instantly; an
  account adds the plan and tracking.
- **Planned and spaced review:** a personalized daily plan combining new-word
  study with spaced review of learned words.

## Operating Context

- Entry is often an indexed word page, level list, or browse page, followed by
  practice and then, optionally, sign-up.
- Signed-in learners work through daily sessions: new-word study, review,
  custom practice, a vocabulary level test, personal lists, and progress and
  vocabulary-growth tracking.
- The interface is localized into the same seven languages, and the UI language
  can be chosen independently of the language being learned.

## Capabilities and Constraints

- **SEO pages are critical.** Word, list, level, and hub pages drive traffic.
  Their content, crawlability, prerender/SSR output, and structured data must
  never regress because of design work.
- Rendering combines build-time prerendering with on-request Cloudflare Worker
  SSR for the large word-page set (see `docs/architecture.md`), so markup must
  hydrate identically.
- Undecided: the monetization model. Nothing in the codebase implements pricing
  or premium tiers, but "free forever" was not confirmed as a commitment.

## Evidence on Hand

- Brand assets: `src/assets/brand/favicon-master.png` (gradient star badge),
  with derived favicon and OG images described in
  `docs/brand-asset-ownership.md`. The header currently uses a text-only
  wordmark. This is the current state, not a confirmed commitment.
- Real content: generated CEFR vocabulary and inflection data under
  `src/data/`, and interface copy in `src/data/interface/*.json`.
- No testimonials, user counts, reviews, or learning-outcome statistics exist.
  Do not fabricate them.

## Product Principles

1. **Level first:** every word lives in its CEFR level, and learners should
   always know where they stand within it.
2. **Value before signup:** browsing and practice work without an account, and
   sign-up is earned rather than demanded.
3. **Retention over novelty:** the plan and spaced review exist so words stick,
   not to drive streak-chasing.
4. **Search pages are product:** word and list pages are full learning
   surfaces, not landing-page bait.
