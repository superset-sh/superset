# Workspace delete — design

Scope: the `workspaceCleanup.destroy` flow that tears down a v2 workspace. Today `v2Workspace.delete` is cloud-only, so the host-side state leaks (orphan `.worktrees/<branch>/` dir, orphan host-service `workspaces` row). This spec covers full resource cleanup.

## Principle

**The side that owns the harder-to-reverse state orchestrates.** Host-service owns the git worktree and local DB; the cloud row is bookkeeping *about* that workspace. If host-service commits to the delete, the cloud follows. If the cloud-delete fails after the disk is gone, the user still has a consistent view (nothing to open) and the cloud row can be cleaned up on any subsequent sync.

This mirrors create: host does `git worktree add`, then calls cloud `v2Workspace.create`, then inserts the local row. Delete inverts the same order.

## New procedure

```ts
workspaceCleanup.destroy: protectedProcedure
  .input(z.object({
    workspaceId: z.string(),
    deleteBranch: z.boolean().default(false),  // user opt-in
    force: z.boolean().default(false),         // user opt-in after dirty check
  }))
  .mutation(async ({ ctx, input }) => {
    // 1. Look up local workspace row → worktreePath + branch
    const local = ctx.db.query.workspaces
      .findFirst({ where: eq(workspaces.id, input.workspaceId) }).sync();
    if (!local) throw TRPCError("NOT_FOUND");

    const git = await ctx.git(/* main repo path */);

    // 2. Remove the worktree on disk. Without --force, git refuses if
    //    dirty — surface that to the renderer so it can prompt.
    try {
      await git.raw([
        "worktree", "remove",
        ...(input.force ? ["--force"] : []),
        local.worktreePath,
      ]);
    } catch (err) {
      throw TRPCError("CONFLICT", { cause: err });  // typed so client can prompt
    }

    // 3. Optionally delete the branch. `--delete` fails if not merged;
    //    `--delete --force` doesn't care. Gate on `force`.
    if (input.deleteBranch && local.branch) {
      try {
        await git.raw([
          "branch",
          input.force ? "-D" : "-d",
          local.branch,
        ]);
      } catch (err) {
        // Non-fatal: worktree is gone, cloud is still there, user can
        // clean up the branch manually later. Return as a warning.
        warnings.push(`Failed to delete branch: ${err.message}`);
      }
    }

    // 4. Cloud soft-delete. If this fails, disk is already clean —
    //    renderer retries or the cloud eventually reconciles.
    try {
      await ctx.api.v2Workspace.delete.mutate({ id: input.workspaceId });
    } catch (err) {
      // Log + swallow. The local cleanup is what matters for UX.
      console.warn("[workspaceCleanup.destroy] cloud delete failed", err);
    }

    // 5. Local bookkeeping.
    ctx.db.delete(workspaces)
      .where(eq(workspaces.id, input.workspaceId)).run();

    return { warnings };
  });
```

## Failure modes

| Step fails | What the user sees | Recovery |
|------------|--------------------|----------|
| 2 (worktree dirty, no `--force`) | Typed `CONFLICT` error | Renderer prompts "Worktree has uncommitted changes — delete anyway?" → re-call with `force: true` |
| 2 (other git error) | Error surfaces | User investigates; nothing was deleted |
| 3 (`git branch -d` — branch not merged) | Warning surfaced | User can delete manually or re-delete with `force: true` |
| 4 (cloud delete) | Success (warning) | Next `searchBranches` on any device shows the orphan cloud row; periodic sweep cleans it up, or a manual `v2Workspace.delete` call does |
| 5 (local DB) | Success (warning) | Self-heals on next searchBranches probe |

Partial failure never leaves dirty disk + silent disappearance. Worst case: cloud row lingers, renderer re-cleans on next delete attempt.

## Renderer flow

```ts
const destroy = useDestroyWorkspace();

async function onDeleteClick(workspaceId: string) {
  try {
    await destroy({ workspaceId, deleteBranch: false, force: false });
  } catch (err) {
    if (err.code === "CONFLICT") {
      // Worktree dirty — confirm dialog.
      const { deleteAnyway, deleteBranch } = await showDeleteConfirm({
        title: "Uncommitted changes in worktree",
        options: { deleteBranch: { default: false } },
      });
      if (deleteAnyway) {
        await destroy({ workspaceId, deleteBranch, force: true });
      }
    } else {
      toast.error(err.message);
    }
  }
}
```

## UX decisions

- **Delete the branch by default?** No. `deleteBranch` opts in. V1 defaults to deleting; v2 diverges here because workspace branches in our flow are intentionally ephemeral-or-reusable — users sometimes want the branch to live on for a PR. The confirm dialog exposes it as a checkbox, off by default.
- **Confirm dialog always, or only when dirty?** Only when dirty or `deleteBranch: true`. Fast path stays one click for clean, branch-keeping deletes.
- **Force as a single param covering both worktree and branch?** Yes. They're both "I acknowledge this might destroy work" signals and splitting them is UX noise. If the user ticked "delete anyway" for a dirty worktree, `-D` instead of `-d` for the branch is the same acknowledgment.

## What this replaces

- Direct calls to `v2Workspace.delete` from the renderer → replace with `workspaceCleanup.destroy`.
- The picker's "stale hasWorkspace" symptom (just fixed defensively via client-collection lookup) — becomes unnecessary once this exists, but the defensive fix stays as belt-and-suspenders.

## What this does *not* cover

- Cross-host cleanup (workspace on remote host, deleted from this device). The remote host has to hear about it — either via the cloud row sync or via a fan-out RPC. For now: remote-host deletes still orphan disk on that host. Separate problem; same pattern.
- Soft-delete vs. hard-delete of the cloud row. Today `v2Workspace.delete` soft-deletes; keep that so soft-delete remains the cloud-side model.
- Bulk delete. Current scope is one workspace at a time; a future "trash bin" flow would compose `destroy` calls.

## Implementation order

1. Host-service: `workspaceCleanup` router with `destroy` procedure.
2. Renderer: `useDestroyWorkspace` hook (mirrors `useCheckoutDashboardWorkspace`).
3. Renderer: confirm dialog component for dirty-worktree + delete-branch opt-in.
4. Swap delete call sites (workspace list context menu, workspace settings) from `v2Workspace.delete.mutate` to `useDestroyWorkspace`.
5. Delete the defensive host-side `workspaces` row leak — self-heals via this flow.
