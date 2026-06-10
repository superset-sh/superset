# Implementation Plan

## Step 1: Trellis Runtime Packaging Gate

- Inspect current `runtime-dependencies.ts`, `copy-native-modules.ts`, Electron builder config, and Canary workflow.
- Fix the immediate missing dependency chain for Trellis runtime (`supports-color`, `has-flag`, and any other discovered runtime deps).
- Add a deterministic script for packaged Trellis smoke validation.
- Wire the smoke script into desktop packaging / Canary workflow before upload.
- Add focused tests or source checks for the runtime dependency list and smoke script behavior.

## Step 2: Task Run Target Simplification

- Inspect Task detail `OpenInWorkspaceV2`, top-bar run popovers, `useCreateWorkspace`, and host-service workspace creation flow.
- Change UI copy/disabled logic so only offline host blocks running.
- Ensure online selected host leads to worktree creation on that host.
- Ensure guided workflow initialization is passed through as part of run/create flow, not as a separate visible setup prerequisite.
- Show progress/error states with product-level labels.

## Step 3: Validation

Run focused checks first:

```bash
bun test apps/desktop/src/lib/trpc/routers/workspaces/utils/git.test.ts
bun test 'apps/desktop/src/renderer/routes/_authenticated/_dashboard/tasks/$taskId/page.test.ts'
bun run --cwd apps/desktop typecheck
```

Then run release-quality checks:

```bash
bun run lint:fix
bun run lint
git diff --check
```

For packaged runtime:

```bash
bun run --cwd apps/desktop prebuild
bun run --cwd apps/desktop <trellis-smoke-script>
```

Exact smoke command will be finalized after implementing the script.

## Rollback Points

- If full Plugin Runtime extraction is too large, keep current module-copy packaging but require the executable smoke gate.
- If automatic remote host project checkout needs broader host-service API changes, ship the UI simplification plus current worktree creation path for online hosts and document the missing auto-checkout as follow-up.
- If packaged Electron build is too slow locally, validate via resource-layout smoke script and GitHub Canary workflow.
