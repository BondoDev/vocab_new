---
name: FluentStellar
description: CEFR-structured vocabulary learning, mapped level by level.
colors:
  stellar-indigo: "#6366f1"
  stellar-indigo-hover: "#7375f2"
  night-ink: "#261943"
  night-violet: "#2f2755"
  dusk-violet: "#45326f"
  nebula-purple: "#604095"
  aurora-violet: "#7850ad"
  lavender-haze: "#f0ecf8"
  lavender-rule: "#d9cdef"
  atlas-blue: "#4169d2"
  starlight-mist: "#f8f9fb"
  parchment: "#faf8f4"
  card-white: "#ffffff"
  slate-body: "#4a5568"
  deep-slate: "#293546"
  muted-slate: "#6b7280"
  muted-surface: "#e8eaed"
  secondary-surface: "#f1f1f5"
  hairline: "rgba(0, 0, 0, 0.08)"
  focus-ring: "#a0aec0"
  signal-red: "#d4183d"
  progress-green: "#22c55e"
  ember-amber: "#f59e0b"
typography:
  display:
    fontFamily: "Sora, Manrope, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 600
    lineHeight: 1.2
  headline:
    fontFamily: "Sora, Manrope, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.5
  title:
    fontFamily: "Sora, Manrope, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "Manrope, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
  nav-label:
    fontFamily: "Manrope, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.79rem"
    fontWeight: 700
    letterSpacing: "0.16em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  pill: "999px"
components:
  button-primary:
    backgroundColor: "{colors.stellar-indigo}"
    textColor: "{colors.card-white}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.stellar-indigo-hover}"
  button-outline:
    backgroundColor: "{colors.starlight-mist}"
    textColor: "{colors.slate-body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.secondary-surface}"
    textColor: "{colors.slate-body}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.slate-body}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  nav-item-mobile:
    textColor: "{colors.dusk-violet}"
    typography: "{typography.nav-label}"
    rounded: "14px"
    height: "48px"
  nav-item-mobile-active:
    backgroundColor: "{colors.lavender-haze}"
    textColor: "{colors.night-ink}"
---

# Design System: FluentStellar

## Overview

**Creative North Star: "The Night-Sky Atlas"**

"The Night-Sky Atlas" describes the current look. It is an optional source of
inspiration, not a required visual direction: new pages and features may take
a different direction when that serves learners better.

FluentStellar is a visually engaging language-learning platform. Every word
has a place in its CEFR level, and the interface helps learners see where they
are, what is nearby, and how much remains. Hierarchy is clear and the feel is
**precise and structured**, while color is used generously and with purpose:
to identify sections, learning modes, and exercises, to signal state, and to
make practice feel lively.

Today the palette pairs a deep violet range (night ink through nebula purple)
for navigation, account surfaces, and dashboard figures with pale backgrounds,
a bright indigo for many actions, and a distinct color pair for each exercise
type. This palette is a starting point, not a closed set.

Density is moderate: reference pages (word pages, level lists, vocabulary
tables) favor scannable rows and tight data, while practice screens give one
card room to breathe. The system is light-only today.

Everything below describes the current implementation and offers flexible
guidelines. Use judgment over rules when a different choice clearly improves
the interface.

**Key Characteristics:**
- Pale, cool backgrounds with white cards, mostly separated by hairline borders.
- A multi-color palette: violets, indigo, blue, green, amber, and per-exercise pastels.
- Sora headings over Manrope body text: geometric and confident.
- Pill-shaped chips and indicators, with modest 6–10px corners on most other elements.
- Each exercise type has its own color pair, used consistently wherever that type appears.

## Colors

A multi-color light palette: slate text on misty white, with violet, indigo,
blue, green, amber, and pastel exercise accents. The colors below are the
existing starting palette. New colors may be added where they help.

### Palette guidelines
- **Multiple accents are welcome.** Buttons, learning modes, exercises,
  interactive elements, and section identities may each use their own accent
  color.
- **New colors are allowed** when they complement the existing palette and
  have a clear role. Prefer adding them as theme tokens (CSS custom
  properties) so they can be reused.
- **Keep color meaningful.** Use a color consistently for the thing it
  identifies within a context, and avoid reusing one accent for conflicting
  meanings on the same screen.
- **Keep contrast accessible.** Text and essential icons must meet WCAG AA
  contrast against their background (4.5:1 for body text, 3:1 for large text
  and UI components). Don't rely on color alone to convey state.

