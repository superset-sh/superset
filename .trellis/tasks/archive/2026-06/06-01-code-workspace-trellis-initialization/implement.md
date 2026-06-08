# Implementation Plan

## Checklist

- [x] Add host-service Trellis status/init helpers with focused tests.
- [x] Expose `workspaceCreation.getTrellisStatus`.
- [x] Extend `workspaces.create` input/result with optional Trellis setup.
- [x] Extend renderer workspace draft and create snapshot types.
- [x] Add a lightweight Trellis setup row to `PromptGroup`.
- [x] Surface create-result Trellis warning with a toast.
- [x] Add focused renderer source/utility tests for create payload wiring.
- [x] Run focused tests, package typechecks, lint.
- [x] Run Desktop Automation smoke if the app starts cleanly in this branch.

## Risk Points

- Host-service runs from a different package than the target worktree; CLI
  resolution must not rely on a global `trellis`.
- The renderer must query the selected host, not always the local host.
- Existing/adopted worktrees must not be mutated unless the user opted into
  initialization and Trellis is missing.
- Create Workspace has alternate entry points through branch picker actions;
  keep those defaulting to no Trellis mutation.

## Follow-up Notes

- Add clone progress reporting for large repositories. The desired UX is a
  bottom progress bar plus current Git clone phase/status text in the clone
  dialog rather than a long-running static loading state.

## Validation Commands

- `bun test packages/host-service/src/trpc/router/workspace-creation/trellis.test.ts`
- `bun test apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/PromptGroup`
- `bun run --cwd packages/host-service typecheck`
- `bun run --cwd apps/desktop typecheck`
- `bun run lint`
