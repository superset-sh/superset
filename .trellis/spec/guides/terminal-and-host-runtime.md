# Terminal And Host Runtime

## Package Boundaries
- `packages/pty-daemon` owns live PTYs and is standalone. It must not import from `@superset/host-service` or other workspace packages; host-service consumes protocol types through `@superset/pty-daemon/protocol`.
- `packages/host-service` is the local machine service. It owns Hono routes, SQLite state, git/runtime managers, event bus, terminal WebSocket routes, and daemon supervision.
- `apps/desktop/src/main` coordinates Electron windows and packaged services. Renderer code talks to Electron main through tRPC from `apps/desktop/src/lib/trpc` and to host-service through typed clients.

## IPC And Subscriptions
Desktop Electron IPC uses tRPC. For `trpc-electron`, subscriptions must return observables, not async generators.

```ts
import { observable } from "@trpc/server/observable";

publicProcedure.subscription(() =>
  observable<MyEvent>((emit) => {
    const handler = (event: MyEvent) => emit.next(event);
    emitter.on("event", handler);
    return () => emitter.off("event", handler);
  }),
);
```

Source: `apps/desktop/CLAUDE.md` and `apps/desktop/src/lib/trpc/routers/index.ts`.

## PTY Byte Fidelity
- PTY input and output bytes ride in the pty-daemon frame binary payload tail. Do not base64 encode them inside JSON.
- Do not decode output with per-chunk `chunk.toString("utf8")` in the data path. The host-service observer path uses `StringDecoder` only for string callback compatibility.
- Primary terminal WebSocket output is binary; renderer/xterm consumes `Uint8Array`. Control messages remain JSON.
- Current slow-renderer handling is bounded buffering, not protocol ACK flow control. The daemon broadcasts output without `ack-output`; host-service closes a renderer socket once its buffered amount exceeds the configured cap, then the renderer reconnects and replays the bounded terminal tail.

### Scenario: Terminal Byte Transport And Slow Renderer Handling

1. Scope / Trigger
- Applies when editing `packages/pty-daemon`, `packages/host-service/src/terminal`, or desktop terminal WebSocket transport.

2. Signatures
- Daemon protocol: `InputMessage { type: "input"; id }` plus binary payload tail.
- Daemon protocol: `OutputMessage { type: "output"; id }` plus binary payload tail.
- Renderer socket: binary output frames plus JSON control frames (`attached`, `error`, `exit`, `title`).

3. Contracts
- Input/output bytes must remain byte-native end to end.
- Daemon subscribe messages use `{ replay: boolean }`; do not add renderer ACK state unless the protocol and tests are deliberately reintroduced.
- Slow renderer recovery is reconnect + replay, not daemon-side PTY pause/resume.

4. Validation & Error Matrix
- Missing daemon session -> protocol `error` with the session id.
- Oversized daemon frame -> decoder throws and closes the socket.
- Renderer socket buffer over cap -> host-service closes that renderer socket; PTY session stays alive.

5. Good/Base/Bad Cases
- Good: `daemon.input(id, Buffer.from(bytes))` writes bytes through the payload tail.
- Base: no renderer attached means host-service stores bounded replay bytes.
- Bad: base64 in protocol JSON, per-chunk UTF-8 output decoding, or resurrecting `output-ack` without matching daemon/client tests.

6. Tests Required
- `packages/pty-daemon/test/no-encoding-hops.test.ts` for byte path regressions.
- `packages/pty-daemon/src/protocol/*` for frame shape changes.
- `packages/host-service/test/integration/terminal.integration.test.ts` for real daemon lifecycle behavior.

7. Wrong vs Correct
- Wrong: treat output as strings or require renderer ACKs to keep the PTY running.
- Correct: keep bytes in binary frames, bound slow sockets, and rely on reconnect replay.

## Daemon Lifecycle
- The daemon runs under Node 20+ via Electron's bundled Node. Bun is the build/test tool, not the production daemon runtime.
- The Unix socket file mode `0600` is the auth boundary; do not add ad hoc in-band tokens to the pty-daemon protocol.
- Protocol version negotiation happens with `hello` and `hello-ack` in `packages/pty-daemon/src/protocol/messages.ts`.
- Upgrade handoff preserves live sessions by passing PTY master fds to a successor process. Preserve tests in `packages/pty-daemon/test/handoff.test.ts` and `packages/host-service/src/terminal/terminal.adoption.node-test.ts` when changing adoption.
- In desktop development, Electron spawns host-service children per organization and terminates them on app quit. PTY survival across host-service restarts comes from `packages/pty-daemon` adoption and replay, not from host-service itself. Treat "Electron closed but background work continues indefinitely" as a separate product/runtime requirement unless a task explicitly implements durable background supervision.

### Scenario: Workspace Terminal Session Discovery

#### 1. Scope / Trigger
- Applies when editing `terminal.listSessions`, `terminal.countBackgroundSessions`,
  remote workspace attach UI, daemon adoption, or anything that enumerates
  existing terminal sessions for a workspace.

#### 2. Signatures
- tRPC list:
  `terminal.listSessions({ workspaceId }) -> { sessions: TerminalSessionSummary[] }`.
