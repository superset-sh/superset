# pty-daemon Implementation Report

**Status:** Phase 1 implemented; awaiting review.
**Date:** 2026-04-30
**Branch:** `pty-daemon-host-integration`
**PR:** #3896
**Plan:** `20260429-pty-daemon-implementation.md`

Concise audit of every change against the plan. Each deviation has a
**DECISION** marker with the choice you need to make: accept the
deviation (and I'll update the plan), revert to plan (and I'll update
the code), or defer.

## TL;DR

- **Architecture:** as planned — daemon outlives host-service via
  manifest-based adoption, identical lifetime model to host-service.
- **Tests:** 65 across 4 layers (24 daemon unit + 30 daemon
  control-plane + 5 host-side DaemonClient + 6 host-service E2E).
- **Plan-compliance:** 18 decisions correctly implemented as specified;
  6 deviations from the plan (most are improvements or pragmatic
  trade-offs); 7 explicit plan items not done; 1 wrong assertion of
  mine that this report corrects.
- **Operationally ready:** the architecture is correct; the
  observability and failure-mode hooks the plan called out (telemetry,
  crash supervision) are not yet wired.

## What shipped

```
packages/pty-daemon/
├── src/
│   ├── main.ts                       # Node entry: argv → Server.listen
│   ├── index.ts                      # public exports
│   ├── protocol/
│   │   ├── version.ts                # CURRENT_PROTOCOL_VERSION + supported list
│   │   ├── messages.ts               # ClientMessage / ServerMessage unions
│   │   ├── framing.ts                # encodeFrame / FrameDecoder
│   │   └── index.ts
│   ├── Pty/Pty.ts                    # node-pty wrapper + dim validation
│   ├── SessionStore/SessionStore.ts  # in-memory map + ring buffer per session
│   ├── handlers/handlers.ts          # open/input/resize/close/list/subscribe
│   └── Server/Server.ts              # AF_UNIX accept loop, handshake, dispatch
├── test/
│   ├── helpers/client.ts             # reusable DaemonClient
│   ├── integration.test.ts           # smoke (3 tests)
│   └── control-plane.test.ts         # exhaustive (30 tests, 11 suites)
└── build.ts                          # Bun.build target=node → dist/pty-daemon.js

packages/host-service/src/terminal/
├── DaemonClient/
│   ├── DaemonClient.ts               # Unix-socket client w/ multi-subscriber fan-out
│   └── DaemonClient.node-test.ts     # 5 integration tests under node:test
├── daemon-client-singleton.ts        # lazy DaemonClient singleton
├── terminal.ts                       # refactored to use DaemonClient (was node-pty.spawn)
└── terminal.adoption.node-test.ts    # 6 E2E tests under Electron-as-Node

apps/desktop/src/main/
├── lib/
│   ├── pty-daemon-coordinator.ts     # spawn/adopt; sibling of HostServiceCoordinator
│   └── pty-daemon-manifest.ts        # manifest read/write helpers
└── pty-daemon/index.ts               # main entry that registers in electron.vite.config.ts
```

Source: ~870 LOC daemon, ~270 LOC DaemonClient, ~250 LOC coordinator.
Tests: ~1100 LOC across 4 layers.

## Plan-compliance audit

### ✅ Correctly implemented as specified (18)

