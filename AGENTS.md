# Collaboration Rules

## Token-Saving Mode

- Default to cheap-first work.
- Do not do broad repo scans unless they are necessary.
- Do not run builds, full test suites, sitemap regeneration, or other expensive verification unless:
  - the user explicitly asks for it, or
  - it is clearly required to complete the task safely, and the user is warned first.
- Before expensive work, send a short warning that it may use more tokens.
- Prefer targeted file reads and focused searches over reading large files or many files.
- Avoid repeating the same scans or checks unless new information makes them necessary.
- Keep progress updates and final responses concise.
- Summarize command results instead of dumping large outputs.

## Preferred Warning

- Use a short warning like:
  - "This may require a broader scan/build and use more tokens. Proceed?"
