# Host-service single-flight across concurrent app instances

Follow-up to PR #5787. Scope: `apps/desktop` main-process host-service coordinator.

## Problem

Multiple Superset app instances on one machine (stable + canary + dev worktree
builds) all share `$SUPERSET_HOME_DIR`. Each has its own in-process
`HostServiceCoordinator` whose `instances` map starts empty at boot, and each
independently runs `startAllKnown` → `start(org)` → `spawn` for **every** org
under `$SUPERSET_HOME_DIR/host/*`.

Result: the same org's host-service is spawned by several instances at once. The
duplicates contend for:
- the per-org `host.db` (SQLite WAL), and
- the pty-daemon unix socket (hashed by orgId only — see
  `project_ptyd_socket_shared_across_instances`), so concurrent same-org
  host-services can mutually reap each other's sessions.

The in-process `pendingStarts` / `instances` maps only single-flight **within**
one instance. There is no cross-process coordination.

## Goal

Single-flight host services **per org across concurrent instances on one
machine**. When instance B boots and instance A already has a healthy
host-service for an org, B adopts it (connects to A's port + secret) instead of
racing to spawn a duplicate. Handle stale locks after a crash, and make teardown
ownership-aware: never kill or de-manifest a host-service another live instance
spawned.

## Existing building blocks

- The **child** writes `manifest.json` (`pid`, `endpoint`, `authToken` = the
  PSK secret, `startedAt`, `organizationId`) once it is listening
  (`main/host-service/index.ts`). This already contains everything needed to
  adopt: endpoint (→ port) + secret.
- `pollHealthCheck(endpoint, secret, timeoutMs)` in `host-service-utils.ts`
  hits `/trpc/health.check` with the bearer secret.
- `isProcessAlive(pid)` in `host-service-manifest.ts`.
- The pty-daemon is supervised separately and **outlives host-service
  restarts**, so a brief host-service re-spawn does not drop terminals.

## Design

### 1. Cross-process spawn lock (new `host-service-lock.ts`)

An atomic exclusive-create lockfile per org at
`$SUPERSET_HOME_DIR/host/<org>/spawn.lock`, held only during the
spawn+health-check critical section.

- `acquireSpawnLock(org, { staleMs })`: `fs.openSync(path, "wx", 0o600)` (atomic
  O_EXCL on POSIX and Windows). On success, write
  `{ ownerPid: process.pid, machineId, acquiredAt: Date.now() }` and return a
  handle whose `release()` unlinks the file.
- On `EEXIST`, read the existing lock and decide:
  - unparseable/garbage → **steal** (unlink + retry once),
  - `ownerPid` not alive → **steal** (owner crashed mid-spawn),
  - `acquiredAt` older than `staleMs` → **steal** (owner wedged),
  - otherwise → return `null` (a live instance is legitimately spawning).
- `mkdir -p` the org dir before opening (the dir may not exist yet).

`ownerPid` is the **app instance's** (Electron main) pid, not the child's — the
lock's liveness tracks the spawner. `staleMs` ≈ `HEALTH_POLL_TIMEOUT_MS` + margin
(a legitimate spawn can hold the lock for the full health-poll window).

### 2. Adopt-first start flow (`host-service-coordinator.ts`)

Extend `HostServiceProcess` with `owned: boolean`.

New `tryAdopt(org)`:
1. `readManifest(org)`; bail if none.
2. Parse port from `endpoint` (`new URL(endpoint).port`).
3. `pollHealthCheck(endpoint, secret, ADOPT_HEALTH_TIMEOUT_MS)` — short (~2.5s),
   not the full 30s. Bail if unhealthy.
4. Register an in-process entry `{ pid, port, secret, status: "running",
   owned: false }`, `rememberPort`, emit `running`, return the connection.

Rework `startWithPreferredPorts`:
1. Fast path: in-process `running` entry. For an **adopted** entry, first
   re-validate with `isProcessAlive(pid)`; if the foreign child died, drop it and
   fall through. (Owned entries keep the child `exit` handler, so no check
   needed.)
2. In-process `pendingStarts` → return pending (unchanged).
3. Otherwise the pending promise is `startOrAdopt(org, config, preferredPorts)`:
   - `tryAdopt` → return if healthy.
   - Loop until an overall deadline (`staleMs + HEALTH_POLL_TIMEOUT + margin`):
     - `lock = acquireSpawnLock(org, staleMs)`:
       - **got lock** → double-check `tryAdopt` (another instance may have
         finished between our first check and lock acquisition); else
         `await this.spawn(...)` (owner = true). `finally lock.release()`.
       - **no lock** → a live instance is spawning: `tryAdopt`; if healthy,
         return. Otherwise `sleep(interval)` and retry the loop. Stale/dead-owner
         locks become stealable via `acquireSpawnLock`, so a wedged owner is
         eventually taken over.
   - Throw a clear timeout error if the deadline passes.

`spawn` is unchanged except it sets `owned: true` on the instance.

### 3. Ownership-aware teardown

- `stop(org)`:
  - **owned** → current behavior (SIGTERM the child, `removeManifest`, drop
    entry, emit `stopped`).
  - **adopted** → **only** drop the local entry + emit `stopped`. Never SIGTERM
    (that would kill a foreign live instance's child) and never `removeManifest`
    (the owner still needs it). This is the core "don't kill what another
    instance is using" requirement.
- `stopAll()` (before-quit / sign-out) naturally does the right thing per entry.
- `reset(org)` is an explicit user recovery command ("wedged host-service");
  it keeps its force-SIGKILL-by-manifest-pid semantics even for a foreign child,
  then respawns as owner. Documented.

### Known limitation (documented, follow-up)

If the **owner** instance quits while an **adopter** is still using the child,
the child dies (SIGTERM on the owner's `stopAll`, or its `HOST_PARENT_PID`
watchdog). The adopter recovers lazily: its next `start`/health failure re-runs
`startOrAdopt` and re-spawns (becoming the new owner). Because the pty-daemon
outlives host-service restarts, terminals survive the gap. True cross-instance
reference-counted survival is out of scope here.

## Files

- **new** `apps/desktop/src/main/lib/host-service-lock.ts` — `acquireSpawnLock`,
  `readSpawnLock`, lock-handle `release`.
- `apps/desktop/src/main/lib/host-service-coordinator.ts` — `owned` flag,
  `tryAdopt`, `startOrAdopt`, ownership-aware `stop`, adopted fast-path
  re-validation.
- `apps/desktop/src/main/lib/host-service-coordinator.ts` constants:
  `ADOPT_HEALTH_TIMEOUT_MS`, lock stale/deadline constants.

## Tests

- **`host-service-lock.test.ts`** (new): exclusive acquire; second acquire
  returns null while first held; steal on dead `ownerPid`; steal on stale
  `acquiredAt`; steal on garbage file; `release` unlinks and allows re-acquire.
- **`host-service-coordinator.test.ts`** (extend):
  - adopts a healthy foreign manifest without calling `spawn`;
  - does not adopt when the manifest health-check fails → spawns;
  - `stop` on an adopted entry does **not** SIGTERM and does **not**
    `removeManifest`; `stop` on an owned entry does both;
  - under-lock double-check adopts if a manifest appears after the first miss;
  - adopted fast-path drops a dead foreign entry and re-spawns;
  - existing `reset` / preferred-port tests still pass.

Each test is verified to fail against the pre-change behavior (mutation check).

## Result

Shipped as planned. PR: https://github.com/superset-sh/superset/pull/5791

- New `host-service-lock.ts` + `tryAdopt`/`startOrAdopt` + `owned` flag +
  ownership-aware `stop`, exactly as designed above.
- Tests: `host-service-lock.test.ts` (6) + 6 new coordinator tests — **18 pass**.
  Mutation-verified: broke the ownership branch, health gate, lock-steal
  condition, and adopted liveness re-check — each corresponding test failed.
- `bun run lint` clean · `bun run typecheck` 35/35.
- No production callers changed; `stop`/`stopAll`/`reset` keep their existing
  semantics for owned entries.

### Two-instance end-to-end verification

`apps/desktop/scripts/verify-single-flight.ts` drives the **real**
`HostServiceCoordinator` (real spawn lock, manifest, health check, and
process-liveness code) in **two separate OS processes** racing to start the same
org against an **isolated temp `$SUPERSET_HOME_DIR`** (only Electron + leaf deps
mocked; `spawn` overridden to launch a countable stand-in child + a real
localhost health server + write the real manifest — the host-service bundle
isn't built in a worktree). Run: `bun run apps/desktop/scripts/verify-single-flight.ts`.

Result (`✅ PASS`): one instance spawns, the other logs
`adopted existing host on port …` and connects to the **same port + secret**;
exactly **1** host-service child exists; the adopter's entry is `owned=false`.
Teeth-checked by breaking `tryAdopt` → both spawn → 2 children → `❌ FAIL`.
The harness is prod-safe (temp home only) and self-cleaning (removes the temp
dir + kills stand-ins in `finally`); confirmed the real `~/.superset/host` was
untouched and no processes leaked.