| # | Plan decision | Verified by |
|---|---|---|
| 1 | Architecture E (daemon now, fd-handoff Phase 2 deferred) | Code structure |
| 2 | Daemon runtime: Node + node-pty | `build.ts`, `bin` field, `engines.node` |
| 3 | Daemon scope: pure PTY runtime, stateless from client perspective | No HTTP/auth/DB/business logic anywhere in `packages/pty-daemon/src` |
| 4 | Transport: AF_UNIX SOCK_STREAM + length-prefixed binary frames | `protocol/framing.ts`, `Server/Server.ts` |
| 5 | Auth: Unix socket file mode 0600 | `Server.listen()` chmod |
| 6 | In-memory ring buffer per session, ~64 KB | `SessionStore.ts` |
| 7 | All v1 anti-patterns omitted (HistoryWriter, cold restore, tombstones, EventEmitter, dedup, priority semaphore, ANSI parsing, sticky state, deferred-cleanup setTimeout) | Grep |
| 8 | Per-session snapshot on attach (pid, cols, rows, alive) | `open-ok` + `list-reply` messages |
| 9 | Resize bounds validation | `Pty.ts:validateDims` |
| 10 | Signal abstraction as strings | Protocol message types |
| 11 | Graceful shutdown ordering | `Server.close()` |
| 12 | Versioned handshake | `protocol/version.ts` + Server dispatch |
| 13 | Renderer code zero changes | No diffs in `apps/desktop/src/renderer` |
| 14 | PSK auth boundary unchanged at host-service | Hono WS upgrade unchanged |
| 15 | terminalSessions DB table unchanged; daemon never touches DB | Daemon has no `better-sqlite3` import |
| 16 | Daemon binary bundled via electron-vite alongside host-service | `electron.vite.config.ts:115` adds entry; outputs `dist/main/pty-daemon.js` |
| 17 | node-pty version pinned (1.1.0) | `package.json` |
| 18 | **Daemon outlives host-service restart and app quit; killed only on explicit restart (and dev-mode reload by HostServiceCoordinator's enableDevReload)** | `tryAdopt()` finds detached daemon at next launch; no `before-quit` hook |

### ⚠️ Deviations from the plan (6) — DECISIONS NEEDED

#### Deviation #1: Host-side ring buffer kept

- **Plan:** "Move the ring buffer entirely to the daemon. host-service no longer holds replay state; it asks the daemon for replay-on-attach via `subscribe { replay: true }`."
- **What I did:** Kept the 64 KB host-side buffer (`terminal.ts:64,101-102,206-225`) for in-process fan-out to multiple WS subscribers. The daemon also has its own 64 KB buffer; that one is the cross-restart source of truth.
- **Why:** Removing the host buffer would require either (a) a separate daemon subscription per WS connection, or (b) buffer-aware replay logic that re-asks the daemon on each WS attach. Keeping the host buffer is the smallest, most behaviour-preserving change.
- **Trade-off:** Two layers of 64 KB buffers per session. Memory cost is negligible. The deviation removes one of the v1-bloat rationales (host should be stateless re PTY data plane), but only partially.
- **DECISION:**
  - [ ] **A: Accept deviation** — update the plan to reflect "host-side fan-out buffer + daemon source-of-truth buffer."
  - [ ] B: Revert to plan — remove host buffer, add per-WS daemon subscriptions in a follow-up.
  - [ ] C: Defer to a cleanup PR; ship as-is.

#### Deviation #2: Per-organization daemon (not per-workspace)

- **Plan:** "Per-workspace daemon (mirrors current host-service-per-workspace)."
- **What I did:** Per-organization daemon, exactly mirroring `HostServiceCoordinator` which is keyed by `organizationId`.
- **Why:** The plan's parenthetical claim is wrong: host-service is per-organization, not per-workspace. I matched real host-service.
- **DECISION:**
  - [ ] **A: Accept deviation** — fix the plan to say "Per-organization, mirroring host-service-per-organization."
  - [ ] B: Revert to plan — refactor to per-workspace (no production reason to do this; would create N daemons per org).

#### Deviation #3: Manifest `startedAt` is epoch ms, not ISO 8601 string

- **Plan:** `startedAt: string` ISO 8601.
- **What I did:** `startedAt: number` epoch ms, matching `HostServiceManifest`.
- **DECISION:**
  - [ ] **A: Accept deviation** — keep epoch ms, fix the plan.
  - [ ] B: Revert to plan — switch to ISO string. (Trivial change; no real impact either way.)

#### Deviation #4: Protocol module split into 3 files

- **Plan:** single `protocol/protocol.ts`.
- **What I did:** `protocol/version.ts`, `protocol/messages.ts`, `protocol/framing.ts`.
- **Why:** Cleaner separation of concerns; tests only need to import what they use.
- **DECISION:**
  - [ ] **A: Accept deviation** — update the plan to show three files.
  - [ ] B: Revert — collapse into one file. (No real benefit; current shape is more readable.)

#### Deviation #5: Adoption check skips protocol-version verification

- **Plan:** "If PID alive **and socket connectable and protocol version compatible** → adopt."
- **What I did:** Adoption checks PID alive + socket connectable; **does not** connect-and-handshake to verify protocol compatibility before adopting.
- **Why:** v1 is the only protocol; pure overhead today. The check matters when Phase 2 introduces a v2 binary alongside v1 daemons.
- **DECISION:**
  - [ ] **A: Accept until Phase 2 lands** — flag this in the plan as deferred.
  - [ ] B: Implement now — costs ~30 LOC; trivial. Adds a connect/handshake/disconnect cycle to every adoption.

#### Deviation #6: `subscribe` / `unsubscribe` as explicit protocol ops

- **Plan:** ops list mentioned `subscribe-output` (one op).
- **What I did:** `subscribe` (with `replay: bool`) and `unsubscribe` as separate ops; daemon supports multi-subscriber fan-out per session.
- **DECISION:**
  - [ ] **A: Accept deviation** — update the plan to show both ops.
  - [ ] B: Revert — collapse to one op. (No real benefit; current shape is the minimum needed for renderer reattach + observer mode.)

### ❗ Plan items NOT done (7)

| # | Plan item | Status | Risk if shipped without |
|---|---|---|---|
| 1 | **Telemetry: 6 events** (`pty_daemon_spawn/adopt/session_open/session_exit/crash`, `host_service_restart_sessions_preserved`) | None wired | **Can't measure success or detect crashes.** The headline metric of the entire project is unobservable. |
| 2 | Daemon crash supervision: "3 crashes in 60s → stop respawning, surface to user" (Open Decision #3 in plan) | Not implemented; coordinator doesn't even auto-respawn after exit | Daemon crashes mid-session = silent terminal death until host-service restart |
| 3 | host-service crash integration test (real `kill -9` + verify renderer reattaches) | Adoption tested via `__resetSessionsForTesting`, not real `kill -9` | Real-world signal handling (no graceful close events) untested |
| 4 | Daemon crash integration test | Not explicitly tested | Same gap |
| 5 | Linux + macOS x86_64 Phase 0 / Phase 1 verification | Not done; macOS arm64 only | Architecture is portable but unverified — defer until shipping to those platforms |
| 6 | Daemon-disconnect → close terminal WS streams | `daemon-client-singleton.ts` clears its cache but doesn't close ws sockets to the renderer | Renderer thinks the terminal is alive; input silently fails |
| 7 | `/tmp/superset-ptyd-*.sock` sweep on coordinator init | Not done | Cosmetic; `/tmp` accumulates over time |

**DECISION:** for each, mark **before ship** / **after ship** / **never** to set scope:
  - [ ] #1 telemetry — recommended **before ship**
  - [ ] #2 crash supervision — recommended **before ship**
  - [ ] #3, #4 crash tests — recommended **before ship**
  - [ ] #5 Linux verification — recommended **before shipping to Linux**
  - [ ] #6 disconnect → close WS — recommended **before ship**
  - [ ] #7 `/tmp` sweep — recommended **after ship** or **never** (cosmetic)

### ❗ Decisions I made that weren't in the plan (5)

| # | What I decided | Why | Plan should mention? |
|---|---|---|---|
| 1 | Socket path in `os.tmpdir()/superset-ptyd-<12hex>.sock`, not `$SUPERSET_HOME_DIR/host/<orgId>/pty-daemon.sock` | Darwin's 104-byte `sun_path` limit; original path was 159+ chars in dev | **Yes** — add to plan as the reason for this path |
| 2 | Adoption-on-EEXIST path in `createTerminalSessionInternal` | Race: host-service restart finds daemon already has the session id; bare `daemon.open` errors with EEXIST → tight loop until adopted | **Yes** — add as a critical post-restart code path |
| 3 | `__resetSessionsForTesting()` test escape hatch exported from production `terminal.ts` | Needed for in-process e2e testing of the adoption path | **Maybe** — note the test-only contract |
| 4 | Daemon's `handleOpen` recycles already-`exited` session entries (drops dead entry, spawns fresh); live entries still EEXIST | Without this, dispose-then-recreate-with-same-id loops forever — late-subscriber replay needs the entry to stick around after exit, but a fresh `open` should not see it as a collision | **Yes** — small protocol semantic to document |
| 5 | Initial-command suppression on adoption (`initialCommandQueued: isAdopted`) | Without this, setup.sh would re-run on every host-service restart for setup terminals | **Yes** — document |

**DECISION:** for each `Yes`, I'll update the plan if you accept.

### ❌ Wrong assertion I made earlier

In the prior "shippability" assessment I said:

> "App-quit lifecycle for the daemon ⚠️ — should fix before ship: daemon should be killed when user quits app."

This is **wrong**. The plan and `HOST_SERVICE_LIFECYCLE.md` specify the daemon **outlives app quit** (manifest-based adoption picks it up next launch — same model as host-service). Only `enableDevReload` in `HostServiceCoordinator` tears down running services for hot-reload during dev.

Action: do **not** add a `before-quit` hook; the current behavior is correct.

## Five-question summary you can answer in one pass

| # | Question | Recommendation |
|---|---|---|
| 1 | Accept all 6 plan deviations? (host-side buffer, per-org daemon, manifest format, protocol split, adoption proto-version skip, subscribe/unsubscribe ops) | **Yes**, update plan |
| 2 | Wire telemetry before ship? | **Yes** (~50 LOC, the project's headline metric is currently unobservable) |
| 3 | Wire daemon crash supervision before ship? | **Yes** (~80 LOC, agreed crash policy isn't actually implemented) |
| 4 | Wire daemon-disconnect → close WS streams before ship? | **Yes** (~30 LOC, otherwise silent terminal failure) |
| 5 | Add real `kill -9` integration tests? | **Yes** (~40 LOC of test code) |

If you say yes to all five: ~200 LOC of additional production code + ~100 LOC of tests. Roughly half a day. Then this is genuinely shippable to users.

## What's currently in PR #3896

7 commits on `pty-daemon-host-integration`:

1. `9bdbf7b85` feat(host-service): DaemonClient — Unix-socket client for pty-daemon
2. `b1eb105f0` feat(desktop): pty-daemon coordinator + manifest + main entry
3. `401e203fe` feat(host-service): route terminal sessions through pty-daemon
4. `b387324e1` fix(desktop): make pty-daemon spawn failure non-fatal for host-service
5. `df81d8b15` fix(desktop): allow .env / shell to provide SUPERSET_PTY_DAEMON_SOCKET
6. `2e8d2167e` debug(desktop): surface daemon spawn failures with log tail + child exit code
7. `05ae50c20` fix(desktop): use short /tmp path for pty-daemon socket (Darwin sun_path)
8. `aae131eb3` fix(host-service): adopt existing daemon sessions on host-service restart
9. `2bbb0846c` test(pty-daemon): replay-on-exited-session edge case
10. `525d3ec94` test(host-service): full E2E adoption test under Electron-as-Node
11. `a6f09d36a` fix(pty-daemon) + test(host-service): three more edge cases

## Status flag

Once you've made the five decisions above, this report becomes
**signed-off** and I update the implementation plan to match the
final accepted state.
