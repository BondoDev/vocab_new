User profile feature files belong in this folder.

Keep this feature split by responsibility:
- `components/` for profile-specific UI pieces
- `hooks/` for profile-related React hooks
- `utils/` for profile-only helpers
- `types.ts` for feature-local types that do not belong in shared `src/lib`

Styling rule:
- Put user profile styling in dedicated SCSS files under `src/styles/`
- Import those SCSS files from `src/main.tsx`

Commenting rule:
- Add short comments above non-obvious functions, state flows, and data transforms
- Do not add comments for self-explanatory JSX or trivial assignments
