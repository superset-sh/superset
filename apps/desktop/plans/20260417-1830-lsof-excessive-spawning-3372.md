# Stop Excessive `lsof` Process Spawning (Issue #3372)

## Problem

[#3372](https://github.com/superset-sh/superset/issues/3372): Superset spawns a growing pile of `lsof` processes. Symptoms: CPU pinned at 100%, count grows with open workspaces, closing workspaces doesn't help, quitting Superset leaves `lsof` behind.

Related: [#3235](https://github.com/superset-sh/superset/issues/3235) — EDR agents amplify every spawn, so fixing this also reduces their CPU.

## Root Causes (three, compounding)

All in `apps/desktop/src/main/lib/terminal/`.

1. **Interval never stops.** `PortManager` constructor called `startPeriodicScan()` at module load. The 2.5s `setInterval` kept firing forever — zero sessions, closed workspaces, whatever.
2. **Hint scans run concurrently with the bulk scan.** `scanPane` had no `isScanning` guard. Hint regexes `/port\s+(\d+)/i` and `/:(\d{4,5})\s*$/` were so loose they matched routine `git`/`ssh` output, firing spurious scans on top of the periodic ones.
3. **`lsof` children outlive us.** Code ran `exec("sh -c 'lsof … || true'")`. On timeout, Node SIGTERMs the shell; the shell doesn't forward to `lsof`; the child gets reparented to `launchd`/`init` and survives even app quit.

## Fix (minimum-churn, one PR)

1. **Lifecycle:** interval starts on first `registerSession`/`upsertDaemonSession`, stops on the last unregister.
2. **Coalesce:** one debounced hint timer + a `scanRequested` flag. If a hint or tick fires mid-scan, queue exactly one follow-up. `maxInFlight == 1` guaranteed.
3. **No orphans:** `execFile` instead of `exec` (no shell wrapper). `AbortController` on `PortManager`; `stopPeriodicScan` aborts the in-flight child.
4. **Regex noise:** delete the two over-broad patterns; keep the three that imply a real listener (`listening on`, `server started`, `ready on`).

## Alternatives Considered (and why rejected)

- **A3, event-driven only (no interval):** misses silent port openers. Deferred.
- **B1, shared `isScanning` flag only:** still drops detection for up to 2.5s with no follow-up guarantee. B2 is strictly better for the same worst-case latency.
- **B3, per-pane `isScanning` + semaphore:** more state, same behavior as B2.
- **C3, `killSignal: "SIGKILL"`:** kills the shell, child still orphans. Doesn't address the root issue.
- **D3, delete all hints:** loses fast-detection for dev servers (UX regression).
- **Option 1: delete the whole dynamic-port subsystem and rely on `.superset/ports.json`:** attractive (-1500 lines) but regresses feature for users without a static config.
- **Option 2: delete periodic scan, hint-only:** halves the code but misses silent port openers.
- **Option 4: delete `lsof` entirely, parse ports from terminal output:** most elegant (-700 lines) but loses PID info (Kill Port), still has edge cases.

Chose minimum-churn because the real cost isn't `lsof`'s per-call expense (~100 ms on the fast path) — it's the three lifecycle bugs multiplying it. Fix those and the feature works fine.

## Prior Attempt — Superseded

Auto-generated PR [#3373](https://github.com/superset-sh/superset/pull/3373) by `github-actions[bot]` addresses lifecycle + a weaker `isScanning` guard on `scanPane`. Leaves the orphan-on-timeout and noisy-regex causes untouched. This PR addresses all three.

## Progress

- [x] (2026-04-17) Lifecycle: lazy start/stop via `ensurePeriodicScanRunning` / `stopPeriodicScanIfIdle`
- [x] (2026-04-17) Concurrency: `scanRequested` follow-up flag; deleted `scanPane`, `scanPidTreeAndUpdate`, `pendingHintScans`
- [x] (2026-04-17) `execFile` + `AbortSignal`; `runTolerant` helper for lsof exit-1
- [x] (2026-04-17) `AbortController` aborted on `stopPeriodicScan`
- [x] (2026-04-17) Deleted the two over-broad hint regexes
- [x] (2026-04-17) Deleted dead `getProcessName` export and unused `paneId` parameter
- [x] (2026-04-17) 13 regression tests in `port-manager.test.ts`; A/B verified (8 fail on `main`)
- [x] (2026-04-17) `bun run typecheck` + `bun run lint:fix` clean; 127/127 terminal tests pass
- [x] (2026-04-17) PR [#3547](https://github.com/superset-sh/superset/pull/3547) opened
- [ ] Manual validation on macOS with 10 workspaces
- [ ] #3547 merged, #3372 and #3373 closed

## Surprises

- `execFile` via `promisify` rejects on non-zero exit codes. `lsof` exits 1 when its `-p` filter matches no PIDs — legitimate empty result. Added `runTolerant` helper that reads `err.stdout` off the rejection.
- The production `getListeningPortsLsof` swallows all errors and returns `[]`. The initial test mock rejected on abort, which broke `forceScan`'s contract; fixed by mirroring production (resolve on abort).
- `getProcessName` was exported but had zero in-repo call sites. Likely dead since a prior hint-scan refactor.

## Decisions

- **Supersede #3373.** It fixes ~60% of the bug. Three causes → one PR is easier to review and revert.
- **Coalesce (B2) over shared-flag (B1).** B1 silently drops hint scans; B2 guarantees a follow-up at the same worst-case latency.
- **`execFile` + `AbortController`, not shell `exec`.** Removes the `sh -c` wrapper that strands children. Signal delivery becomes deterministic.
- **Delete the two over-broad regexes.** Routine non-port text shouldn't trigger scans.

## Outcome

- `port-manager.ts`: +36 / −110
- `port-scanner.ts`: +52 / −40
- `port-manager.test.ts`: +255 (new, 13 tests)

A/B (mocked `lsof`): 100 hint-matching chunks during a 30 ms scan → ≤2 `lsof` calls, `maxInFlight == 1`. On `main`: unbounded concurrency.
