# Workspace Delete Unification — Design

v2 deletes go through host-service only. v2 is unlaunched, so we cut over directly.

## Principle

**The side that owns harder-to-reverse state orchestrates.** Host-service owns the git worktree, PTYs, and its local sqlite. The cloud row is bookkeeping *about* the workspace. If host-service commits to the delete, the cloud follows. If cloud delete fails after disk is gone, the user still has a consistent view (nothing to open) and the cloud row reconciles on next sync.

This mirrors create: host does `git worktree add` → calls `v2Workspace.create` → inserts host row. Delete inverts the same order.

## Problem

- **Path A** `electronTrpc.workspaces.delete` — v1 only. Leave alone; dies with v1.
- **Path B** `apiTrpcClient.v2Workspace.delete` — cloud-only, called from renderer. Orphans worktree, PTYs, host row. **Remove.**
- **Path C** `host-service workspace.delete` — already composes cloud + worktree + host sqlite but has no terminal/branch/force handling and is unreachable from UI. **Rewrite and wire up.**

## New procedure

Name it `workspaceCleanup.destroy` (clearer than `workspace.delete`, which today only deletes):

```ts
workspaceCleanup.destroy: protectedProcedure
  .input(z.object({
    workspaceId: z.string(),
    deleteBranch: z.boolean().default(false),
    force: z.boolean().default(false),
  }))
  .mutation(async ({ ctx, input }) => {
    const local = ctx.db.query.workspaces
      .findFirst({ where: eq(workspaces.id, input.workspaceId) }).sync();
    if (!local) throw new TRPCError({ code: "NOT_FOUND" });

    const warnings: string[] = [];

    // 1. Kill PTYs. User terminals may hold file locks or open handles
    //    that would block git worktree remove or the teardown script.
    const killed = await ctx.terminal.killByWorkspaceId(input.workspaceId);
    if (killed.failed > 0) {
      warnings.push(`${killed.failed} terminal(s) may still be running`);
    }

    // 2. Run teardown (if .superset/teardown.sh exists and not forced).
    //    Silent spawn with 60s timeout, SIGKILL on timeout, capture output.
    //    On failure, throw TEARDOWN_FAILED with output tail so renderer
    //    can prompt "delete anyway" → re-call with force: true (skips teardown).
    if (!input.force) {
      const teardown = await runTeardown({
        worktreePath: local.worktreePath,
        workspaceId: input.workspaceId,
      });
      if (teardown.status === "failed") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "TEARDOWN_FAILED",
          cause: { exitCode: teardown.exitCode, outputTail: teardown.outputTail },
        });
      }
      // status: "ok" | "skipped" — continue
    }

    // 3. Remove the worktree. Let git be the source of truth on "dirty".
    //    Without --force it refuses if dirty; surface typed so renderer prompts.
    const git = await ctx.git(local.mainRepoPath);
    try {
      await git.raw([
        "worktree", "remove",
        ...(input.force ? ["--force"] : []),
        local.worktreePath,
      ]);
    } catch (err) {
      throw new TRPCError({ code: "CONFLICT", cause: err });
    }

    // 4. Optional branch delete. -D if force, else -d (fails if unmerged).
    if (input.deleteBranch && local.branch) {
      try {
        await git.raw(["branch", input.force ? "-D" : "-d", local.branch]);
      } catch (err) {
        warnings.push(`Failed to delete branch: ${(err as Error).message}`);
      }
    }

    // 5. Cloud soft-delete. Swallow failures — disk is already clean;
    //    cloud self-heals on next sync or subsequent destroy call.
    try {
      await ctx.api.v2Workspace.delete.mutate({ id: input.workspaceId });
    } catch (err) {
      console.warn("[workspaceCleanup.destroy] cloud delete failed", err);
      warnings.push("Cloud delete pending; will retry on next sync");
    }

    // 6. Host-sqlite cleanup.
    ctx.db.delete(workspaces)
      .where(eq(workspaces.id, input.workspaceId)).run();

    return { warnings };
  });
```

No preflight `canDelete`, no `deletingAt` tombstone, no reconciliation loop. Git errors drive the UX; cloud-row orphans self-heal via the existing sync / next destroy attempt.

## Failure modes

| Step fails | User sees | Recovery |
|---|---|---|
| 1 (terminal kill) | Warning; proceeds | — |
| 2 (teardown script, no `force`) | Typed `TEARDOWN_FAILED` with exit code + output tail | Dialog: "Teardown script failed. Delete anyway?" → re-call with `force: true` (skips teardown entirely) |
| 2 (teardown timeout, 60s) | Same as above; process group SIGKILLed | Same |
| 3 (worktree dirty, no `--force`) | Typed `CONFLICT` | Dialog: "Uncommitted changes — delete anyway?" → re-call with `force: true` |
| 3 (other git error) | Error; nothing else deleted | User investigates |
| 4 (`git branch -d` unmerged) | Warning | User deletes manually or re-runs with `force: true` |
| 5 (cloud) | Success + warning | Cloud row reconciles on next sync |
| 6 (host sqlite) | Success (unlikely fail) | Next sync probe heals |