- tRPC count:
  `terminal.countBackgroundSessions({ workspaceId, attachedTerminalIds }) -> { count: number }`.
- Daemon source:
  `DaemonSupervisor.listSessions(organizationId) -> SessionInfo[] | null`.
- SQLite source:
  `terminal_sessions.id`, `originWorkspaceId`, `status`, `createdAt`.

#### 3. Contracts
- Host-service memory (`listTerminalSessions`) is the best source for
  `attached`, title, and active renderer sockets when this process created or
  adopted the session.
- The pty-daemon is the source of truth for PTYs that stayed alive across a
  host-service restart or remote attach before any renderer websocket has
  adopted them.
- Workspace session discovery must merge memory sessions with daemon live
  sessions joined to active SQLite `terminal_sessions` rows.
- Listing/counting must not create a new PTY. It may probe the already
  supervised daemon, and it must fall back to memory-only results if daemon
  listing is unavailable.

#### 4. Validation & Error Matrix
- Daemon unavailable or no supervisor socket -> return memory sessions only.
- Daemon reports a live id with no SQLite row -> ignore it.
- SQLite row is `disposed`, `exited`, or has no `originWorkspaceId` -> ignore it.
- Session exists in both memory and daemon -> keep the memory summary.
- `attachedTerminalIds` contains a daemon-only session -> background count
  excludes it.

#### 5. Good/Base/Bad Cases
- Good: host-service restarted, daemon still owns a PTY, SQLite row is active;
  `terminal.listSessions({ workspaceId })` returns a detached attachable
  summary with the original `createdAt`.
- Base: daemon has no live sessions or is unreachable; existing local
  memory-backed terminal lists continue to work.
- Bad: list/count only reads the process-local `sessions` map, making remote
  clients see zero terminals until a websocket manually opens the terminal id.

#### 6. Tests Required
- Host-service integration test stubs daemon `SessionInfo[]`, seeds
  `terminal_sessions`, clears memory sessions, and asserts both
  `terminal.listSessions` and `terminal.countBackgroundSessions`.
- Resource-session join tests must cover active, disposed, exited, orphaned,
  unknown, non-live, and invalid-pid daemon rows.

#### 7. Wrong vs Correct

Wrong:

```typescript
sessions: listTerminalSessions({ workspaceId, includeExited: false });
```

Correct:

```typescript
const memorySessions = listTerminalSessions({ workspaceId, includeExited: false });
const daemonSessions = await getSupervisor().listSessions(ctx.organizationId);
// Merge daemon live ids through terminal_sessions before returning summaries.
```

## Local Startup And Runtime Gotchas

- Host-service local DB is per organization at `${SUPERSET_HOME_DIR}/host/<organizationId>/host.db`. The coordinator passes this as `HOST_DB_PATH`.
- In local development, host-service migrations come from `packages/host-service/drizzle`.
- Runtime native modules such as `better-sqlite3` should be exercised under the intended Node/Electron runtime. Bun is fine for repo scripts and tests, but it is not a substitute for the packaged host-service runtime when validating native SQLite behavior.
- If manual recovery is needed, inspect host-service logs and the SQLite DB directly before changing cloud rows. A cloud `v2Workspaces` row without a matching local `workspaces` row can still leave workspace-local panes unusable.
- Mastra persisted chat memory can store submitted user turns with role `signal`
  rather than `user`. Runtime restart/edit/resend logic should treat both roles
  as user-originated restart targets, and regression tests should cover the
  persisted `signal` shape.
- Electron-vite can split host-service modules into `apps/desktop/dist/main/chunks`.
  The bundled pty-daemon entry remains at `apps/desktop/dist/main/pty-daemon.js`,
  so daemon script resolution must check both the current bundle directory and
  one parent directory before falling back to `packages/pty-daemon/dist`.

## Bundled Runtime Path Resolution

- Treat `import.meta.url` in host-service code as the current compiled module
  location, not as the Electron main bundle root. Electron-vite can place
  imported host-service modules under `dist/main/chunks`, while sibling process
  entrypoints such as `pty-daemon.js` stay in `dist/main`.
- Runtime script resolvers should be small, pure, and unit-testable with an
  injectable base directory and existence check. Cover at least:
  - direct side-by-side bundle path
  - electron-vite `dist/main/chunks` path resolving one level up
  - source-running fallback path
  - explicit env override
- Terminal or agent-facing desktop acceptance must trigger the actual runtime
  path. For Claude/terminal changes, clicking a settings tab is not enough:
  create or attach a terminal/agent session, then verify host-service logs show
  the expected `pty-daemon.js` path and socket bootstrap.

## Source Examples
- `packages/pty-daemon/README.md` documents runtime, layout, testing, and out-of-scope items.
- `packages/pty-daemon/src/protocol/framing.ts` and `messages.ts` define wire format.
- `packages/pty-daemon/src/Server/Server.ts` implements handshake, flow control, replay, and handoff.
- `packages/host-service/src/terminal/terminal.ts` bridges daemon sessions to workspace terminal WebSockets.
- `apps/desktop/src/main/lib/host-service-coordinator.ts` coordinates packaged host-service lifecycle.
