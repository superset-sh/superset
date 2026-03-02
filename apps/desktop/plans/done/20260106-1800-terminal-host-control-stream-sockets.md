# Terminal Host Freeze Fix: Split Control vs Stream Sockets


## Purpose

Stop terminal creation from freezing the desktop app (macOS spinner) and eliminate the `Request timeout: createOrAttach` error by removing head‑of‑line blocking between high‑volume terminal output and low‑volume RPC requests.

After this change, opening a new terminal should remain responsive even if another terminal is spamming output (for example running `yes`), and `createOrAttach` should not be delayed by socket backpressure from terminal data streaming.


## Context

The desktop app uses a “terminal host daemon” (a persistent background Node process) that owns PTYs and a headless xterm emulator. The Electron main process talks to the daemon over a Unix domain socket using NDJSON (newline‑delimited JSON).

Today, a single socket carries two very different traffic patterns:

1. High‑frequency, high‑volume terminal output events (daemon → main).
2. Low‑frequency request/response RPC (main → daemon → main), including `createOrAttach`.

When any attached terminal produces output faster than the Electron client can consume, the daemon’s writes back up (`socket.write()` returns false). Because the same socket is also used for RPC responses, the `createOrAttach` response can be delayed behind queued output, which presents as:

1. A multi‑second UI stall while the renderer waits for the `createOrAttach` tRPC mutation to resolve.
2. Eventually, `Request timeout: createOrAttach` thrown by the main‑process daemon client after 30s.

This is classic head‑of‑line blocking caused by multiplexing dissimilar traffic onto one ordered byte stream.

### Why Protocol Negotiation Matters

In practice, users can end up with a stale daemon from an older app version still running (for example after an update, a crash, or having multiple installed versions). That means “daemon and client ship together” is not sufficient on its own: a new client must be able to detect and replace an old daemon cleanly, otherwise the socket path remains occupied and the new daemon cannot start.

This plan therefore includes explicit handling for protocol mismatches and partial connection failures.

Relevant code locations (for orientation):

- Daemon client timeout: `apps/desktop/src/main/lib/terminal-host/client.ts`
- Daemon server + handlers: `apps/desktop/src/main/terminal-host/index.ts`
- Session output backpressure log: `apps/desktop/src/main/terminal-host/session.ts`
- Main process terminal manager that calls daemon: `apps/desktop/src/main/lib/terminal/daemon-manager.ts`


## Scope

In scope:

- Introduce a protocol v2 that uses two separate Unix socket connections:
  - A “control socket” for request/response RPC (hello, createOrAttach, write, resize, detach, kill, listSessions, etc.).
  - A “stream socket” dedicated to daemon → main event streaming (terminal data/exit/error).
- Ensure `createOrAttach` attaches the stream socket to the session (so events flow) while returning the snapshot over the control socket (so the response is never blocked by streaming backpressure).
- Keep the renderer API and UI behavior unchanged (still uses existing tRPC mutations/subscriptions).
- Add tests that reproduce the backpressure scenario and prove `createOrAttach` is not delayed by a congested stream socket.
- Define upgrade / mismatch semantics for when the client connects to a daemon running an older protocol.

Out of scope (can be future work):

- Refactoring history persistence, locale detection, or port scanning (these are performance improvements but not the root cause).
- Changing renderer rendering/coalescing of terminal output.


## Assumptions

- The daemon and Electron main process are shipped together, so a protocol version bump is acceptable.
- The daemon already supports multiple client connections; we will formalize per‑connection “role” and a shared client identifier.
- The renderer cannot import Node.js modules (desktop rule); all socket work remains in `apps/desktop/src/main`.


## Open Questions

(None. Resolved during implementation; see Decision Log.)


## Decision Log

- Decision: Handle protocol mismatch by performing an authenticated v1 `shutdown` against the legacy daemon, then spawning a v2 daemon and retrying once.
  Rationale: In practice users can have a stale daemon from an older app version still running and occupying the socket path. Shutting it down avoids versioned socket paths, prevents multiple daemons from contending, and gives a deterministic recovery path for upgrades.
  Date/Author: 2026-01-06 / codex

- Decision: Use a shared `clientId` to pair a client’s control + stream sockets, generated once per `TerminalHostClient` instance.
  Rationale: The daemon needs a stable key to associate the two sockets. A per-client UUID is simple, avoids cross-client interference, and requires no renderer changes.
  Date/Author: 2026-01-06 / codex

- Decision: Keep `writeNoAck` (terminal input) on the control socket and keep the change unflagged; protocol version is the rollout gate.
  Rationale: Input is low-volume and latency sensitive and already has a best-effort path. A feature flag would add complexity for a daemon/client pair shipped together; protocol mismatch recovery + revert is the escape hatch.
  Date/Author: 2026-01-06 / codex


## Plan Of Work

### Milestone 1: Define protocol v2 (types + invariants)

Goal: Make the protocol express “this connection is control” vs “this connection is stream” and reliably pair the two connections that belong to the same app instance.

