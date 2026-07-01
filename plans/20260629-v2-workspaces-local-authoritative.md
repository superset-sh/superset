# v2_workspaces → local-authoritative

**Date:** 2026-06-29 · **Scope:** `packages/host-service`, `packages/trpc/router/v2-workspace`, `apps/desktop` renderer, cloud `v2_workspaces`

This is the central step of the local-first plan ([[20260628-local-first-data-ownership]]) and the riskiest. It is NOT a Reference demotion — it should be its **own PR**, not piggybacked on the Reference-table PR.

## Current architecture (three stores)

| Store | Holds | Authority today |
| ----- | ----- | --------------- |
| **Cloud Postgres `v2_workspaces`** | id, org, projectId, hostId, name, branch, type, taskId, createdBy | **source of truth**, Electric-synced read-only into the renderer |
| **host-service SQLite `workspaces`** | id (same UUID), projectId, **worktreePath**, branch, headSha, upstream, prId | disk index, written cloud-first then mirrored |
| `packages/local-db` | v1 desktop model | **legacy — irrelevant to v2** |

Key facts from the code map:
- The **worktree path is already local-only** in host-service SQLite; cloud never holds it.
- host-service is the orchestrator: on create it writes cloud (insert gate) then its own SQLite, same UUID, with a rollback ladder.
- Every renderer read of `collections.v2Workspaces` consumes only cloud columns (`id, org, projectId, hostId, name, branch, type, taskId`) and resolves the owning host **separately** via `useWorkspaceHostUrl`. **Nobody reads a path from the collection.** → clean seam.
- Write confirmation rides Electric `txid` (`electricTxidMatch`, `waitForWorkspaceDeleted`, `ELECTRIC_WRITE_SYNC_TIMEOUT_MS`).

## The flip

Promote **host-service SQLite** to source of truth; demote cloud `v2_workspaces` to a **presence mirror** (best-effort, async). Concretely:

1. host-service `workspaces` row absorbs the identity columns it lacks: `name`, `type`, `organizationId`, `taskId`, `createdByUserId`.
2. Create/update/delete **commit locally first**, then upsert thin presence to cloud (idempotent), instead of cloud being the insert gate. The rollback ladder inverts.
3. Renderer reads come from the owning host (already host-resolved) — or the Electric collection is fed *from* local truth. Confirmation becomes local-commit, not Electric `txid`.
4. Cloud `v2Workspace.create/update/delete` become idempotent "upsert presence" endpoints.

## Sequenced increments (each shippable)

1. **Local carries identity (groundwork).** Add `name/type/organizationId/taskId/createdByUserId` to host-service `workspaces`; populate on create (alongside existing cloud write). Additive, no behavior change. ⚠️ host-service migration — sensitive (see Risks).
2. **Offline-capable create.** Commit the worktree + local row first; push cloud presence best-effort; stop rolling back the worktree on cloud failure. Park failed presence pushes for retry.
3. **Read from local truth.** Feed the renderer's workspace list from the host (local) rather than the Electric shape, or invert so Electric mirrors local. Replace `txid`/`waitForWorkspaceDeleted` with local-commit confirmation.
4. **Cloud → presence mirror.** Make cloud procedures pure idempotent upserts; cloud is no longer required for a workspace to exist.
5. **Promote/Share (from the parent plan).** A workspace is local until shared; presence push becomes opt-in.

## Risks

- **host-service migrations have crashed in production** (busy_timeout / swallowed-failure / port-bind). Any schema change here (increment 1) needs the migration tested under the real ABI and must not block startup on failure.
- The **delete saga** removes the worktree *before* cloud delete on purpose; inverting authority must preserve "disk failure keeps it retryable."
- The **one-main-per-host** partial unique index lives in cloud; if cloud stops being the gate, that invariant must move local.
- Electric still syncs ~22 other tables; this change must not disturb the shared `v2Hosts/v2Clients/v2_users_hosts/device_presence` shapes (those stay Shared).

## Recommendation

Own PR. Start with **increment 1** (local carries identity) since everything else depends on it — but treat the host-service migration as the gating risk and verify it before building on top.
