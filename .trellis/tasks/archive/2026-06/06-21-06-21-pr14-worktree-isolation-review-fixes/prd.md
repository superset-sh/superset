# Fix PR14 worktree isolation review findings

## Goal

Address PR #14 review blockers: unique worktree Docker compose project naming, strict local env setup guardrails, and owner/project-safe clone directory names.

## Requirements

- Adopt the P1 finding that multiple Codex worktrees currently derive the same
  `LOCAL_DB_PROJECT` from a trailing `superset` directory name.
  - Generate a stable, local-safe, unique default project suffix from the
    physical worktree path, not just the basename.
  - Keep the value deterministic for repeated runs in the same worktree.
  - Keep the value short and Docker compose project-name safe.
- Adopt the P1 finding that `dev:worktree:start` can inherit stale or online
  `.env` values when `SUPERSET_HOME_DIR` happens to exist.
  - Treat the managed local setup block as the readiness signal, not a single
    env key.
  - Regenerate local setup when required worktree-local keys are missing or
    inconsistent with the current worktree defaults.
  - Refuse to run migrations, seed, fixture cleanup, or worktree start against
    obviously non-local `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `KV_URL`,
    `KV_REST_API_URL`, `ELECTRIC_URL`, `NEXT_PUBLIC_ELECTRIC_URL`,
    `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DESKTOP_URL`, `RELAY_URL`, and
    `NEXT_PUBLIC_RELAY_URL`.
- Adopt the P2 finding that remote clone directories should not be only the repo
  name.
  - GitHub clone directories must include enough owner/name or project identity
    to avoid `org-a/web` vs `org-b/web` collisions.
  - Preserve readable directory names and keep path segments filesystem-safe.
  - Keep non-GitHub behavior safe and compatible.
- Update focused tests and Trellis validation notes.

## Acceptance Criteria

- [x] Two different worktree paths ending in `superset` produce different
  default `LOCAL_DB_PROJECT` values.
- [x] `dev:worktree:start` reruns local setup when the managed local block is
  missing, stale, or inconsistent with the current worktree-derived project.
- [x] Worktree lifecycle commands reject non-local database/service URLs before
  running destructive local setup actions.
- [x] GitHub clone targets distinguish owner/name collisions.
- [x] Focused unit tests and root lint pass.

## Notes

- This task is a PR #14 review follow-up. All three findings are accepted.
- Do not broaden the PR beyond review blockers.
