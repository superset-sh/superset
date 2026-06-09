# Merge Upstream Official Changes Design

## Boundaries

This task merges `origin/main` into our fork while preserving local Superset
product behavior. The merge touches multiple app and package boundaries:

- Desktop renderer and Electron main.
- Host-service and PTY daemon runtime.
- Cloud tRPC/API routes.
- CLI/SDK/MCP command surfaces.
- Drizzle schema and generated migration metadata.
- CI/package metadata/lockfile.

The merge is not allowed to silently revert local product decisions.

## Merge Strategy

1. Fetch `origin/main` and create a temporary dry-run worktree.
2. Run a non-committing merge in the dry-run worktree to discover actual
   textual conflicts.
3. Categorize conflicts:
   - Safe code conflict: both sides are bug fixes or compatible refactors.
   - Product conflict: upstream behavior conflicts with our V2-only, model
     provider center, Task, or Trellis workflow direction.
   - Generated artifact conflict: lockfile or migration metadata needs
     tool-compatible resolution.
4. Ask the user only for product conflicts that cannot be inferred from the
   existing requirements.
5. Apply the real merge in the main worktree after product-conflict direction is
   decided.

## Known Conflict Groups

### V1/V2 Product Direction

Upstream recently added V1 experiment/onboarding/toggle behavior. Our local
code intentionally removed or bypassed V1 surfaces for the V2-only desktop
direction. Resolution should keep V2-only behavior by default while cherry
picking compatible upstream fixes such as sidebar visibility, delete/pin rows,
analytics safety, and workspace creation bug fixes.

### Host-Service / Terminal Runtime

Upstream changes include terminal latency, daemon limits, workspace cleanup, and
remote-control removal. These are likely useful, but must be merged around our
Trellis task sync bridge and pty-daemon packaged path fixes.

### Workspace Creation

Upstream adds folder import git-init recovery and template gallery. Our local
workspace creation adds guided workflow setup and Superset Task linkage. The
merge must preserve the `trellisSetup` contract and avoid reintroducing
Electric txid waits that broke workspace creation.

### Database / Migration Metadata

Upstream adds migration `0057_drop_remote_control_sessions`. Our repo already
has local generated migration history. Generated Drizzle files should not be
manually invented. If the numbering collides, prefer preserving both histories
only when the resulting Drizzle journal is valid; otherwise stop for a migration
decision.

## Rollback

If the real merge becomes unstable, abort the merge before committing. The
temporary dry-run worktree can be removed independently because it is not the
main working tree.