Changes:

- Update `apps/desktop/src/main/lib/terminal-host/types.ts`:
  - Bump `PROTOCOL_VERSION` from 1 to 2.
  - Extend `HelloRequest` to include:
    - `clientId: string` (generated once by the Electron main process and reused for both sockets).
    - `role: "control" | "stream"`.
  - Document the v2 invariants in comments:
    - Events must only be delivered on stream sockets.
    - RPC responses must only be delivered on control sockets.
    - `createOrAttach` must attach the stream socket before the snapshot boundary is chosen, so the snapshot excludes post‑attach output (avoids duplicates).
  - Define the explicit mismatch surface area the client will rely on:
    - Daemon returns `PROTOCOL_MISMATCH` with a message that includes both expected and received versions (already true today).

Acceptance (type level):

    bun run typecheck


### Milestone 2: Daemon server supports dual sockets

Goal: The daemon can accept two sockets per clientId, authenticate them, and use the stream socket for session attachment/event broadcast.

Changes:

- Update `apps/desktop/src/main/terminal-host/index.ts`:
  - Track client connections in a map keyed by `clientId`:
    - control socket (optional)
    - stream socket (optional)
    - authenticated flag(s) per socket
  - In `hello` handler:
    - Validate token and protocol version.
    - Record `clientId` and `role` on the socket’s clientState.
    - Store socket in the `clientsById` map for lookup.
    - Keep explicit version mismatch behavior:
      - If `protocolVersion !== 2`, respond with `PROTOCOL_MISMATCH` and do not register the client/socket.
  - Update `createOrAttach` handler:
    - Require role = control.
    - Look up the stream socket for the same clientId; if missing, return a clear error (e.g. `STREAM_NOT_CONNECTED`).
    - Pass the stream socket into terminal session attach logic so the stream socket becomes an attached client.
    - Return the snapshot payload on the control socket response.
  - Update `detach` handler:
    - Require role = control.
    - Detach the stream socket (not the control socket) from the session.
  - On socket close:
    - Remove the socket from the client map.
    - Keep existing `detachFromAllSessions(socket)` behavior, which will now primarily apply to stream sockets.

Acceptance (manual log sanity):

    SUPERSET_TERMINAL_DEBUG=1 ELECTRON_RUN_AS_NODE=1 bun run desktop:dev

Expected: daemon logs show two authenticated connections per app instance (control + stream), and session data events are only written to the stream socket.


### Milestone 3: Electron main daemon client uses two connections

Goal: The Electron main process establishes and maintains both sockets, sends RPC over control, and receives events over stream.

Changes:

Milestone 3 is the riskiest change; implement it in three sub‑milestones inside `apps/desktop/src/main/lib/terminal-host/client.ts` to keep it reviewable and testable.

#### Milestone 3.1: Establish two authenticated connections with shared clientId

Goal: `ensureConnected()` only returns when both sockets are connected and authenticated, and it tears down both sockets on any partial failure.

Changes:

- Generate a stable `clientId` when the singleton is created.
- Maintain `controlSocket` and `streamSocket` with independent connect timeouts.
- Add a unified “connected” state that means: both sockets exist, both are authenticated.
- On failure in either connect/auth step:
  - Close/destroy both sockets.
  - Reset state to disconnected.

#### Milestone 3.2: Route responses vs events to the correct socket

Goal: Remove accidental multiplexing in the client: control socket is only for request/response; stream socket is only for events.

Changes:

- Control socket parser only feeds `pendingRequests`.
- Stream socket parser only emits `data` / `exit` / `terminalError`.

#### Milestone 3.3: Define mismatch + restart behavior and mid-session failure semantics

Goal: Prevent “stale daemon blocks new client” and define what happens when a socket or daemon dies.

Changes:

- Protocol mismatch handling (upgrade path):
  - If control `hello` fails with `PROTOCOL_MISMATCH`, attempt a v1 shutdown sequence:
    - Connect and authenticate using `protocolVersion = 1` (legacy hello shape) on a temporary socket.
    - Send `shutdown`.
    - Disconnect, then spawn the v2 daemon and retry the v2 connect/auth flow.
  - If the v1 shutdown attempt fails, surface a clear error and instruct the user to restart (this should be rare).
- Daemon restart / socket death:
  - Treat either socket closing as “daemon connection lost” and tear down both sockets (simplest semantics).
  - Emit the existing `disconnected` event so `DaemonTerminalManager` can show the existing error UI.
  - Recovery happens the same way as today: the next `createOrAttach` / user “Retry Connection” will call `ensureConnected()` and re-establish both sockets.

Acceptance (unit/integration):

    bun test apps/desktop/src/main/lib/terminal-host


### Milestone 4: Prove the fix under backpressure (tests)

Goal: Add an automated test that fails on the current single‑socket design and passes with the split sockets, demonstrating that `createOrAttach` is not blocked by stream backpressure.

Test design:

