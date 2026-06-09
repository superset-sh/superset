# Merge upstream official changes

## Goal

Merge the official upstream `superset-sh/superset` changes from `origin/main`
into our forked Superset codebase without losing our local product direction or
recently shipped features.

## Requirements

- Source branch is `origin/main`.
- Target baseline is the current local branch at `5d95c1dd0`, already pushed to
  `TwitterIsGood/superset main`.
- Preserve our local features unless the user explicitly approves a product
  direction change:
  - V2-only desktop flow with account/password auth.
  - Chat / Code / Work mode shell.
  - Model provider configuration center and local provider icons.
  - Local-first Task system.
  - Code workspace guided workflow / Trellis initialization.
  - Trellis to Superset Task status sync.
  - Desktop canary unsigned-signing fallback.
- Merge upstream bug fixes and infrastructure improvements where compatible.
- Treat feature-direction conflicts separately from textual merge conflicts.
- Do not overwrite user-facing V2-only behavior with upstream V1 experiment
  behavior unless approved.
- Do not hand-edit generated Drizzle migration files. If upstream migration
  numbering conflicts with our generated migrations, resolve through a
  conservative merge strategy and ask before producing a new migration.

## Acceptance Criteria

- [ ] Upstream changes are compared against our current code and categorized as
      safe merge, code conflict, or product/feature conflict.
- [ ] Any product/feature conflict is summarized and approved before the final
      merge resolution.
- [ ] The final merge contains no conflict markers and keeps our local feature
      contracts intact.
- [ ] Dependency lockfile and package metadata are internally consistent.
- [ ] Validation includes at least `bun run lint`, `bun run typecheck`, and
      focused tests for affected desktop/host-service/terminal/task surfaces.
- [ ] If desktop-facing behavior changes, run or explicitly defer the desktop
      acceptance smoke path with a reason.

## Notes

Initial evidence:

- Merge base: `7f3e5b342`.
- Upstream-only commits: 52.
- Local-only commits: 27.
- Upstream changed files: 224.
- Dry-run merge produced conflicts in 18 paths, concentrated in desktop V2/V1
  gating, onboarding, settings search, host-service startup/cleanup, DB
  migration metadata, and `bun.lock`.

Product conflict already identified:

- Upstream includes V1 experiment work such as "show v1/v2 toggle for all
  users", "support v1 in onboarding", and "route new signups to v1 for
  experiment". Our product direction is V2-only, so these must not be accepted
  wholesale without user approval.
