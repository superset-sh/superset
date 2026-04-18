# Stop Excessive `lsof` Process Spawning (Issue #3372)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from AGENTS.md and the ExecPlan template at `.agents/commands/create-plan.md`.

## Purpose / Big Picture

Users report ([#3372](https://github.com/superset-sh/superset/issues/3372)) that Superset spawns a growing pile of `lsof` processes. Symptoms:

- CPU pinned to 100% after upgrades.
- Number of `lsof` processes grows with number of open workspaces.
- Closing workspaces does not help.
- Even **quitting Superset** leaves `lsof` processes behind.

After this change, opening N workspaces produces at most a bounded number of concurrent `lsof` invocations; closing all workspaces stops all port scanning; quitting Superset terminates every child process it started. The left-sidebar "Ports" feature continues to detect listening ports from terminal child processes with no user-visible regression.

Related ticket: [#3235](https://github.com/superset-sh/superset/issues/3235) (EDR/security agent CPU from idle terminals) — same kernel-level observation pattern: our background polling multiplies EDR inspection cost. Fixing this reduces EDR impact as well.

## Assumptions

1. All affected code paths live in `apps/desktop/src/main/lib/terminal/` (`port-manager.ts`, `port-scanner.ts`) plus their wiring in `daemon-manager.ts`. No renderer-side changes required.
2. The Ports sidebar feature is still desired; removing it is out of scope. We are optimizing, not deleting.
3. Users run macOS/Linux (the `lsof` path). Windows uses `netstat` and is not implicated in the bug report, but the same lifecycle fixes apply to its code path.
4. `pidtree` (used by `getProcessTree`) itself spawns `ps` children on macOS/Linux. Its cost counts too and must be considered when measuring scan frequency.
5. The periodic 2.5s interval is tolerable if bounded and lifecycle-correct; we do not need to eliminate polling entirely. A future enhancement could switch to event-driven scanning triggered only on PTY spawn/exit, but that is out of scope.

## Open Questions

1. Should we keep the hint-triggered scans at all? They were added to catch fast-starting dev servers between the 2.5s ticks. If we tighten regexes and guard concurrency, they stay useful. If they remain noisy, we can delete them entirely and rely on the periodic scan. **Proposal: tighten and keep.**
2. Do we want to switch from `exec` (shell-wrapped) to `execFile` / `spawn` with `detached: false` and direct signal delivery? **Proposal: yes — it fixes the orphan-on-timeout class of bugs for everyone.**
3. Does the existing auto-generated PR [#3373](https://github.com/superset-sh/superset/pull/3373) (by github-actions bot, commit `8a6b19b04`, branch `triage/issue-3372-24302327902`) get merged as-is, rebased, or superseded? **Proposal: supersede.** It fixes ~60% of the problem (lifecycle + concurrency) but leaves the orphan-on-timeout and loose-regex issues unaddressed. Cherry-pick its lifecycle changes into a fuller fix.

## Background: Prior Attempt

- **Who:** auto-created by the repo's triage workflow (`github-actions[bot]`) on 2026-04-12.
- **Where:** PR [#3373](https://github.com/superset-sh/superset/pull/3373), branch `triage/issue-3372-24302327902`, single commit `8a6b19b04`.
- **What it does:**
  1. Removes `startPeriodicScan()` from the `PortManager` constructor; starts the 2.5s interval lazily on first `registerSession`/`upsertDaemonSession`, stops it on the last `unregister*`.
  2. Adds `if (this.isScanning) return;` at the top of `scanPane()` so hint-triggered scans do not pile up on top of bulk scans.
  3. Early-exit in `scanAllSessions()` when no sessions exist.
- **What it does not fix:**
  - Orphaned `lsof` on `exec` timeout (root cause of "quitting Superset keeps the process open").
  - Over-eager hint regexes that fire on normal terminal output (`/port\s+(\d+)/i`, `/:(\d{4,5})\s*$/`).
  - Hint scans for different panes still run concurrently with each other (the `isScanning` guard only serializes hints vs. bulk).

## Root Cause Analysis

All three causes compound: the interval never stops, each tick may be joined by hint scans, and each resulting `lsof` can outlive its parent.

### Cause 1 — Interval started at module load, never stopped

`apps/desktop/src/main/lib/terminal/port-manager.ts:68-71`

```ts
constructor() {
  super();
  this.startPeriodicScan();
}
```

`PortManager` is exported as a module-level singleton (`port-manager.ts:504`). The 2.5s `setInterval` starts the instant the module is imported and has no call site that stops it. Closing all workspaces leaves the interval ticking, each tick running `scanAllSessions` → `buildPortsByPane` → `getListeningPortsForPids` → `exec("sh -c 'lsof …'")`.

### Cause 2 — No concurrency guard between hint scans and bulk scans

`port-manager.ts:187-212` (`scanPane`) has no check on `this.isScanning`. Every terminal data chunk flows through `daemon-manager.ts:194` → `portManager.checkOutputForHint(data, paneId)`. Matching regexes:

```ts
/listening\s+on\s+(?:port\s+)?(\d+)/i,
/server\s+(?:started|running)\s+(?:on|at)\s+(?:http:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)?:?(\d+)/i,
/ready\s+on\s+(?:http:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)?:?(\d+)/i,
/port\s+(\d+)/i,          // matches "port 22" in any log line
/:(\d{4,5})\s*$/,          // matches any line ending in :NNNN / :NNNNN
```

The last two are so loose they match routine `git`, `curl`, `ls -la`, `ssh` output. Each match schedules a 500ms-debounced hint scan per pane. With the bulk scan also running, multiple `lsof` invocations can overlap.

### Cause 3 — Orphan `lsof` processes outlive Superset

`port-scanner.ts:65-68`

```ts
await execAsync(
  `lsof -p ${pidArg} -iTCP -sTCP:LISTEN -P -n 2>/dev/null || true`,
  { maxBuffer: 10 * 1024 * 1024, timeout: EXEC_TIMEOUT_MS },
);
```

Two compounding issues:
1. `child_process.exec` launches `/bin/sh -c "<command>"`. On timeout, Node sends `SIGTERM` to the shell; the shell does **not** forward the signal to its `lsof` child. The `lsof` gets reparented to `init`/`launchd` and keeps running until it completes on its own — which on a busy macOS machine with many open FDs can take tens of seconds or longer.
2. When the Electron main process exits, any outstanding `lsof` (not yet reaped) is also reparented and survives. This matches the user's "exiting Superset keeps the process open" observation verbatim.

`lsof` on macOS walks every process's file table and every mounted volume; it is **expensive** and slow, which maximizes the window for both problems above.

## Design / Potential Solutions

We need all three classes of fix to close this issue correctly. Below are options per class with a recommendation.

### A. Lifecycle: stop the interval when idle

| Option | Pros | Cons | Pick |
| --- | --- | --- | --- |
| **A1.** Lazy start/stop keyed on session count (what PR #3373 does) | Small diff, correct, easy to test | None material | ✅ |
| A2. Move interval start into an explicit `PortManager.start()` called from app-ready, stop from app-quit | More explicit lifecycle | More touch points, no material win over A1 | — |
| A3. Event-driven only (no interval): scan on PTY spawn, on process exit, on hint | Removes polling entirely | Misses child processes that open ports without producing diagnostic output; more code paths | defer |

### B. Concurrency: bound the number of simultaneous `lsof` invocations

| Option | Pros | Cons | Pick |
| --- | --- | --- | --- |
| **B1.** Single shared `isScanning` flag covers both bulk and hint scans (extend PR #3373) | Trivial | Serializes unrelated panes behind one lock | ✅ as floor |
| **B2.** Coalesce hint scans into the next bulk scan (schedule a flag, not a scan) | At most one `lsof` in flight at a time; simplest correctness | Slight latency increase for detection (bounded by 2.5s) | ✅ preferred |
| B3. Per-pane `isScanning` + global semaphore of N=1 | More granular | More state to manage, same result as B2 | — |

Recommendation: **B2** — replace hint scans with a "pending full scan" flag. If a hint arrives while `isScanning`, set `scanRequested = true`. When bulk scan finishes, if `scanRequested` is set, immediately run another. This guarantees at most one `lsof` in flight and still catches events between ticks.

### C. Process lifecycle: no orphan `lsof`

| Option | Pros | Cons | Pick |
| --- | --- | --- | --- |
| **C1.** Switch `exec` → `execFile` (direct exec, no shell) + replace shell `|| true` with a try/catch on non-zero exit | Timeout sends SIGTERM directly to `lsof`; no orphan | Need to handle `exit code != 0` in JS instead of shell | ✅ |
| **C2.** Also wire an `AbortController` and call `abort()` on `app.before-quit` / scanner teardown to kill in-flight children | Belt-and-suspenders for app quit | More code | ✅ |
| C3. Keep `exec`, set `killSignal: "SIGKILL"` on timeout | Forces kill of shell, but child still reparents (shell is already dead) | Does not solve orphan | — |
| C4. Add a global `child_process` registry, kill all on quit | Works, but heavy | Same effect as C1 + C2, more invasive | — |

Recommendation: **C1 + C2**. `execFile` avoids the shell wrapper entirely; an `AbortController` stored on the `PortManager` tears down any in-flight scan when `stopPeriodicScan` runs or on app quit.

### D. Hint regex noise

| Option | Pros | Cons | Pick |
| --- | --- | --- | --- |
| **D1.** Delete `/port\s+(\d+)/i` and `/:(\d{4,5})\s*$/`. Keep only the three "listening/server/ready" patterns that actually imply a listener opened | Eliminates ~99% of spurious hints; remaining patterns still cover real dev servers | None — the loose patterns are false positives by design | ✅ |
| D2. Keep all patterns but require anchor at line start | Marginal improvement | Still matches lots of noise | — |
| D3. Delete hints entirely, rely on 2.5s bulk | Simplest | Loses fast-detection for dev servers (visible UX regression) | — |
| D4. Gate hints behind a feature flag | Reversible | Adds surface area without removing the bug | — |

Recommendation: **D1**.

### E. (Optional, follow-up) Reduce per-scan cost

Not required to close #3372 but cheap wins:
- Skip `lsof` entirely when all registered sessions have an empty process tree (check sizes before exec).
- Cache the previous result for ≤1 tick and diff only if PID set changed.
- Consider `/proc/net/tcp` on Linux as a faster alternative to `lsof` (out of scope for this plan).

## Recommended Plan of Action

A combined fix that supersedes PR #3373:

1. **Lifecycle (A1):** move `startPeriodicScan()` out of the constructor; add `ensurePeriodicScanRunning()` / `pausePeriodicScanIfEmpty()` driven by `registerSession`/`upsertDaemonSession`/`unregister*`.
2. **Concurrency (B2):** replace hint-triggered individual `scanPane` invocations with a "request one follow-up bulk scan" flag coalesced into `scanAllSessions`. Delete `forceScanPane`.
3. **Process lifecycle (C1 + C2):** rewrite `getListeningPortsLsof` (and `getListeningPortsWindows`) to use `execFile` with an `AbortSignal`. Store a shared `AbortController` on `PortManager`; abort on `stopPeriodicScan`. Register a `before-quit` handler in the main entry point to call `portManager.stopPeriodicScan()`.
4. **Regex noise (D1):** delete the two over-broad patterns from `containsPortHint`.
5. **Tests:** extend `port-manager.test.ts` to cover: interval stops when last session unregisters; restarts on re-register; a hint during an in-flight scan schedules exactly one follow-up; aborting the controller does not leak promises.
6. **Manual smoke:** open 10 workspaces, idle for 5 minutes, check `ps -ef | grep -c lsof` stays bounded; close all workspaces, confirm zero `lsof`; quit Superset, confirm zero `lsof`.

## Progress

- [x] (2026-04-17) Rewrite `PortManager` lifecycle (A1) — interval starts on first register, stops on last unregister
- [x] (2026-04-17) Coalesce hint → follow-up flag (B2) — `scanRequested` + debounced `scheduleHintScan`; deleted `scanPane`, `scanPidTreeAndUpdate`, `pendingHintScans`
- [x] (2026-04-17) Rewrite `port-scanner.ts` to use `execFile` + `AbortSignal` (C1) — `runTolerant` helper accepts lsof exit 1 as empty
- [x] (2026-04-17) Wire `AbortController` teardown on `stopPeriodicScan` (C2) — aborts in-flight lsof so it cannot outlive us
- [x] (2026-04-17) Delete over-broad patterns from `containsPortHint` (D1)
- [x] (2026-04-17) Unit tests (`port-manager.test.ts`) — 13 tests covering lifecycle, coalescing, regex narrowing, abort teardown; A/B-verified (8 fail on main)
- [x] (2026-04-17) Delete dead `getProcessName` export and unused `paneId` parameter
- [x] (2026-04-17) `bun run typecheck` + `bun run lint:fix` clean; 127/127 terminal tests pass
- [ ] Close/supersede PR #3373
- [ ] Manual validation on macOS with 10 workspaces
- [ ] PR opened, issue #3372 closed by merge

## Surprises & Discoveries

- Observation: `execFile` with `promisify` rejects on non-zero exit codes; `lsof` exits 1 when its `-p` filter matches no PIDs, which is a legitimate empty result. Added `runTolerant` helper that reads `err.stdout` off the rejection and returns it instead of throwing. Mirrors what the old `|| true` shell trick did, but without the shell wrapper.
  Evidence: `apps/desktop/src/main/lib/terminal/port-scanner.ts` `runTolerant`.

- Observation: The production `getListeningPortsLsof` has a top-level `try/catch` that swallows all errors and returns `[]`. The mock in tests must match this — our first pass had the mock reject on abort, which propagated up and broke `forceScan`'s contract.
  Evidence: `apps/desktop/src/main/lib/terminal/port-manager.test.ts` — `getListeningPortsForPids` mock resolves on abort.

- Observation: `getProcessName` was exported but had zero in-repo call sites (likely left behind when the hint-scan path was last refactored). Deleted along with the other changes.
  Evidence: `grep getProcessName apps/desktop` — only self-reference.

## Decision Log

- Decision: Supersede PR #3373 rather than merge it.
  Rationale: #3373 addresses lifecycle + concurrency (A1, B1) but leaves the orphan-on-timeout and noisy-regex causes intact. Closing the issue requires all three; a single PR is easier to review and revert than a stack of small ones.
  Date/Author: 2026-04-17 / Planning

- Decision: Coalesce hints into the bulk scan (B2) rather than gating with a shared flag (B1).
  Rationale: B1 silently drops hint scans during bulk scans, causing a detection gap up to 2.5s anyway. B2 guarantees a follow-up without concurrent `lsof`, same correctness, same worst-case latency.
  Date/Author: 2026-04-17 / Planning

- Decision: `execFile` + `AbortController`, not shell `exec`.
  Rationale: Removes the `sh -c` wrapper that strands `lsof` on timeout and on app exit. Makes signal delivery deterministic.
  Date/Author: 2026-04-17 / Planning

- Decision: Delete `/port\s+(\d+)/i` and `/:(\d{4,5})\s*$/` outright.
  Rationale: Both match routine non-port text (git logs, ssh banners, timestamps). The three remaining "listening/server/ready" patterns cover real dev-server startup lines. If users report missed detections we can add more-specific patterns.
  Date/Author: 2026-04-17 / Planning

## Outcomes & Retrospective

Implementation landed as a single focused change to `port-manager.ts` and `port-scanner.ts`:

- **port-manager.ts**: +36 / −110 lines. Lifecycle gated on session count; hint scans coalesced via a single debounced timer + `scanRequested` follow-up flag; private `AbortController` aborted on teardown.
- **port-scanner.ts**: +52 / −40 lines net. `execFile` instead of `exec` everywhere; `AbortSignal` threaded through the public surface; `runTolerant` helper for the lsof-exits-1 case; dead `getProcessName` export removed.
- **port-manager.test.ts**: +255 lines new. 13 tests covering lifecycle, coalescing, regex narrowing, and abort teardown. A/B-proven: stashing the port-manager/port-scanner changes and rerunning shows 8 of 13 tests fail on `main`.

A/B measurement (mocked `lsof`): a flood of 100 hint-matching data chunks during a 30 ms in-flight scan produces ≤2 total `lsof` calls and `maxInFlight === 1`. On `main`, the same inputs would produce many concurrent calls because hint scans bypassed the `isScanning` guard.

Supersedes PR #3373 (auto-generated by `github-actions[bot]`), which addressed lifecycle + a weaker concurrency guard but left the orphan-on-timeout and regex-noise causes unaddressed.
