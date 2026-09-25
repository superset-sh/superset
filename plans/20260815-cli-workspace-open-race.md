# CLI workspace create → open race: dead screen until the 30s fallback refetch

**Status:** implemented 2026-08-15 (one PR: verdict invariant + manifest claim/ownership guards) · repro + failure-mode matrix verified · owner: Kiet

## Problem

Rosh (wattdata) had an agent recycle a workspace via the CLI (`superset workspaces
delete` → `create --local` → `open`). The desktop routed to the new workspace ID and
showed a dead screen — "Workspace not found" in his case — for tens of seconds.
Opening the same workspace later from the Workspaces list worked fine. His words:
"from the CLI creation path there seems to be some time in space where you get routed
to where it's supposed to be and maybe it's not existing."

The same gate causes the known ~0.5s "Workspace not found" flash right after the
in-app new-workspace dispatch (seen during README film staging, 2026-08-12).

## Root cause

The renderer's host-workspace cache (`useHostWorkspaces`) converges by exactly two
paths:

1. `workspace:changed` WS broadcast — fire-and-forget. `eventBus.ts` replays only
   fs-watches on reconnect; a broadcast that fires while the socket is down is lost
   forever.
2. A 30s fallback refetch (`WORKSPACES_FALLBACK_REFETCH_INTERVAL_MS`).

`v2-workspace/layout.tsx:79-96` treats "row not in cache" as terminal: blank
`StateScreenShell` when `!isReady`, `WorkspaceNotFoundState` when `isReady`. Nothing
attempts to resolve an explicitly-requested workspace ID. So any missed broadcast
opens an up-to-30s window where a deep link (`superset://v2-workspace/<id>`, fired by
`workspaces open`) or sidebar click lands on a dead screen.

## Repro (verified, CDP against dev desktop)

Healthy event bus: broadcast lands ~280ms into the create mutation, **before** the
CLI even gets its response — no repro, not even a flash. The bug requires a missed
broadcast:

1. `hs.workspaces.create.mutate(...)` and `bus.reconnect()` ~280ms into the in-flight
   create → the `created` event fires into the closed socket and is lost.