Partial failure never leaves dirty disk + silent disappearance. Worst case: lingering cloud row, which is already soft-delete and self-healing.

## Renderer flow

```ts
const destroy = useDestroyWorkspace();  // wraps hostService.workspaceCleanup.destroy

async function onDeleteClick(workspaceId: string) {
  try {
    await destroy({ workspaceId, deleteBranch: false, force: false });
  } catch (err) {
    if (err.code === "CONFLICT") {
      const confirmed = await showDeleteConfirm({
        title: "Uncommitted changes in worktree",
        options: { deleteBranch: { default: false } },
      });
      if (confirmed.deleteAnyway) {
        await destroy({
          workspaceId,
          deleteBranch: confirmed.deleteBranch,
          force: true,
        });
      }
    } else {
      toast.error(err.message);
    }
  }
}
```

Fast path: one click for a clean worktree, no branch delete. Confirm only on dirty or `deleteBranch: true`.

## UX decisions

- **Delete branch by default?** No. Checkbox in the confirm dialog, off by default. User opts in per delete; no persisted preference.
- **Always confirm?** Only when dirty or `deleteBranch: true`.
- **Split `force` into worktree-force and branch-force?** No. One "I acknowledge this might destroy work" signal covers both.

## UI

- **One dialog path** backing all v2 entry points: v2 sidebar context menu, EmptyTabView, `DELETE_WORKSPACE` hotkey (renamed from `CLOSE_WORKSPACE`), and a new delete affordance on `V2WorkspaceRow.tsx:125-147`.
- **Replace direct cloud call** at `useDashboardSidebarWorkspaceItemActions.ts:72-102` with `useDestroyWorkspace`.
- v1 keeps `DeleteWorkspaceDialog` + `useDeleteWorkspace` unchanged.

## Cloud lock-down

`v2Workspace.delete` in `packages/trpc/src/router/v2-workspace/v2-workspace.ts:190-200` requires a host-service service token in addition to org membership. Renderer callers fail. Cloud row stays soft-delete.

## Teardown contract (step 2 detail)

Mirrors v1's `runTeardown` (`apps/desktop/src/lib/trpc/routers/workspaces/utils/teardown.ts:21-140`) re-homed into host-service. **Silent** — not a visible terminal pane like v2 setup, because the workspace is about to vanish and users only care about the output if it fails.

```ts
runTeardown({ worktreePath, workspaceId })
  → { status: "ok", output?: string }
  | { status: "skipped" }   // .superset/teardown.sh missing
  | { status: "failed", exitCode: number | null, outputTail: string }
```

- **Script location**: `<worktreePath>/.superset/teardown.sh` (mirrors v2 setup's `.superset/setup.sh` convention; v1's `.superset/config.json`-with-`teardown:[]` stays v1-only).
- **Execution**: `spawn(shell, ["-c", "bash .superset/teardown.sh"], { cwd: worktreePath, detached: true, env: { SUPERSET_WORKSPACE_NAME, SUPERSET_ROOT_PATH, ...baseEnv } })`. Detached so we can SIGKILL the whole process group on timeout.
- **Capture**: combined stdout/stderr into a ring buffer; return last ~4KB as `outputTail` on failure.
- **Exit handling**: listen to `"exit"` (not `"close"`) — same pattern as v1; background children can hold stdio open past exit.
- **Timeout**: 60s → `process.kill(-pid, "SIGKILL")` → `status: "failed"` with `exitCode: null` and outputTail including a timeout marker.
- **Missing script**: fast-return `{ status: "skipped" }`.
- **`force` in destroy**: skips this step entirely. Don't re-run a known-broken script.

## Host ownership

`v2Workspaces.hostId` (`packages/db/src/schema/schema.ts:523-525`) ties each workspace to exactly one host. `workspaceCleanup.destroy` verifies `local.hostId === currentHostId` and throws `FORBIDDEN` otherwise. The UI does not surface delete for workspaces on other hosts. Cross-device delete is not a supported operation.

## Out of scope

- **Abandoned-host cleanup**: retired/lost machines leave zombie hosts + workspaces in the cloud. That's a separate "Remove this device" operation (settings → devices), not this flow.
- **Visible-pane teardown**: rejected. v2 setup is visible because users need to see it succeed; teardown has nothing actionable once it starts and the pane evaporates with the workspace.
- **Bulk delete / trash bin**: future flow composing `destroy` calls.

## Work order

1. Host-service: new `workspaceCleanup` router with `destroy`.
2. Renderer: `useDestroyWorkspace` hook + confirm dialog (dirty + branch opt-in).
3. Swap v2 delete call sites: sidebar context, EmptyTabView, hotkey, v2-workspaces list row.
4. Lock `v2Workspace.delete` to host-service service tokens.
5. Delete Path B call path.

## Acceptance

- v2 renderer has one delete target: `hostServiceClient.workspaceCleanup.destroy`.
- `v2Workspace.delete` is reachable only from host-service.
- Clean worktree + no branch delete = one click.
- Dirty worktree surfaces a typed CONFLICT and a confirm → `force: true` retry.
- Cloud failure produces a warning, not an orphan visible to the user.
