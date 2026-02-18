## AI & Human Collaboration Rules (Optimized Workflow)

These rules are mandatory for all AI agents (including Codex) working in this repository.

### Core Principle (Very Important)

Humans control WHEN Git actions happen.
AI agents control HOW Git actions happen.

AI agents must never perform Git operations unless explicitly instructed by a human.

### Responsibility Split

Humans are responsible for:

- Describing WHAT needs to be done
- Explicitly telling the AI when to perform Git actions
- pull
- commit
- push
- open PR

AI agents (including Codex) are responsible for:

- Implementing code changes correctly
- Managing Git only when instructed
- Executing Git actions safely and correctly
- Following all Git safety rules exactly

Humans do NOT run Git commands manually.

### Git Action Rules (Non-Negotiable)

- Never commit or push directly to main
- Always work on a feature branch
- Never force-push
- Never rewrite Git history
- Never assume main is up to date
- Assume other agents may push at any time
- GitHub is the single source of truth

### Working Modes

#### Working Mode (default)

- AI makes code changes only
- NO Git commands
- NO pull, commit, push, or PR
- Multiple changes, edits, and refinements are allowed
- This mode is optimized for speed
- This mode continues until the human explicitly says otherwise.

#### Git Mode (explicit only)

AI may perform Git actions only after a clear human instruction, such as:

- "Pull latest changes and start a new feature branch"
- "Checkpoint: commit and push current changes"
- "Create a PR for everything done so far"

If no such instruction is given: NO Git actions are allowed.

### Mandatory Git Workflow (when instructed)

When a human explicitly requests Git actions, AI must follow this exact order:

1. Sync before work (ONCE per checkpoint)
   `git checkout main`
   `git pull origin main`

AI must perform exactly one `git pull` at the start of the Git phase.

No additional pulls unless:

- push is rejected, or
- a merge conflict is reported

2. Branch handling

- If a feature branch already exists: use it
- If not: create a new feature branch
- If work depends on an unmerged branch:
- new branch MUST be created from that branch
- OR the previous branch must be merged first

AI must never assume `main` contains previous unmerged work.

3. Commit & push

- Commit all accumulated changes in one coherent commit (or logical series if instructed)
- Push to the feature branch
- Open a pull request if requested

### Checkpoint Model (Recommended)

Humans are encouraged to use checkpoints instead of frequent commits.

Example flow:

- "Continue working, no Git yet"
- "Make these UI fixes"
- "Add animation"
- "Checkpoint: commit and push everything so far"

AI must treat each checkpoint as a transaction boundary.

### Forbidden Behavior

- Performing Git actions without explicit instruction
- Pulling "just in case"
- Pushing after every small change
- Interpreting vague phrases like:
- "maybe push later"
- "we'll commit eventually"

If instruction is unclear: ask for clarification.

### Memory & Safety Guarantee

- AI may accumulate many changes in Working Mode
- Git state is finalized only at checkpoints
- Human controls checkpoint timing
- Main branch stability is preserved
- Merge conflicts are minimized
- Development speed is maximized

### Summary (One Sentence Rule)

AI writes code continuously, but touches Git only when the human explicitly says so.
