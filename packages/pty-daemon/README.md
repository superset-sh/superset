# @superset/pty-daemon

Long-lived PTY-owning process for the v2 desktop terminal. host-service is a
client over a Unix socket; routine host-service upgrades don't touch shells.

Implements [Phase 1 of the daemon plan](../../apps/desktop/plans/20260429-pty-daemon-implementation.md).
This package is **standalone**: it does not import from `@superset/host-service`
or any other workspace package. Host-service consumes only the protocol types
via `@superset/pty-daemon/protocol`.

## Runtime

**Production: Node ≥ 20** (Electron's bundled Node), via
`process.execPath` — exactly the same pattern as `host-service` already
uses today (`packages/host-service/build.ts` → `dist/host-service.js`,
spawned by `apps/desktop/src/main/lib/host-service-coordinator.ts`).
Bun is the build tool, not a runtime. **No new runtime in the desktop
app bundle.**

**Why not Bun at runtime:** verified during development that node-pty
1.1's master fd handling is incompatible with Bun 1.3 (`tty.ReadStream`
closes immediately, alternate `fs.createReadStream(null, { fd })`
returns EAGAIN with no recovery). The daemon needs a runtime where
node-pty actually works.

**Dev:** unit tests run under Bun (`bun test`) for speed; integration
tests run under Node (`bun run test:integration`) since they touch real
PTYs. The daemon binary itself runs under Node in both dev and prod.

## Layout

```
src/
├── main.ts                     # Node entrypoint: argv → Server.listen()
├── index.ts                    # Public exports for host-service consumers
├── protocol/                   # Wire schemas + length-prefixed framing
│   ├── version.ts              # CURRENT_PROTOCOL_VERSION + supported list
│   ├── messages.ts             # ClientMessage / ServerMessage unions
│   ├── framing.ts              # encodeFrame / FrameDecoder (4-byte BE prefix)
│   └── index.ts
├── Pty/                        # node-pty thin wrapper with dim validation
│   ├── Pty.ts
│   └── index.ts
├── SessionStore/               # in-memory map + 64KB ring buffer per session
│   ├── SessionStore.ts
│   └── index.ts
├── handlers/                   # pure functions: open/input/resize/close/list/subscribe
│   ├── handlers.ts
│   └── index.ts
└── Server/                     # AF_UNIX SOCK_STREAM accept loop, handshake, dispatch
    ├── Server.ts
    └── index.ts

test/
├── helpers/
│   └── client.ts               # reusable DaemonClient: connect, send, waitFor, collect
├── integration.test.ts         # smoke / happy-path (3 tests)
└── control-plane.test.ts       # exhaustive control-plane coverage (25 tests)

build.ts                        # Bun bundler → dist/pty-daemon.js (target: node)
```

## Design notes

- **Stateless from the client's perspective.** Every protocol call carries
  full context. No client tracking, no session tombstones, no business
  rules. Single design principle from
  [the implementation plan](../../apps/desktop/plans/20260429-pty-daemon-implementation.md#the-single-design-principle).
- **Auth boundary = Unix socket file mode 0600.** No in-band tokens. The
  daemon trusts whoever can open the socket.
- **Buffer is in-memory only.** Survives host-service restarts (because the
  daemon does), but never persisted to disk. No SQLite, no scrollback files.
  v1's `HistoryManager` is explicitly out of scope.
- **Protocol versioned from day one.** Handshake (`hello` / `hello-ack`)
  picks the highest mutually supported version.

## Testing

```sh
bun test                     # 24 unit tests (protocol framing, handlers, SessionStore, Pty validation)
bun run test:integration     # 28 integration tests under node --test:
                             #   - test/integration.test.ts (smoke / happy-path, 3 tests)
                             #   - test/control-plane.test.ts (every usage pattern, 25 tests)
bun run typecheck            # tsc --noEmit
bun run build:daemon         # bundle src/main.ts → dist/pty-daemon.js (target: node)
```

**Control-plane coverage** (`test/control-plane.test.ts`):

- Handshake: rejects non-hello first, picks highest mutual protocol, rejects unsupported, rejects duplicate hello.
- Session lifecycle: invalid dims, duplicate ids, ENOENT on missing, instant-exit shells, SIGKILL on hung shells.
- I/O patterns: resize during running shell, burst output (200 lines), multi-byte UTF-8 (🚀).
- Multi-client fan-out: two subscribers see same output, unsubscribe stops further delivery, dropped subscriber doesn't crash daemon.
- Detach + reattach (the headline feature): late subscriber gets replay, full reattach cycle continues live after disconnect.
- list reflects active sessions with cols/rows/alive.
- Hostile input: malformed frames disconnect cleanly, oversized frames are rejected, input on exited session returns EEXITED.
- Concurrency: 20 sessions in parallel from one connection, 10 connections opening sessions in parallel.
- Server shutdown: in-flight clients disconnect cleanly, owned PTYs are killed.
- Framing: tolerates split frames across multiple TCP chunks.

Why two runners? `bun test` is fast for pure-JS work. node-pty doesn't work
under Bun, so anything that spawns a real PTY runs under Node.

## Running locally

```sh
bun run start --socket=/tmp/pty-daemon.sock
```

Logs go to stderr; stdout stays empty (so the daemon can later be supervised
by host-service with stdout reserved for protocol or kept dark).

## Out of scope (Phase 1)

- Host-service integration (DaemonClient, terminal.ts refactor, manifest
  adoption) — separate PR.
- Daemon-upgrade handoff via `child_process.spawn` `stdio` fd inheritance
  — separate PR (Phase 2 of the plan).
- Windows ConPTY — not in v1 protocol; defer until Windows users justify it.
