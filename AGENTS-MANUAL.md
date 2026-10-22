# Claude Code — Tools & Skills Guide

All tools are installed for FluentStellar. **No initialization is required when starting a new Claude Code chat.**

## 1. Graphify — Code Architecture

**Purpose:** Understand code structure, dependencies, and relationships between modules.

- **Usage:** Ask Claude to use Graphify when investigating architecture or cross-module dependencies.
- **Initialization:** Already configured in `AGENTS.md`. No action needed.
- **Updates:** Automatically handled by agent instructions after structural code changes.
- **Frequency:** Only when architectural analysis is needed.

## 2. UI UX Pro Max — Design Planning

**Purpose:** Improve layout decisions, colors, typography, spacing, and UX.

- **Usage:** Used by default for new pages and significant design changes (rule in `AGENTS.md`). You can still ask explicitly: "Use UI UX Pro Max to plan/improve the design of [page]."
- **Initialization:** None.
- **Frequency:** When planning new pages or significant design changes.

## 3. Frontend Design — UI Implementation

**Purpose:** Create visually attractive React components and interfaces.

- **Usage:** Used by default when implementing new interfaces or significant redesigns (rule in `AGENTS.md`). You can still ask explicitly: "Use frontend-design to implement/redesign [component]."
- **Initialization:** None.
- **Frequency:** When building new interfaces or substantially redesigning existing ones.

## 4. Impeccable — Design Review & Polish

**Purpose:** Identify and fix visual inconsistencies and poor styling.

- **Setup:** Done. `/impeccable init` created `PRODUCT.md` (users, positioning, constraints) at the repository root. Re-run it only if product facts change.
- **Design system:** `/impeccable document` generated `DESIGN.md` (plus the `.impeccable/design.json` sidecar) from the existing styles and components. Re-run it when the visual system drifts.
- **Usage:** Used for final review when beneficial (rule in `AGENTS.md`), or ask: "Use Impeccable to critique and polish [page/component]."
- **Frequency:** After significant UI changes or when existing styling needs improvement.
- **Automatic hooks:** Currently disabled.
- **Enable hooks:** `/impeccable hooks on`
- **Disable hooks:** `/impeccable hooks off`

## 5. Find Skills — Skill Discovery (Optional)

**Purpose:** Find additional coding skills.

- **Usage:** Ask Claude to find a skill for a specific task.
- **Initialization:** None.
- **Frequency:** Only when additional capabilities are needed.

## Recommended Workflow

For major UI work:

1. **UI UX Pro Max** → Plan design.
2. **Frontend Design** → Implement design.
3. **Impeccable** → Review and polish.
4. **Browser testing** → Verify desktop, mobile, and functionality.

This workflow is the default, defined in the "UI/UX design workflow" section of `AGENTS.md`. Only the relevant steps run for a given task. For small CSS changes, no special skill is necessary.

## Important Rules

- Don't run all design skills for every task.
- Don't rebuild Graphify unnecessarily.
- Don't initialize skills in every new chat.
- Preserve FluentStellar's existing design identity and functionality.
- Reuse existing components and styling conventions.
- Don't commit or deploy unless explicitly requested.
- Skills are free to install, but Claude Code usage consumes tokens.