- Start a daemon instance in test mode.
- Connect a stream socket and deliberately stop reading from it (`socket.pause()` or never attach a data handler) to create backpressure.
- Create a session that produces lots of output (write a large payload or run a command that floods output).
- In parallel, call `createOrAttach` for a new pane/session over the control socket.
- Assert that:
  - The `createOrAttach` response arrives within a small bound (for example < 500ms locally).
  - No `Request timeout: createOrAttach` occurs.

Implementation location:

- Prefer extending `apps/desktop/src/main/terminal-host/daemon.test.ts` or adding a new test file next to it, keeping the test focused on the socket protocol and not on renderer UI.

Acceptance:

    bun test apps/desktop/src/main/terminal-host/daemon.test.ts


### Milestone 5: Rollout safety + observability

Goal: Make it safe to ship and easy to diagnose.

Changes:

- Prefer not adding a feature flag unless release process requires it (flags add complexity and a second behavior to maintain). The protocol mismatch handling is the primary safety mechanism; rollback is via reverting the change and shipping a patch release.
- Improve debug logging (only when `SUPERSET_TERMINAL_DEBUG=1`):
  - Log connection roles and clientId.
  - Log when `createOrAttach` is rejected due to missing stream socket.

Acceptance (manual):

1. Reproduce “`yes` in one terminal then open another” and confirm no UI stall.
2. Kill the daemon process while the app is open, then use the terminal UI “Retry Connection” and confirm both sockets reconnect and output resumes.
3. (If a feature flag is added despite the preference above) confirm toggling the flag selects the expected code path.


## Validation

Run these from repo root:

    bun run typecheck
    bun run lint
    bun test

Manual reproduction (macOS):

1. Open a terminal and run:

    yes

2. Immediately open a new terminal tab/pane.

Expected after fix:

- The new terminal should open without a 5–10s spinner.
- No “Connection Error / Request timeout: createOrAttach” overlay appears.
- Daemon logs may still show stream backpressure warnings, but they should not block new `createOrAttach` responses.


## Idempotence And Rollback

Idempotence:

- Connecting both sockets should be safe to retry; repeated hello calls should either be rejected cleanly or treated as re‑auth without leaking session attachments.
- If a stream socket disconnects, existing sessions must remain alive; only streaming to that client stops.

Rollback:

- Feature flag fallback to the legacy single‑socket mode (if we decide to include it).
- If we do not include a flag, rollback is via reverting the protocol v2 commit(s) and shipping a patch release.


## Risks And Mitigations

Risk: Missing or mismatched pairing between control and stream sockets (wrong clientId).

Mitigation: Enforce a required `clientId` for protocol v2 and reject `createOrAttach` if no stream socket is registered for that clientId.

Risk: Duplicate or missing terminal output around initial attach.

Mitigation: Attach the stream socket and set the snapshot boundary in the same synchronous turn of `createOrAttach`, mirroring the existing single‑socket attach boundary logic.

Risk: Multi‑window behavior.

Mitigation: Treat each Electron main process instance (or window, if applicable) as a separate clientId; keep daemon mapping per clientId.


## Progress

- [x] (2026-01-06) Answer Open Questions and fill Decision Log.
- [x] (2026-01-06) Implement protocol v2 types.
- [x] (2026-01-06) Update daemon server for dual sockets.
- [x] (2026-01-06) Update main-process daemon client for dual sockets.
- [x] (2026-01-06) Add backpressure regression test.
- [x] (2026-01-06) Run validation commands and document manual reproduction.
- [x] (2026-01-06) Write Outcomes & Retrospective.


## Surprises And Discoveries

- Biome’s formatter surfaced pre-existing formatting drift in a few files; fixing formatting was required to get `bun run lint` passing.
- Spawning/tearing down a daemon per test was flaky due to shared socket path timing; switching to `beforeAll`/`afterAll` for daemon-backed integration tests stabilized them.


## Outcomes And Retrospective

Protocol v2 now uses two sockets per client instance: a low-volume control socket for request/response RPC and a high-volume stream socket for terminal output/exit/error events. This removes head-of-line blocking so `createOrAttach` responses are not delayed by backpressured terminal output.

Implementation highlights:

- The daemon pairs sockets by `clientId` and enforces `role` for each connection. `createOrAttach` returns the snapshot over the control socket but attaches the session to the stream socket.
- The main-process client establishes/authenticates both sockets and tears down both on any partial failure. On `PROTOCOL_MISMATCH`, it shuts down a legacy v1 daemon and respawns v2 once.
- Added an integration test that pauses the stream socket (simulated backpressure) and asserts `createOrAttach` latency stays bounded.

Validation:

    bun run typecheck
    bun run lint
    bun test apps/desktop/src/main/terminal-host/daemon.test.ts
    bun test apps/desktop/src/main/terminal-host/session-lifecycle.test.ts

Manual reproduction (recommended):

    # In one terminal tab in the app:
    yes
    # Then open a new terminal tab; it should still attach quickly and not time out.

Plan revision note: Updated this ExecPlan after implementation to record decisions, progress, validation, and outcomes.