### Primary
- **Stellar Indigo** (#6366f1): The default theme `--primary`. Primary buttons,
  links in app UI, selected states, progress fills, and the translucent tints
  (`primary/5`, `/10`, `/30`, `/40`) behind active rows and chips.
  Hover softens it to **Stellar Indigo Hover** (#7375f2). Other accents may
  also be used for buttons and actions where a section or mode calls for it.

### Secondary
- **Night Ink** (#261943): The darkest emphasis. Active navigation text,
  dialog and dropdown titles in the header.
- **Night Violet** (#2f2755): Dashboard titles, stat values, and the base
  for its 10–14% tinted tracks and dividers.
- **Dusk Violet** (#45326f): Default mobile navigation text.
- **Nebula Purple** (#604095): Mid-violet accents in profile and practice
  preview surfaces.
- **Aurora Violet** (#7850ad): Focus outlines and highlights inside
  violet-themed areas.
- **Lavender Haze** (#f0ecf8) / **Lavender Rule** (#d9cdef): Light violet
  surfaces and borders for account and selection areas.

### Tertiary
- **Atlas Blue** (#4169d2): Links and small labels on the homepage
  (daily-word card, section links), with #f0f4fe / #e4edff tint backgrounds.

### Neutral
- **Starlight Mist** (#f8f9fb): App background.
- **Parchment** (#faf8f4): Warm homepage background, currently used only there.
- **Card White** (#ffffff): Cards, popovers, inputs.
- **Slate Body** (#4a5568): Default text everywhere.
- **Deep Slate** (#293546): Homepage headline and lead text.
- **Muted Slate** (#6b7280): Secondary text, captions, placeholders.
- **Muted Surface** (#e8eaed) / **Secondary Surface** (#f1f1f5): Quiet fills
  for secondary buttons, skeletons, and inactive areas.
- **Hairline** (rgba(0, 0, 0, 0.08)): Default border on all elements.
- **Focus Ring** (#a0aec0): Base outline color.

### Semantic
- **Signal Red** (#d4183d): Destructive actions and errors (with red-50
  backgrounds and red-200 borders on alerts).
- **Progress Green** (#22c55e): Learned words, success, and practice activity.
- **Ember Amber** (#f59e0b): In-progress or warning states in vocabulary stats.

### Exercise palette
Each exercise type owns a fixed background, border, and icon color
(`src/exercises/exerciseTheme.ts`):

| Type | Background | Border | Icon |
|---|---|---|---|
| Word typing | #F2F0FF | #7A68D8 | #6B58C8 |
| Half-written | #EEF9F2 | #4FA876 | #3E9765 |
| Broken word | #FFF3EC | #D78A5C | #C67646 |
| Connect words | #EEF7FF | #5B95DA | #4B86CB |
| Listening | #FFF9E8 | #C8A53A | #B8932E |

### Named Rules
**The Constellation Guideline.** An exercise type's color pair identifies that
type, so keep it consistent across its card, icon, selector, and result. New
exercise types or learning modes can get their own new color pair.

## Typography

**Display Font:** Sora (with Manrope, Segoe UI, Helvetica Neue, Arial)
**Body Font:** Manrope (with Segoe UI, Helvetica Neue, Arial)

**Character:** Sora's geometric shapes give headings a measured, technical
confidence. Manrope keeps body text, labels, and data clean and highly
legible. Sora loads only at weights 600–800 and Manrope at 400–700.

### Hierarchy
- **Display** (600, 2.75rem, 1.2): The homepage hero title only. Drops to 2rem below 768px.
- **Headline** (500, 1.5rem, 1.5): Page `h1`.
- **Title** (500, 1.125rem, 1.5): Section `h3`; `h2` sits between them at 1.25rem.
- **Body** (400, 1rem, 1.5): All running text, inputs, and table cells. The root size is 16px.
- **Label** (500, 0.875rem, 1.5): Buttons, form labels, and compact UI text.
- **Nav Label** (700, 0.79rem, 0.16em tracking, uppercase): Mobile navigation items.

### Named Rules
**The Two-Voice Guideline.** By default, Sora is for headings and Manrope is
for everything else. Body text, buttons, and dense data read best in Manrope.

## Layout

Content sits in a centered column with a maximum width of 80rem. The
navigation edges are `max(2rem, (100vw − 80rem) / 2)`. The header is fixed,
4.875rem tall, hides on scroll down, and is offset by a spacer.

Breakpoints are written as raw media queries, not shared tokens:
- **Below 1024px:** desktop navigation becomes a menu toggle with a
  full-height overlay panel, and the scroll-to-top button reserves bottom space.
- **Below 768px:** homepage type and cards compact further.
- The daily-word card uses a container query (`daily-word`, at most 25rem)
  to fit long words.

Reference pages stack scannable rows and tables. Practice screens center a
single card.

## Elevation & Depth

The system is flat and uses tonal layering. Depth comes from white cards on
the misty background, hairline borders, and translucent indigo or violet
tints, not from cast shadows. The few shadows present are near-invisible
lifts or focus rings.

### Shadow Vocabulary
- **Hairline lift** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)`): Resting cards and inputs.
- **Focus ring** (`box-shadow: 0 0 0 2px var(--ring)`): Keyboard focus on custom controls.
- **Inset outline** (`box-shadow: inset 0 0 0 1px …`): Tinted borders on chips and nav rows that shouldn't change layout.
- **Overlay panel** (`inset 0 1px 0 rgba(255,255,255,0.82), 0 14px 30px rgba(22,12,46,0.08)`): The mobile menu panel only.

### Named Rules
**The Flat-At-Rest Guideline.** Surfaces are mostly flat at rest, and stronger
elevation usually belongs to overlays (menus, dialogs, popovers) and state
feedback. Use more depth where it clearly helps a surface.

## Shapes

Corners are moderate and consistent, derived from a 10px base radius:
6px for small controls, 8px for buttons and inputs, 10px for cards, and
14px for larger panels. Chips, badges, progress tracks, and indicators are
fully pill-shaped (999px), the most common radius in the codebase. Avatars
and icon dots are circles. Borders are 1px hairlines.

## Components

### Buttons
Compact and direct. They read as tools, not banners.
- **Shape:** gently rounded (8px).
- **Primary:** Stellar Indigo by default, with white Label text, 36px tall, 16px horizontal padding. Other accent fills are fine when they keep accessible contrast.
- **Hover / Focus:** fill softens to 90% opacity; focus shows a 3px ring at 50% ring color.
- **Outline / Secondary / Ghost / Link:** hairline-bordered background, quiet gray fill, transparent, and indigo underline-on-hover text. Sizes: sm 32px, default 36px, lg 40px.

### Chips
- **Style:** pill (999px), indigo or violet tint background (`primary/10`) with matching text.
- **State:** selected chips deepen the tint and add an inset border at 30–40% indigo.

### Cards / Containers
- **Corner Style:** 10px (12px on homepage cards).
- **Background:** Card White on Starlight Mist; exercise cards use their type's pastel pair.
- **Shadow Strategy:** flat or hairline lift (see Elevation & Depth).
- **Border:** 1px hairline; exercise cards use their type's border color.

### Inputs / Fields
- **Style:** white fill, 1px border, 8px radius, 36px tall, 1rem text (0.875rem from md up).
- **Focus:** ring color border plus a 3px ring at 50%.
- **Error / Disabled:** destructive border and a 20% red ring; disabled drops to 50% opacity.

### Navigation
- **Desktop:** fixed top bar with a text-only wordmark and inline links; hides on scroll.
- **Mobile (below 1024px):** a full-height overlay with a frosted white-to-lavender panel. Items are 48px rows with an uppercase Nav Label in Dusk Violet, an icon, and a chevron. Hover tints them violet and shifts them 2px right.
- **Active:** a flat lavender chip with Night Ink 800-weight text and an inset violet outline. It's deliberately not elevated, so it never reads as a button.

### Exercise Card (signature)
The practice surface: one centered card tinted with its exercise type's
background, border, and icon color from the exercise palette.

## Do's and Don'ts

These are flexible guidelines drawn from the current implementation, not
absolute restrictions.

### Do:
- **Do** use color expressively: different accents for buttons, learning modes, exercises, interactive elements, and section identities.
- **Do** introduce new complementary colors when they improve the interface, ideally as reusable theme tokens.
- **Do** keep each exercise type's color pair tied to that type wherever it appears.
- **Do** check that text and essential UI meet WCAG AA contrast, and pair color with text or icons for state.
- **Do** reuse existing theme tokens (`var(--primary)`, `var(--border)`, `var(--radius)`) when one fits.
- **Do** prefer hairline borders (rgba(0, 0, 0, 0.08)) and tonal fills for separating resting surfaces.
- **Do** use pill shapes (999px) for chips, badges, and progress tracks, and 8–10px corners for buttons, inputs, and cards, unless a component needs otherwise.
- **Do** default to Sora for headings and Manrope for everything else.

### Don't:
- **Don't** use one accent color for conflicting meanings on the same screen.
- **Don't** let the active navigation item look like a CTA button.
- **Don't** assume the inactive dark tokens are a finished dark theme; the site is light-only today.
