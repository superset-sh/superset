# Local-first workspace lifecycle (offline create/delete)

**Status:** Implemented in PR #5396 (2026-07-03). Create and delete commit
locally and mirror presence via `cloud_presence_outbox` (op create|delete);
cloud create was already idempotent on a client-supplied id, so no cloud
change was needed. Deviations from the sketch below: one generic presence
outbox instead of a separate create outbox, and `adoptExistingWorktree` /
`ensureMainWorkspace` stay cloud-first (adopt needs cloud relink semantics;
main-ensure already degrades log-and-continue offline).

## Problem

The read path is local-first, but the two lifecycle operations are cloud-gated:

- **Create** (`workspaces.create`, host-service): calls
  `ctx.api.v2Workspace.create` *first* and aborts without a cloud row. Offline
  → cannot create a workspace, even though the worktree, branch, and local row
  need nothing from the cloud.
- **Delete** (`workspace-cleanup`): the cloud delete is the commit point
  (step 3, before the local row delete). Offline → cannot delete.

The cloud `v2_workspaces` row is only *presence* now — it should never block a
local operation.

## Design

### Create: local-commit, mirror-later

1. Host-service generates the workspace UUID locally (`crypto.randomUUID()`),
   creates the worktree, and inserts the local row — no cloud involved.
2. Cloud presence mirror (`v2Workspace.create` with the same id) becomes a
   best-effort step. On failure, enqueue into a `cloud_create_outbox`
   (mirror of the `cloud_delete_outbox` shipped in PR #5396) and retry on
   boot + interval.
3. `v2Workspace.create` must accept a client-supplied id (it already takes
   `idempotencyId`; extend or replace with the actual workspace id) and be
   idempotent on retry.

Edge cases:
- **Name generation**: friendly names currently come from the cloud create
  response (`cloudRow.name`). Move generation host-side (the
  `generateFriendlyBranchName` util is already in `@superset/shared`), send the
  chosen name in the mirror.
- **`one_main_per_host` uniqueness**: enforced by a cloud unique index today.
  Local insert must enforce the same rule locally (query before insert); the
  mirror can still conflict if another profile raced — treat cloud CONFLICT as
  a reconcile signal, not a failure.
- **Renderer optimistic flow**: `onInsert` metadata already carries the host
  call; no cloud txid has been awaited since the Electric removal, so the
  renderer path needs no change.

### Delete: local-commit, tombstone the mirror

1. Reorder `workspace-cleanup`: worktree/branch/local-row teardown commits
   locally; the cloud delete moves after and becomes best-effort.
2. On cloud-delete failure, enqueue into the existing `cloud_delete_outbox`
   (shipped in PR #5396) — the boot/hourly flush already retries it.
3. Renderer: the workspace disappears from `localList` on the next poll; the
   ghost cloud row is masked client-side until the outbox flush lands. The
   mask is exactly the outbox's pending delete ids
   (`workspace.pendingCloudDeletes`) — masking all own-hostId cloud rows
   without a local row would hide the other profile's workspaces (dev/prod
   share the machine hostId) and everything after a local DB reset.

### What NOT to do

- **No inference sweep** ("delete cloud rows not in my local list"):
  `getHostId()` is machine-derived, so dev and prod host-services on one
  machine share a hostId with different local DBs — a sweep deletes the other
  profile's presence. Only outbox entries (ids this host explicitly acted on)
  may be deleted. Same reasoning documented in host-service `schema.ts`.
- **No new sync protocol**: presence divergence self-heals through the
  existing poll reconcile (adopt + push) and outboxes.

## Ordering / migration

1. Cloud: make `v2Workspace.create` idempotent on client-supplied id.
   (Cloud deploys before desktop — safe per deploy ordering.)
2. Host-service: `cloud_create_outbox` migration + flush (extend the
   `cloud-delete-outbox` runtime module into a generic presence outbox).
3. Host-service: flip create to local-commit; flip cleanup ordering.
4. Verify offline: create + delete with the API unreachable, confirm both
   commit locally and the outbox drains once the API returns.

## Risks

- Duplicate presence rows if idempotency is wrong → keyed on workspace id,
  server-side upsert.
- A machine that never comes back online leaves presence ghosts on other
  machines. Acceptable: the same is true of its worktrees; a future
  host-liveness sweep (cloud-side, keyed on v2_hosts.lastSeenAt) can garbage-
  collect presence for dead hosts.
