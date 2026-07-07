# ExecPlan: move workspace authority from Neon `v2_workspaces` → host-service local table

Living doc. Design/rationale: `20260703-offline-first-workspace-table.md`. Quick end-state map: `offline-first-workspace-table-reference.md`.

## Goal

A workspace is a git worktree on one machine, but its canonical record lives in cloud Postgres — so create/rename/delete need a cloud round-trip and the cloud mints the UUID. **Make host.db the authority** so all of it works offline; keep cloud `v2_workspaces` as a projection until old clients age out, then delete it.

**Acceptance:** network off → launch desktop → create/rename/destroy a workspace (worktree on disk, terminal opens), all with no sync spinner. Reconnect → other machines' workspaces reappear.

## Decisions (locked)

| # | Decision |
|---|---|
| 1 | Host-service owns workspaces outright; no cloud `v2_workspaces` reads remain. |
| 2 | Each client fans out to hosts itself (local direct, remote via relay) and merges — no aggregator. |
| 3 | Automations denormalize `hostId`/`projectId` on the pin; cloud skips `verifyWorkspaceInOrg`. |
| 4 | Renderer fan-out hook + IndexedDB cache; no TanStack collection. |
| 5 | Cloud list endpoint deleted; MCP/CLI/SDK query hosts directly. |
| 6 | Delete both orphaned `apps/web/workspaces` pages. |
| 7 | Host serves its list to any caller with its orgId in the JWT; per-user scope enforced at the **relay**. |
| 8 | Staged rollout, R3 gated on **adoption telemetry, not a date**. |

## Progress

| Milestone | Status |
|---|---|
| **M1 (R1)** host.db owns full rows: schema 0008, `workspace:changed` events, local-first writes, dual-write + 60s reconciler, backfill, `workspace.list`/`update` | ✅ CDP offline drill passed |
| **M2 (R1)** cloud: client-minted id accepted, automation denormalized pin, PostHog capture stays cloud-side (deferred to R3) | ✅ |
| **M3 (R2)** `useHostWorkspaces` fan-out hook: per-host queries, live `workspace:changed` patches, IndexedDB snapshots, Electric read-through fallback | ✅ |
| **M4 (R2)** ~25 `useLiveQuery` consumers migrated; writes unify through owning host; Electric collection now read-only fallback | ✅ CDP offline drill passed |
| **M5 (R2)** MCP/CLI fan out over relay; SDK `list` stays cloud-backed till R3 | ✅ (manual MCP drill pending) |
| **M6 (R3)** delete cloud surface (router, shape, pages, FK, table) | ⛔ gated on desktop adoption |

## Milestones (what each release does)

- **R1** — host.db gains full fields + one-main-per-project index + tombstones. Writes go local-first with host-minted UUIDs; cloud dual-write is best-effort, reconciled every 60s. Cloud `create` accepts a client id; automations accept the denormalized pin. Old clients unaffected (dual-write).
- **R2** — desktop reads flip to the fan-out hook (falls back to still-synced Electric rows for hosts that served nothing). Writes confirm on local host events, not Electric txids. MCP/CLI query hosts directly.
- **R3** — delete dual-write/reconcile, the cloud router + Electric shape + web pages, drop `chat_sessions.v2WorkspaceId` FK, drop the table (Neon migration is **user-run**, per AGENTS.md). Move PostHog capture host-side.

## Key discoveries

- **`networkMode: "always"` is mandatory.** react-query's default pauses 127.0.0.1 queries when `navigator.onLine` is false — silently defeats offline-first. Also `refetchIntervalInBackground: true` (automation/CLI creates land unfocused) and `retry: 1` (tunnel-less relay targets settle fast).
- **No host-side JWT work needed** (D-auth): the relay verifies org membership + host access, then rewrites Authorization to the host PSK. `protectedProcedure` already covers local + relay callers.
- **Name/taskId two-writer hazard**: renderer still writes cloud directly in R1, so the reconciler uses per-row last-write-wins by `updatedAt`; branch is always host-truth. Gone in R3.
- **Destroy semantics changed**: local row delete is the commit point; cloud delete degrades to a warning + tombstone; a sqlite delete failure is now a hard error.
- **PR review pass (2026-07-07)**: `host.ensure` memoized (was 2×/create + 1×/dirty row), backfill skips failing rows, relink re-keys in a transaction, `workspace.update` no-ops empty patches. Declined: SQLite CHECK on `type` (table rebuild; typed store guards), async `existsSync` (µs at real counts).

## Deferrals / open

- PostHog capture stays cloud-side until R3 (dual-write avoids double-counting).
- **Drop the remote-host IndexedDB cache?** (saddlepaddle, PR review) — ~40 lines; without it, offline machines' workspaces vanish from the sidebar instead of showing last-seen. Kiet to call it.
- SDK `workspaces.list` stays cloud-backed until R3 (changing it breaks the public return type).
- Manual MCP `workspaces_list` drill against a live host still to run.
- **No true Wi-Fi-off cold-boot test yet** — process-kill drills can't exercise `navigator.onLine`. Do before R2 ships broadly.
- **`hostReachable` is computed but no consumer reads it** — offline remote rows render as live and their write affordances aren't disabled. Wire it in or drop the "flagged unreachable" claim.

## Safety

- R1/R2 are git-revertable; dual-write means either store rebuilds the other.
- Nothing destructive until M6's Neon migration — user-run and adoption-gated.
