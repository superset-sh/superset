# MCP: Support creating a workspace from an existing workspace's branch

## Purpose

Users in CLI agents want to create new worktrees branched off their current workspace's branch, not just `main`. Add a `sourceWorkspaceId` parameter to the `create_workspace` MCP tool that resolves to the source workspace's branch and passes it as `baseBranch`.

## Progress

- [x] (2026-03-08) Add `sourceWorkspaceId` to MCP tool schema with `.refine()` for mutual exclusivity with `baseBranch`.
- [x] (2026-03-08) Resolve `sourceWorkspaceId` → branch in desktop tool handler before calling tRPC.
- [x] (2026-03-08) Typecheck + lint.

## Decision Log

- Decision: Use `.refine()` for mutual exclusivity instead of `z.discriminatedUnion`.
  Rationale: MCP SDK enforces refinements at runtime via `safeParseAsync`. Discriminated unions need a literal discriminator field — overkill here. LLMs read descriptions, not JSON Schema constraints.

- Decision: Resolve `sourceWorkspaceId` in the desktop tool handler, not the tRPC procedure.
  Rationale: The handler already has `ctx.getWorkspaces()`. The tRPC `workspaces.create` mutation already handles arbitrary `baseBranch` values — no changes needed there.

## Plan of Work

Two files to edit:

**1. `packages/mcp/src/tools/devices/create-workspace/create-workspace.ts`**

Add `sourceWorkspaceId` to `workspaceInputSchema`. Add `.refine()` rejecting inputs with both `baseBranch` and `sourceWorkspaceId`.

**2. `apps/desktop/src/renderer/routes/_authenticated/components/AgentHooks/hooks/useCommandWatcher/tools/create-worktree.ts`**

Add `sourceWorkspaceId` to the local schema. In `execute`, before calling `mutateAsync`: if `sourceWorkspaceId` is set, look up the workspace via `ctx.getWorkspaces()`, extract its `branch`, and pass that as `baseBranch`. If not found, push an error and `continue`.

## Validation

    bun run typecheck   # No type errors
    bun run lint        # No lint errors

End-to-end: call `create_workspace` with `sourceWorkspaceId` pointing to an existing workspace. The new worktree should branch off the source workspace's branch.
