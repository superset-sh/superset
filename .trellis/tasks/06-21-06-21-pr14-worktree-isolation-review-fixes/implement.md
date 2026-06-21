# Implementation Plan

1. Harden `.superset/setup.local.sh` and `.superset/worktree-dev.sh` naming:
   - Derive a deterministic path hash from the physical worktree path.
   - Include the hash in the default `SUPERSET_WORKSPACE_NAME` /
     `LOCAL_DB_PROJECT`.
   - Preserve explicit env overrides when the user intentionally sets them.
2. Harden worktree local setup validation:
   - Detect the managed local setup block plus required keys.
   - Rerun setup when local setup is missing or stale for this worktree.
   - Validate service URLs are local loopback before migrations, seed, cleanup,
     or lifecycle startup continue.
3. Fix remote clone target naming:
   - Add owner/name-aware GitHub directory derivation.
   - Keep fallback behavior safe for non-GitHub URLs.
4. Add focused tests:
   - Shell helper tests for worktree name/project derivation and env guardrails
     if practical without starting services.
   - Host-service clone target tests for owner/name collision cases.
5. Validate and push:
   - Shell syntax checks.
   - Focused unit tests.
   - `bun run lint`.
   - Push the existing PR branch.

## Rollback

- Revert the follow-up commit if the guardrails block valid local workflows.
- Keep the original PR #14 implementation commit intact unless a review blocker
  requires touching it.