2. Navigate to the new ID (same as the deep link's `router.navigate`).
3. Renderer shows a dead screen for **27.3s**, then the fallback refetch heals it and
   the workspace renders normally.

## Failure-mode matrix (all verified 2026-08-15 unless noted)

**A. Missed broadcast → dead screen ≤30s.** Socket down when `created` fires (the
event is unrecoverable; only fs-watches replay on reconnect). Repro: drop the bus
280ms into an in-flight create, navigate → 27.3s dead screen, healed exactly by the
fallback refetch.

**B. Hanging host queries hold `isReady` false → blank shell for ~a minute.**
`retry: 1` bounds attempts, not duration: a known host whose relay fetch blackholes
hangs ~25s per attempt. Measured: navigating to an unknown ID rendered a **blank**
pane for 50.7s, then flipped to "Workspace not found" when the hanging query finally
errored. In a team org (Rosh's wattdata knows teammates' hosts) this is routine — it
explains both of his rendered states, and it means `WorkspaceNotFoundState` can be
unreachable for the first minute after any window reload.

**C. Manifest points at a different host-service instance → EVERY CLI create
misses.** The host-service child unconditionally overwrites
`~/.superset/host/<org>/manifest.json` at boot (`host-service/index.ts:126`, last
writer wins); the CLI trusts it (`resolveHostTarget.ts`). Coordinator adoption only
defends the boot ordering — an instance that boots *after* the desktop steals the
manifest while the desktop keeps its own child. Verified live: a create through a
second instance lands in the **shared host.db** (so the renderer's refetch eventually
serves it) while broadcasting on an event bus the renderer never listens to.
**Found a wild specimen on this machine**: the prod manifest pointed at a host-service
belonging to the Superset 1.22.0 app run **from the mounted DMG** a day earlier, still
alive; the installed apps had adopted it. Triggers: DMG test-drives, canary+stable,
`superset start`, update-surviving instances.

**D. Stale snapshot at boot.** Snapshot hydration counts as "settled" for `isReady`,
so right after a reload the gate can pass judgment from a stale list while the live
query is still in flight → not-found for a row that exists. (Code-read; same gate.)

Related defect found on the way: coordinator `stop()` removes the org manifest
unconditionally — quitting one desktop deletes a manifest now owned by another live
instance, leaving the CLI with "host service isn't running". Fix separately (only
remove when `manifest.pid` is the coordinator's own child).

## Not the bug (ruled out during investigation)

- `txId: null` in CLI create output — always null since local-first (#5731), nothing
  consumes it. Consider deleting the dead field separately.
- The "spinner" in Rosh's video — that's `superset-empty-state-wordmark.svg`, the
  static empty-state art. His workspace was open and healthy in those frames.
- "Workspace not found" after deleting the currently-viewed workspace — by design
  (`layout.tsx:91`), no auto-navigation.

## Fix

All four modes are different ways the renderer's mirror goes stale, but the bug
materializes at exactly one line: where the route concludes "this workspace doesn't
exist" from that mirror. host.db is shared and authoritative, so in every mode the
row is one refetch away. Fix the verdict site (PR 1); fix mode C's topology at its
own source (PR 2) because a second instance silences ALL bus-driven UI (ports, git,
agent status), not just this screen.

### PR 1 — the verdict invariant (`v2-workspace/layout.tsx`, fixes Rosh)

**Never declare not-found from data older than the request.** When the route mounts
for an ID not in the mirror and there's no `failedEntry`: fire one forced refetch of
the host workspace lists (add `refetchAll()` to `HostWorkspacesCacheOps`), render the
loading shell, and render `WorkspaceNotFoundState` only once a fetch that started
after the route mounted has settled without the row — hard cap ~5s, **independent of
`isReady`** (mode B holds `isReady` false ~51s via one hanging host; the local host's
answer is all the verdict needs). Ref-guard one refetch per workspaceId — no loops.

Coverage: mode A heals in ~100ms (was ≤30s), mode C in ~100ms (refetch reads the
shared DB), mode D at boot, mode B collapses from a 51s blank to a bounded
shell→verdict. Also kills the in-app dispatch flash. `WorkspaceNotFoundState` here is
the only place the app draws a "doesn't exist" conclusion from the mirror (checked).

### PR 2 — manifest claim protocol (source fix for mode C's CLI routing)

As implemented (flock was considered but Node has no native flock; the claim
protocol below approximates it without new dependencies):

- Boot: the child yields the manifest to a live, health-probed holder; dead or
  unhealthy holders forfeit (`shouldYieldManifest`, probe = the coordinator's
  retrying `pollHealthCheck`).
- A 15s reclaim tick re-runs the claim whenever the manifest doesn't name us, so a
  yielded instance takes over when the holder quits or dies; cleared during
  shutdown so a tick in the drain window can't resurrect a dying pid.
- Every coordinator removal site (`stop`, `handleChildExit`, failed/cancelled
  start) deletes the manifest only when it names the child being torn down;
  unreadable manifests are left alone, and writes are atomic (tmp+rename) so torn
  reads can't occur.

Residual TOCTOU: read→probe→write and read→unlink are not one atomic operation, so
two instances racing the same dead holder can both claim briefly (converges within
one reclaim tick). The full fix is the single-instance topology — refactor #5.

### Optional hygiene (fold into PR 1 if trivial, else skip)

- Reconnect heal: on event-bus reopen (not initial connect), invalidate that host's
  list — background staleness (sidebar rows) heals in ~100ms instead of ≤30s.
- `AbortSignal.timeout(~10s)` on `workspace.list` fetches so unreachable hosts settle
  into `isError` in seconds — shrinks mode B for every other `isReady` consumer.
- `superset doctor` check: multiple live host-services for one org dir, or manifest
  endpoint ≠ the desktop's active instance.

## Future refactors this investigation argues for (not in the PR)

1. **Event-bus resync contract.** Fire-and-forget events with no catch-up is the
   class bug; the verdict fix covers workspace existence only. Ports, git status,
   agent lifecycle, and project events all go silently stale on a missed frame. A
   sequence number (or generation id) in the stream + invalidate-on-gap/reopen would
   retire the whole class; the fs-watch replay-on-open is precedent.
2. **Client-level fetch timeouts.** The 2×~25s hang lives in
   `getHostServiceClientByUrl` consumers generally, not just workspace.list — one
   `AbortSignal.timeout` at the client link level beats per-query patches.
3. **Per-host readiness.** `isReady` = "every known host settled" makes any one
   unreachable teammate host degrade unrelated UI. Most consumers care about one
   host; per-host readiness (or reachable-quorum semantics) would localize failures.
4. **Drop `txid` from workspace create responses** (dead since local-first #5731) —
   it actively misled this investigation.

## Adversarial review round (2026-08-16, commit 2ef8329)

A 12-finding multi-agent review (9 confirmed) drove a rework: the verdict hook's
cross-navigation latch was replaced with per-id state + effect cancellation (fixed
stale-verdict-on-revisit, late-window clobber → permanent blank, offline permanent
shell), the verdict now waits for `knownHostsSettled` (no remote-host not-found flash
after boot/org switch), reopen tracking moved to a host-keyed ref (effect re-runs no
longer skip gap resyncs), and the manifest lifecycle was hardened (all removal sites
ownership-guarded, atomic writes, reclaim timer cleared on shutdown, shared
pollHealthCheck probe). Deferred: the stable split-brain topology (see refactor #5).

5. **Single-instance topology for host-service.** The coordinator can bind a renderer
   to its own child while a foreign healthy holder keeps the manifest — a stable
   split-brain the yield protocol cannot resolve. One lock-owning supervisor per org
   dir (or handoff-on-claim like the pty-daemon socket adoption) removes the whole
   multi-writer class; the manifest guards in this PR are the pragmatic interim.

## Known residual gaps (accepted)

- Remote-host (relay) workspaces: a host slower than the 5s cap can briefly show
  not-found before self-correcting when its row lands — strictly better than the
  old 0s-grace behavior; untested live (no second machine in the loop).
- Windows/Linux deep-link delivery (`second-instance` argv path) — code untouched,
  not exercised on this macOS pass.

### Explicitly not doing

- Host-side event queue/replay (protocol change, disproportionate).
- Auto-navigate away when the viewed workspace is deleted (separate UX decision).

## Tests

- Layout (PR 1): unknown-but-requested ID → loading shell + exactly one forced
  refetch; post-mount fetch settles with row → workspace renders; without row →
  not-found; cap expiry → not-found; `isReady` false throughout must not block the
  verdict. Mutate the fix out to prove each test fails.
- Host-service (PR 2): second boot on a locked org dir exits without touching the
  manifest; lock released on process death; coordinator `stop()` leaves a foreign
  manifest in place.

## Verification

Done 2026-08-15 against the running dev app (ghost-row insert = deterministic
missed-broadcast sim): before-fix heal at t=26.9s (blank the whole time); with the
fix the same scenario renders at t=0.6s and a genuinely-missing id reaches
not-found in 248ms (was 50.7s blank). Normal create→open unchanged (214ms).

Before/after video: `~/Downloads/workspace-notfound-before-after.mp4` (27s, timer
overlay shows real elapsed time; before segment played at 4x, after in real time).
