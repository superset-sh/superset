# Sidebar State Resilience

Why the dashboard sidebar clears/refreshes "randomly", what we verified, what
is fixed, and what remains. All findings CDP-verified 2026-08-01 against the
live dev app (real mouse input, MutationObserver on PR icons, fetch logging,
direct React Query cache reads), except where marked.

## How the sidebar gets its data

```text
v2Hosts (Electric)  ──┐
machineId + activeHostUrl (coordinator IPC) ──┤→ targets (one per host)
                      │
targets → workspace.list / project.list per host (React Query, hostUrl in key)
        → IndexedDB last-seen snapshots (rows survive cold queries)
        → pullRequests.getByWorkspaces per host (chips, no snapshot)
        → terminal-agent-bindings, ports (chips, no snapshot)
v2WorkspaceLocalState / v2SidebarProjects / v2SidebarSections (localStorage)
        → placement: order, sections, pins, hidden
```

Everything downstream dies if `targets` empties: snapshots are looked up
*per target*, so losing the target loses the rows, not just their freshness.

## Failure vectors

### 1. Membership-change query-key churn — FIXED (this branch)

The PR-chip batch query key embedded the host's full sorted `workspaceIds`.
Any delete/hide/pin/create minted a brand-new query: cache discarded, every
PR/CI chip on the host blanked, full batched refetch. Verified pre-fix:
all 8 icons removed at +195 ms after confirming a delete, re-added at
+258 ms, off-cadence fetch at +196 ms with poll-phase reset. Post-fix: zero
icon mutations, one stable cache entry, unbroken 10 s poll cadence.

Fix: key by `machineId + hostUrl` only (`derivePullRequestQueryTargets.ts`);
the queryFn reads current ids; the 10 s poll and hover refresh converge
additions. Regression test mutation-verified.

Rule: never put a derived membership list in a queryKey for per-host batch
queries.

### 2. Electric `v2Hosts` empty → target loss — FIXED (this branch)

`v2Hosts` served straight from Electric. Cold start before hydration or a
resync window returning `[]` drops every remote host's target (rows and
chips vanish); if `activeHostUrl` is also null, the synthesized local target
goes too and the sidebar is completely empty. Verified: this dev renderer had
`v2Hosts = []`, and a host-service outage cleared rows *and* chips to zero
for the full ~190 s (snapshots never consulted — the targets were gone).

Fix: `useKnownHosts` persists the last-seen host list to IndexedDB per org
and serves it while the collection is empty and not yet ready. A
ready-but-empty list is authoritative (no ghost hosts); live rows win
outright when present (no row-level merge, so deleted hosts can't
resurrect). Swapped into the four target-derivation read paths:
`useHostWorkspaces`, `useHostProjects`, `useDashboardSidebarData`,
`useDashboardSidebarPortsData`.

Assumption behind "ready + empty is authoritative" (verified in
`@tanstack/electric-db-collection` 0.3.12 and 0.3.15): must-refetch
truncation runs inside a transaction, so a synced collection never publicly
serves a transient empty state. If a future upgrade makes truncation visible
mid-refill, revisit `resolveKnownHosts`. Relatedly, 0.3.14 fixed progressive
collections truncating persisted rows when resuming from saved shape
metadata — a library-level cause of this exact vector — so keep the package
at ≥0.3.14 (bumped on this branch).

Verified A/B under the same harness: host-service SIGKILL with the snapshot
seeded — rows held 3/3 through the whole outage (pre-fix: 0/3 for ~190 s);
only chips dipped ~5 s (vector 3, open) and recovered on respawn.

Not swapped (cosmetic/admin surfaces, still Electric-direct): hosts settings
pages, `useRemoteHostStatus`, `useAccessibleV2Workspaces`,
`useWorkspaceHostOptions`, automations pages.

### 3. Host-service restart / port churn — FIXED (this branch)

The local host-service port is only usually stable: the coordinator retries
the remembered port but falls back to a fresh ephemeral port when the old one
can't bind (lingering dying process, crash restart) — observed naturally:
51507 → 53875 → 57324 across three dev sessions in one day. `hostUrl` was in
every host query key, so a port change cold-started every cache bar-wide.

Fix, part 1: caches are keyed on host identity, never routing — workspaces/
projects/PR-chips/ports on `organizationId + machineId`, agent bindings on
`workspaceId` alone (globally unique; shared `getTerminalAgentBindingsQueryKey`
builder so invalidation sites can't drift). The queryFn resolves the current
URL from the target at fetch time; staleness after a URL change is bounded by
the existing polls (10–30 s). The ports key and the v2-workspaces-page PR key
also embedded `workspaceIds` — the vector-1 defect again — fixed in the same
pass. The query cache is persisted, so identity keys additionally mean chips
start warm across app relaunches.

Fix, part 2: PR targets survive `activeHostUrl: null` (query disabled, not
unmounted — same pattern as the workspaces/projects fan-outs), so cached
chips keep rendering through the outage instead of blanking while the query
would otherwise unmount.

CDP A/B, forced port change via SIGKILL + port squat (auto-respawn picks a
fresh port): URL-shaped keys — cache 6 → 12 entries (6 cold-minted, 4
orphaned on the dead port), all chips blank ~6 s. Identity keys + surviving
targets — cache byte-identical (0 minted), chips 9/9 and rows 3/3 through
the entire kill/outage/respawn cycle (33 s observation window).

**Worse, found during verification:** if the respawn fails to bind, the
coordinator wedges at status `"stopped"` permanently — there is no spawn
retry. A manual `hostServiceCoordinator.restart` recovers. (A plain crash is
fine: SIGKILL-tested, the coordinator auto-respawns within seconds — the
wedge is specific to spawn failure.) Deserves its own ticket: this is "app
silently loses its host", not just a refresh.

### 4. Session flicker → full tree remount — OPEN (server half)

One session tick with `activeOrganizationId: null` instantly redirects to
`/create-organization` and unmounts the entire authenticated tree
(`_authenticated/layout.tsx:259`). Verified by injecting a null-org value
into the auth client's session atom: sidebar 3 rows/9 chips → 0/0 in one
tick. The client half (token-rotation signed-out window) was fixed in #6089;
the server half — get-session recomputing membership and *writing* null back
to the session row on a transient empty read
(`resolve-session-organization-state.ts` in `packages/auth`) — is still
open. In production this doesn't self-heal: the server keeps returning null.

### 5. Org switch — BY DESIGN

`CollectionsProvider` returns null during `isSwitching`; full teardown and
rebuild. Verified via `organization.setActive` round-trip: full clear, full
recovery. Anything that *looks* like an org change to the app produces a
total sidebar clear — which is why vector 4 reads as "random".

## Status summary

| Vector | Symptom | Status |
|---|---|---|
| Membership key churn | all PR chips blank + refetch on delete/hide/pin/create | fixed here |
| Electric hosts empty | remote (or all) rows vanish | fixed here (`useKnownHosts`) |
| Host restart / port churn | chips blank bar-wide; rows survive | fixed here (identity-keyed caches) |
| Coordinator no-retry wedge | host-service down until manual restart | open — file ticket |
| Session null write-back | whole app remounts to /create-organization | open (`packages/auth`) |
| Org switch | full clear + rebuild | by design |
