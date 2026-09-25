# Offline-first workspaces — implementation reference

Short map of how workspace authority works after the host-service migration.
Design: `20260703-offline-first-workspace-table.md`. Plan: `20260703-1914-...-execplan.md`.

## Model

- **Authority = host.db** (`workspaces` table, `packages/host-service/src/db/schema.ts`). One SQLite per org per machine. Full row: `id, projectId, name, branch, type('main'|'worktree'), taskId, createdByUserId, createdAt, updatedAt, worktreePath, cloudSyncedAt`. Partial unique index: one `type='main'` per `projectId`.
- **UUIDs minted host-side** (`crypto.randomUUID()`), not cloud.
- **Cloud `v2_workspaces` = projection only**, kept via dual-write. Deleted in R3 (adoption-gated).
- **Tombstones**: offline deletes queue in `workspace_cloud_deletes`; drained on cloud-confirm.

## Read path (desktop)

- `useHostWorkspaces` (`apps/desktop/.../hooks/host-workspaces/`) fans out `workspace.list` to every `v2_hosts` row: local host direct (`activeHostUrl`), remote via relay (`{relayUrl}/hosts/{routingKey}`).
- **`networkMode: "always"`** — mandatory: default `"online"` pauses 127.0.0.1 queries when `navigator.onLine` is false, breaking offline-first.
- Live updates via per-host `workspace:changed` events patch the react-query cache (no refetch); 30s interval heals missed events (`refetchIntervalInBackground: true`).
- Remote hosts' last-seen lists persist to **IndexedDB** (idb-keyval); local host needs no cache (always reachable).
- **Merge** (`mergeHostWorkspaces`): a host that answered is authoritative for its rows (deletes can't resurrect); Electric `v2Workspaces` fills in only for hosts that served nothing (pre-R1 / no snapshot). Dedup by id. Fallback deleted in R3.

## Write path

- **Create**: renderer → host `workspaces.create` → local row + `workspace:changed` first, then best-effort cloud push. UI confirms on the local event, not Electric txid.
- **Rename/branch/task**: host `workspace.update` (local-first, cloud push best-effort). Unified — no more direct renderer→cloud `v2Workspace.update`.
- **Delete**: local row removal is the commit point; cloud delete degrades to a warning + tombstone.

## Cloud sync (R1–R2 only, `workspace-cloud-sync.ts`)

- Inline best-effort push on each write; failure marks row `cloudSyncedAt=null`.
- 60s reconciler drains tombstones (deletes first) then dirty rows.
- **Name/taskId LWW** by `updatedAt` (renderer still writes cloud directly in R1 → two-writer). Branch is always host-truth. Clock-skew-tolerant; gone in R3.

## Auth

- `workspace.list`/`update` are bare `protectedProcedure` — host serves **all** org rows, no per-user scope.
- Per-user restriction is enforced at the **relay** (`host.checkAccess`), not the host. The host is not the authz boundary — don't remove the relay check.

## Automations

- Client denormalizes `targetHostId`+`v2ProjectId` onto the pin; cloud skips `verifyWorkspaceInOrg` when supplied. Dispatch routes off `targetHostId`, never reads `v2_workspaces`. Host 404s on unknown ids at run time.

## External clients (MCP/CLI/SDK)

- MCP/CLI fan out per-host `workspace.list` over relay; unreachable hosts reported, not fatal. SDK `list` stays cloud-backed until R3 (return-type break).

## Status / gaps

- M1–M5 done; **M6 (R3 cloud deletion) gated on desktop adoption telemetry**, not a date.
- `hostReachable` is computed per row but **no consumer reads it** — offline remote rows render as live; write affordances aren't disabled. Wire it in or drop the "flagged unreachable" claim.
- **No true Wi-Fi-off cold-boot test yet** — process-kill drills can't exercise `navigator.onLine`. Required before R2 ships broadly.
